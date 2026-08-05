import ApiError from "../../utils/ApiError.js";
import { PERMISSION_REGISTRY } from "../../constants/permissionRegistry.constants.js";
import RolePermissionTemplate from "./permission.model.js";
import User, { USER_ROLES } from "../user/user.model.js";

/**
 * Starting values for each role's template, generated from the permission
 * matrix in .context/final-plan.md §5 — every ✅ there becomes a `true`
 * grant here. Only used once, the first time a role's template is lazily
 * created; after that, the template in the database is the source of truth
 * and this constant is never consulted again for that role.
 */
const INITIAL_TEMPLATE_DEFAULTS = {
  admin: {},
  manager: {
    leads: { view: true, create: true, edit: true, delete: true },
    location: { view_team: true },
    users: { view_team: true },
    // Added 2026-07-13 alongside the customer module (§7.2/§7.3). A manager
    // manages their own team's customer portfolio and can assign project
    // teams — credentials.view is included since managers routinely need the
    // vault (hosting/domain logins) to support their accounts.
    customers: { view: true, create: true, edit: true, delete: true },
    credentials: { view: true },
    projects: { view: true, assign_team: true },
    // Added 2026-07-13 (full Phase 3, §7.4/§7.5). A manager needs to see
    // their team's attendance — the same managerId-based "own team" scoping
    // as everywhere else.
    attendance: { view_team: true },
    // `approve`/`decline`/`mark_unapproved_absence` added 2026-07-31 (§7.5c)
    // — reverses this same task's earlier "view only, admin approves" default
    // (the parenthetical in this comment used to say exactly that). A
    // manager now decides on their own direct reports' leave requests
    // directly, scoped to their own team the same way `view_team` already
    // is (leave.service.js#ensureCanActOnLeave) — admin keeps org-wide
    // access to all three regardless of team, unchanged.
    // `view`/`delete` added 2026-07-31 (§7.5d, same day) — a manager needs
    // to see their OWN past leave requests too (the frontend's restructured
    // "Own"/"Team" tabs for this role need a real `view` grant to back the
    // "Own" tab, which manager never had before this — `view_team` alone
    // only ever covered seeing OTHER people's requests). `delete` reuses the
    // exact same `ensureCanActOnLeave` team-scoping as approve/decline/
    // mark_unapproved_absence — a manager can delete their own team's
    // requests, admin any request org-wide.
    leave: {
      view: true,
      view_team: true,
      approve: true,
      decline: true,
      mark_unapproved_absence: true,
      delete: true,
    },
    // Added 2026-07-13 (§7.6, Phase 6) — same reasoning as attendance/leave
    // above: a manager can see their team's travel logs, own team scoping.
    travelLogs: { view_team: true },
    // Added (§7.8, Phase 5) — a manager is "PM" per smartrays.md's "internal
    // visibility into portal-raised tickets is Admin/PM only," so they get
    // the same create/assign/view_all as admin (admin bypasses can()
    // entirely anyway, so this is really the manager-specific grant).
    tickets: { create: true, assign: true, view_all: true },
    // Added (§7.10, Phase 7) — "own team" per §5's matrix: a manager can
    // view/manage AMC records for customers owned by themselves or their
    // direct reports, resolved via the underlying Customer's ownership
    // (amc.service.js#resolveAMCOwnershipFilter), not a separate ownerId on
    // AMC itself. No `payments` grant at all — that matrix row is "–" for
    // every role except admin.
    amc: { view: true, edit: true },
    // Added 2026-08-05 — read-only visibility into the team(s) this manager
    // personally heads, so "who is on my team" is answerable in the UI
    // without granting the admin-only `teams.manage` tier. See the registry's
    // own comment for why this is deliberately not a write grant.
    teams: { view_team: true },
  },
  sales_associate: {
    leads: { view: true, create: true, edit: true, delete: true },
    location: { view: true },
    // A sales associate closes deals and converts leads to customers, so
    // they need create/edit on their own customers — but not credentials
    // vault access (that stays manager/admin) or project team assignment.
    customers: { view: true, create: true, edit: true, delete: true },
    // Same default as `employee` below — every non-admin, non-manager role
    // gets to view (not approve) their own leave requests.
    leave: { view: true },
    // Added 2026-07-13 (§7.6) — viewing their own travel log history.
    travelLogs: { view: true },
    // Deliberately NO `payroll` grant (§7.7, Payroll) — §5's matrix marks
    // `payroll.view/run` as "–" for Sales Associate explicitly, the same
    // "–" it uses for Manager; only Employee gets "own payslip only". An
    // earlier version of this file misread that "–" as an unspecified/blank
    // cell and granted `payroll.view` here to match Employee — that was
    // wrong, corrected 2026-07-13 to match the matrix exactly.
    // Added (§7.10, Phase 7) — "own" per §5's matrix: a sales associate can
    // view/manage AMC records only for customers they themselves own,
    // resolved the same way manager's "own team" tier is (via the
    // underlying Customer's ownership, not a separate AMC ownerId).
    amc: { view: true, edit: true },
  },
  employee: {
    location: { view: true },
    // An employee works inside projects — no customers/credentials access by
    // default, just enough to see the projects they're on.
    projects: { view: true },
    // Added 2026-07-13 (§7.5) — viewing your own leave requests. There's no
    // equivalent `attendance.view` grant needed here: unlike `leave`,
    // Attendance's own-record access (GET /attendance/me) is unconditional,
    // not gated by a permission tier at all.
    leave: { view: true },
    // Added 2026-07-13 (§7.6) — same reasoning as `leave` above: viewing
    // your own travel logs (auto-generated from your own check-in/out) is
    // gated behind a real grant, not unconditional the way Attendance's own
    // record is.
    travelLogs: { view: true },
    // Added 2026-07-13 (§7.7, Payroll) — "own payslip only" per §5's matrix.
    payroll: { view: true },
    // Added (§7.8, Phase 5) — "view assigned" per §5's matrix: an employee
    // sees (and works) only tickets assigned to them, no `create` grant —
    // employees don't raise tickets themselves in this design, only
    // admin/manager (internally) or a customer (via the portal) do.
    tickets: { view_assigned: true },
  },
  // Added (§7.8, Phase 5) — a Customer Portal account's entire default grant:
  // raise their own tickets and see only their own company's ticket history.
  // Nothing else — no access to any other module (leads/customers/projects/
  // attendance/etc.) is ever appropriate for an external customer account.
  customer: {
    tickets: { create: true, view_own: true },
  },
};

export function getRegistry() {
  return PERMISSION_REGISTRY;
}

// The 4 roles `INITIAL_TEMPLATE_DEFAULTS` actually defines grants for.
// `admin` is deliberately excluded — its template is always `{}` (admin
// bypasses `can()` entirely regardless of what's stored) and reconciling it
// would be a meaningless no-op at best.
export const RECONCILABLE_ROLES = ["manager", "sales_associate", "employee", "customer"];

/**
 * Fixes `RolePermissionTemplate` drift (2026-08-03, discovered auditing the
 * §7.5c/§7.5d Leave fixes — see backend/README.md's dated write-up for the
 * full incident). A role's template is lazily seeded ONCE from
 * `INITIAL_TEMPLATE_DEFAULTS` and read verbatim from the database forever
 * after (`getOrCreateTemplate`'s own doc, above) — editing this constant in
 * code has zero effect on a template that already existed before the edit
 * shipped. Twice this session, a real permission action was added to a
 * role's code default and silently never reached the live database until
 * caught by hand and patched via a one-off `PATCH /permissions/templates/:role`
 * call. This reconciles that gap structurally, not just for this one
 * incident:
 *
 * - Any module/action key present in `INITIAL_TEMPLATE_DEFAULTS[role]` but
 *   ABSENT from the stored template gets added, using the code's default
 *   value — this is exactly the §7.5c/§7.5d bug, generalized.
 * - Any module/action key stored in the template that no longer exists
 *   ANYWHERE in `PERMISSION_REGISTRY` gets removed — genuinely dead data,
 *   the same class of issue as the orphaned `employee.tasks` key left behind
 *   when Task functionality was fully removed (2026-07-29) but this
 *   template, never touched since its original 2026-07-17 seeding, never
 *   got the memo.
 *
 * Deliberately NOT touched: any key that already exists in the stored
 * template, regardless of its value. A manager who's had `leave.approve`
 * customized to `false` (or any other admin-edited value, whether via
 * `updateTemplate` or a per-user override) keeps exactly that — this only
 * ever adds a key that's missing outright, or removes one that's invalid
 * outright. It never overwrites an existing value, so a genuine admin
 * customization can never be silently reverted by this running.
 */
export async function reconcileRoleTemplate(role) {
  const template = await getOrCreateTemplate(role);
  const codeDefaults = INITIAL_TEMPLATE_DEFAULTS[role] || {};
  const permissions = structuredClone(template.permissions || {});
  const added = [];
  const removed = [];

  for (const [module, actions] of Object.entries(codeDefaults)) {
    if (!permissions[module]) {
      permissions[module] = {};
    }

    for (const [action, defaultValue] of Object.entries(actions)) {
      if (!(action in permissions[module])) {
        permissions[module][action] = defaultValue;
        added.push(`${module}.${action}`);
      }
    }
  }

  for (const module of Object.keys(permissions)) {
    const validActions = PERMISSION_REGISTRY[module];

    if (!validActions) {
      removed.push(...Object.keys(permissions[module]).map((action) => `${module}.${action}`));
      delete permissions[module];
      continue;
    }

    for (const action of Object.keys(permissions[module])) {
      if (!validActions.includes(action)) {
        removed.push(`${module}.${action}`);
        delete permissions[module][action];
      }
    }

    // Drop a module emptied out by the removal above too, rather than
    // leaving a dangling `{}` behind.
    if (Object.keys(permissions[module]).length === 0) {
      delete permissions[module];
    }
  }

  if (added.length === 0 && removed.length === 0) {
    return { role, added, removed, changed: false };
  }

  template.permissions = permissions;
  await template.save();

  return { role, added, removed, changed: true };
}

/**
 * Runs `reconcileRoleTemplate` for every reconcilable role. Idempotent by
 * construction — a second run immediately after the first finds every key
 * already present/valid and reports `changed: false` for all four.
 */
export async function reconcileAllRoleTemplates() {
  const results = [];

  for (const role of RECONCILABLE_ROLES) {
    // Sequential, not Promise.all — these are simple, infrequent (once per
    // process) writes; no need for the concurrency, and sequential logging
    // below reads in a stable, predictable order.
    results.push(await reconcileRoleTemplate(role));
  }

  const changed = results.filter((result) => result.changed);

  if (changed.length === 0) {
    console.log("[permission] Role template reconciliation: all templates already match code defaults.");
  } else {
    changed.forEach((result) => {
      console.log(
        `[permission] Role template reconciliation — "${result.role}": added [${result.added.join(", ") || "none"}], removed [${result.removed.join(", ") || "none"}]`
      );
    });
  }

  return results;
}

let reconciliationPromise = null;

/**
 * Boot-time entry point — cached across calls the same way
 * `database/connection.js#connectDatabase` caches its connection, and for
 * the identical reason: this app runs on Vercel's serverless runtime
 * (`api/index.js`) where every request can be a fresh cold start, so without
 * caching this would re-run (and re-hit the database four times) on every
 * single request in production. Call this from both `server.js` (local/
 * traditional hosting boot) and `api/index.js` (serverless — reconciles once
 * per cold start, a no-op on every warm invocation after that); whichever
 * entry point actually runs a given process reconciles it, the other's call
 * just awaits the same cached settled promise.
 */
export function reconcileRoleTemplatesOnBoot() {
  if (!reconciliationPromise) {
    reconciliationPromise = reconcileAllRoleTemplates().catch((error) => {
      // Never let a reconciliation failure crash the server over what's
      // fundamentally a hygiene pass, not a request in the critical path.
      // Reset the cache so the next call can retry rather than permanently
      // caching a rejection, matching connectDatabase's own behavior.
      reconciliationPromise = null;
      console.error("[permission] Role template reconciliation failed:", error.message);
    });
  }

  return reconciliationPromise;
}

/**
 * Returns a role's template, lazily creating it with the initial defaults if
 * it doesn't exist yet — same pattern as LeadSource (§7.1).
 */
export async function getOrCreateTemplate(role) {
  const existingTemplate = await RolePermissionTemplate.findOne({ role });

  if (existingTemplate) {
    return existingTemplate;
  }

  return RolePermissionTemplate.create({
    role,
    permissions: INITIAL_TEMPLATE_DEFAULTS[role] || {},
  });
}

export async function listTemplates() {
  return Promise.all(USER_ROLES.map((role) => getOrCreateTemplate(role)));
}

/**
 * Full replace, not a deep merge — the submitted permissions object becomes
 * the template's entire permissions object. Only affects users created after
 * this call; existing users keep whatever they already have.
 */
export async function updateTemplate(role, permissions, adminUser) {
  const template = await getOrCreateTemplate(role);

  template.permissions = permissions;
  template.updatedBy = adminUser._id;

  await template.save();

  return template;
}

export async function getUserPermissions(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user.permissions;
}

/**
 * Full replace, not a deep merge — matches updateTemplate's semantics.
 */
export async function updateUserPermissions(userId, permissions) {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.permissions = permissions;
  await user.save();

  return user;
}

/**
 * Overwrites a user's permissions with their role's CURRENT template,
 * discarding any per-user customization — reads the template fresh at call
 * time, not whatever it looked like when the user was created or last
 * customized.
 */
export async function resetUserPermissions(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const template = await getOrCreateTemplate(user.role);

  // Deep clone — see getTemplatePermissionsForRole for why.
  user.permissions = structuredClone(template.permissions);
  await user.save();

  return user;
}

/**
 * Called from user.service.js#createUser at account-creation time. Reads
 * the role's CURRENT template — never a hardcoded default — so editing a
 * template only ever affects users created after the edit.
 */
export async function getTemplatePermissionsForRole(role) {
  const template = await getOrCreateTemplate(role);

  // Deep clone so the new user's permissions object is independent of the
  // template's — mutating one later must never accidentally affect the other.
  return structuredClone(template.permissions);
}
