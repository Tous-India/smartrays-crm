/**
 * Structural list of every module and its valid permission actions. NOT
 * admin-editable — it only grows when a developer builds a new module and
 * wires up the routes/services that actually check these actions via can().
 * Used to validate RolePermissionTemplate edits and per-user permission
 * overrides (.context/final-plan.md §7.12) so a typo or a stale action for a
 * since-removed check can't silently do nothing, and so a future frontend
 * can render permission toggles from one source of truth.
 */
export const PERMISSION_REGISTRY = {
  leads: ["view", "create", "edit", "delete"],
  location: ["view", "view_team", "view_all"],
  permissions: ["manage"],
  // No plain "view" tier — a user's own record is always reachable via
  // GET /auth/me and the self-bypass in user.service.js#getUserById, so a
  // separate "view own" grant would be redundant. See §5/user module notes.
  users: ["view_team", "view_all"],
  // Added 2026-07-13 alongside the customer module (§7.2). Ownership/team
  // scoping for view/edit/delete works the same way as `leads` — resolved in
  // customer.service.js, not a separate permission tier per scope level.
  customers: ["view", "create", "edit", "delete"],
  // Deliberately just one action, not four — the reference spec and §7.2 only
  // ever describe a single "can see the credentials vault at all" gate,
  // required on top of customers.view (viewing) or customers.edit (managing
  // entries) — see customer.service.js. No separate reveal-specific action;
  // credentials.view already covers reveal, per §7.2.
  credentials: ["view"],
  // `assign_team` gates POST /projects/:id/team (§7.3: "team members addable
  // by Manager/Admin only") — implemented as a real permission grant (manager
  // + admin get it by default) rather than a hardcoded role check, consistent
  // with this codebase's Single Source of Truth for Auth principle (§4.1).
  projects: ["view", "assign_team"],
  // `assign` gates POST /tasks (creating/assigning a new task, a manager/admin
  // action per §7.3). Starting/stopping your OWN task is an ownership check
  // resolved in project.service.js (assignedToId === requestingUser._id, or
  // admin) — not a separate permission tier, the same reasoning as Leads'
  // ownerId-based edit scoping.
  tasks: ["view", "assign"],
  // Added 2026-07-13 (full Phase 3 build, §7.4). No plain "view" tier — same
  // reasoning as `users`: an employee's own attendance is always reachable
  // via GET /attendance/me with no gate at all, so a "view own" grant would
  // be redundant. This is specifically for viewing OTHER employees' records
  // (GET /attendance/team, GET /attendance/report).
  attendance: ["view_team", "view_all"],
  // Added 2026-07-13 (§7.5). Mirrors `location`'s three-tier shape exactly —
  // GET /leave?scope=own|team|all checks the matching action per requested
  // scope, unlike location's implicit union-of-grants view. Requesting your
  // own leave (POST /leave/request) needs no grant at all, the same
  // "self-service action" reasoning as Attendance check-in/out.
  leave: ["view", "view_team", "view_all"],
  // Added 2026-07-13 (§7.6, Phase 6). Same three-tier shape as `leave` —
  // GET /travel-logs?scope=own|team|all checks the matching action per
  // requested scope. `GET /travel-logs/report` uses view_team/view_all only
  // (mirrors attendance's report gate). Logging your own travel
  // (POST /travel-logs) needs no grant at all — self-service, same reasoning
  // as Attendance check-in/out and Leave's request endpoint; logging on
  // behalf of someone else is a structural role+relationship check in
  // travelLog.service.js, not a permission tier.
  travelLogs: ["view", "view_team", "view_all"],
  // Added 2026-07-13 (§7.7, Phase 4). Only two actions, not three — Payroll
  // has no `team` tier at all: `view` (own payslip only, GET
  // /payroll?scope=own) and `run` (admin-only in practice; also reused as
  // the "see everyone's payroll" gate for scope=all, since §5's matrix never
  // lists a separate view_all for this module). Manager gets neither —
  // deliberate, salary data is more sensitive than attendance/leave/travel
  // data, unlike every other workforce module which gives managers a
  // view_team tier.
  payroll: ["view", "run"],
  // Added (§7.8, Phase 5). Five actions, matching §5's matrix exactly:
  // `create` (raise a ticket — admin/manager internal-raise, or customer
  // portal self-raise) and `assign` (admin/manager only) come from the
  // matrix's combined "tickets.create/assign" row; `view_all` (admin/manager,
  // sees everything including portal-raised tickets — smartrays.md: internal
  // visibility into portal tickets is Admin/PM only), `view_assigned`
  // (employee — only tickets assigned to them), and `view_own` (customer —
  // only their own company's tickets) come from the matrix's
  // "tickets.view.all" row, split into three distinct scope tiers the same
  // way Leave/TravelLog/Payroll each split "view" into per-scope actions.
  // `sales_associate` gets none of these — the matrix marks both ticket rows
  // "–" for that role.
  tickets: ["create", "assign", "view_all", "view_assigned", "view_own"],
  // Added (§7.9, Phase 7). Admin only per §5's matrix — every other role is
  // "–", so no manager/sales_associate/employee/customer default exists at
  // all for this module (unlike every ownership-scoped module above).
  payments: ["view", "create"],
  // Added (§7.10, Phase 7). Only two actions — §5's matrix lists "amc.view/edit"
  // as one combined row, no separate create action (creating an AMC record is
  // gated by `edit`, the same "manage" reasoning `customers.edit` already
  // uses for its own sub-resources). Manager gets "own team", sales_associate
  // gets "own" — both resolved via AMC's underlying Customer.ownerId (AMC has
  // no ownerId of its own), reusing customer.service.js#getVisibleCustomerIds
  // rather than duplicating the ownership-scoping logic. Employee/customer
  // get neither — matrix marks both "–".
  amc: ["view", "edit"],
};
