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
    tasks: { view: true, assign: true },
    // Added 2026-07-13 (full Phase 3, §7.4/§7.5). A manager needs to see
    // their team's attendance and leave requests (to view, though only
    // admin can approve/mark-unapproved-absence) — the same managerId-based
    // "own team" scoping as everywhere else.
    attendance: { view_team: true },
    leave: { view_team: true },
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
    // An employee works tasks inside projects — no customers/credentials
    // access by default, just enough to see and work their own tasks.
    projects: { view: true },
    tasks: { view: true },
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
