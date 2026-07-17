import bcrypt from "bcryptjs";
import crypto from "crypto";
import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { getTemplatePermissionsForRole } from "../permission/permission.service.js";
import { resolveCustomerIdByEmailDomain } from "../customer/customer.service.js";
import User from "./user.model.js";

const SALT_ROUNDS = 10;

/**
 * Creates a new user account — the one place this logic lives. Called from
 * the admin-gated POST /auth/register route (auth.controller.js); there is no
 * separate copy of this logic in the auth module. Permissions are always
 * seeded from the role's CURRENT template (§7.12), never from a caller-
 * supplied value. `customerId` is only meaningful for `role: "customer"` —
 * normally set automatically via self-signup (`createCustomerSelfSignupUser`
 * below), this admin-facing path just lets an admin set/fix it manually too.
 */
export async function createUser({ name, email, phone, password, role, managerId, customerId }) {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, "A user with this email already exists");
  }

  if (managerId) {
    await ensureValidManagerId(managerId);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const permissions = await getTemplatePermissionsForRole(role);

  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role,
    managerId: managerId || null,
    customerId: customerId || null,
    permissions,
  });

  return user;
}

/**
 * Customer Portal self-signup (§7.8) — the ONLY way a `role: "customer"`
 * account normally gets created (as opposed to every other role, which is
 * always admin-created via `createUser` above). Verified by an email-domain
 * match against an existing `Customer`/`Contact` record
 * (customer.service.js#resolveCustomerIdByEmailDomain) rather than an admin
 * grant — anyone whose email domain matches a known client company can
 * create their own portal account. Rejected (400, matching this codebase's
 * existing validation-error convention — no endpoint here uses 422) with a
 * clear message when no match is found, rather than creating an unlinked
 * `customer` account with a null `customerId` that could never see anything.
 */
export async function createCustomerSelfSignupUser({ name, email, password }) {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, "A user with this email already exists");
  }

  const customerId = await resolveCustomerIdByEmailDomain(email);

  if (!customerId) {
    throw new ApiError(
      400,
      "No matching company found for this email domain — please contact your account manager."
    );
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const permissions = await getTemplatePermissionsForRole("customer");

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "customer",
    customerId,
    permissions,
  });

  return user;
}

/**
 * A manager can only ever be someone with role "manager" or "admin" —
 * enforced both here (create) and in updateUser/assignManager.
 */
async function ensureValidManagerId(managerId) {
  const manager = await User.findById(managerId);

  if (!manager) {
    throw new ApiError(400, "managerId does not match an existing user");
  }

  if (manager.role !== "manager" && manager.role !== "admin") {
    throw new ApiError(400, "managerId must belong to a user with role manager or admin");
  }
}

/**
 * Resolves which users the requesting user is allowed to see, the same
 * union-of-held-grants approach as location.service.js#resolveVisibleEmployeeIds:
 * view_all → everyone; view_team → direct reports (+ self); neither → depends
 * on the caller. There is no plain "view" tier in the permission registry
 * (unlike location) — but every caller can always see at least themselves.
 *
 * `fallbackToSelf` controls what happens with no view_team/view_all grant:
 * - listUsers passes `true` — a roster listing with no grant still returns a
 *   1-item list containing just the caller, mirroring GET /auth/me's
 *   unconditional self-visibility rather than erroring on an otherwise
 *   ordinary "list my stuff" request.
 * - getUserById passes `false` (the default) — looking up a *specific other*
 *   person's id with no grant at all is a 403, not silently narrowed to self;
 *   getUserById already short-circuits the caller's own id before this is
 *   ever called, so this branch only fires for someone else's id.
 */
async function resolveVisibleUserFilter(requestingUser, { fallbackToSelf = false } = {}) {
  if (can(requestingUser, "users", "view_all")) {
    return {};
  }

  if (can(requestingUser, "users", "view_team")) {
    const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");
    const visibleIds = teamMembers.map((member) => member._id);
    visibleIds.push(requestingUser._id);
    return { _id: { $in: visibleIds } };
  }

  if (fallbackToSelf) {
    return { _id: requestingUser._id };
  }

  throw new ApiError(403, "You do not have permission to view users");
}

/**
 * Full roster listing with optional filters. `scope=team` (or any manager
 * without view_all) naturally resolves to "my direct reports" via the same
 * managerId scoping used everywhere else (§11.9) — no separate team concept.
 * No route-level permission gate (see user.routes.js) — a caller with no
 * users.* grant still gets a valid, if minimal, list back (see
 * resolveVisibleUserFilter's fallbackToSelf above).
 */
export async function listUsers(filters, requestingUser) {
  const scopeFilter = await resolveVisibleUserFilter(requestingUser, { fallbackToSelf: true });
  const roleFilter = filters.role ? { role: filters.role } : {};
  const isActiveFilter =
    filters.isActive !== undefined ? { isActive: filters.isActive === "true" || filters.isActive === true } : {};
  const managerIdFilter = filters.managerId ? { managerId: filters.managerId } : {};

  const combinedFilter = {
    $and: [scopeFilter, roleFilter, isActiveFilter, managerIdFilter],
  };

  return User.find(combinedFilter).sort({ name: 1 });
}

/**
 * A user can always fetch their own record, regardless of any users.* grant
 * (matching GET /auth/me's unconditional self-access). Anyone else is scoped
 * by resolveVisibleUserFilter — 403 with no grant at all, 404 if the target
 * simply isn't in scope (matching the Leads/Location precedent for not
 * leaking whether an out-of-scope record exists).
 */
export async function getUserById(targetId, requestingUser) {
  if (String(targetId) === String(requestingUser._id)) {
    return requestingUser;
  }

  const scopeFilter = await resolveVisibleUserFilter(requestingUser);

  // $and, not a plain spread: scopeFilter can itself be keyed on `_id`
  // (the view_team branch is `{ _id: { $in: [...] } }`), and a spread would
  // silently let that key clobber the explicit `_id: targetId` constraint —
  // unlike Leads' ownership filter, which scopes by a separate `ownerId`
  // field and never collides with `_id` this way.
  const user = await User.findOne({ $and: [{ _id: targetId }, scopeFilter] });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
}

/**
 * Lightweight picker list for other modules' "assign to" dropdowns (Leads
 * owner, Customer project manager, etc.) — id/name/role only, active users
 * only. Deliberately not gated by users.* — this is low-sensitivity reference
 * data needed broadly, the same reasoning as GET /lead-sources (§7.1).
 */
export async function listUsersForDropdown() {
  return User.find({ isActive: true }).select("_id name role").sort({ name: 1 });
}

// Exported so user.validation.js can enforce the same restriction at the
// validation layer too — a deliberate duplication (defense in depth), not an
// accidental one; see the comment there. `baseSalary` (added 2026-07-13,
// §7.7 Payroll) is treated the same as role/managerId/isActive — admin-only,
// not self-editable, for the obvious reason that letting anyone set their
// own salary would defeat the entire point of the field. `customerId`
// (§7.8, Customer Portal) is admin-only for the same reason a customer
// portal user relinking themselves to a different company would be a
// security hole, not a convenience — it's normally set once, automatically,
// at self-signup (createCustomerSelfSignupUser), never edited by the user.
export const PRIVILEGED_FIELDS = ["role", "managerId", "isActive", "baseSalary", "customerId"];
const SELF_EDITABLE_FIELDS = ["name", "email", "phone"];

/**
 * A user may always update their own name/email/phone. role/managerId/
 * isActive are admin-only, even on your own record — those aren't part of
 * the "edit your own basic info" carve-out. This is an ownership check, not
 * a can() permission tier (the same reasoning as Leads' ownerId scoping),
 * which is why it's resolved here in the service rather than via a route
 * middleware that can't express "self OR admin."
 */
export async function updateUser(targetId, payload, requestingUser) {
  const isSelf = String(targetId) === String(requestingUser._id);
  const isAdmin = requestingUser.role === "admin";

  if (!isSelf && !isAdmin) {
    throw new ApiError(403, "You do not have permission to update this user");
  }

  const attemptedPrivilegedField = PRIVILEGED_FIELDS.find((field) => payload[field] !== undefined);

  if (attemptedPrivilegedField && !isAdmin) {
    throw new ApiError(403, `Only an admin can update "${attemptedPrivilegedField}"`);
  }

  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (isAdmin && payload.managerId) {
    await ensureValidManagerId(payload.managerId);
  }

  const editableFields = isAdmin ? [...SELF_EDITABLE_FIELDS, ...PRIVILEGED_FIELDS] : SELF_EDITABLE_FIELDS;

  editableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      user[field] = payload[field];
    }
  });

  await user.save();

  return user;
}

export async function setUserActiveStatus(targetId, isActive) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.isActive = isActive;
  await user.save();

  return user;
}

/**
 * Admin override for a user's password (§7.13) — route-level `requireAdmin`
 * is the only permission gate, same as deactivate/reactivate above. Two
 * modes, both admin-initiated (unlike the self-service forgot/reset-password
 * flow in auth.service.js, which is token-based and never touches this
 * function):
 *
 * - `newPassword` supplied: the admin sets the exact password directly.
 * - omitted: the backend generates a random one-time temp password and
 *   returns it in the response, the ONLY time it's ever visible in plaintext
 *   — nothing persists it anywhere outside this one response. Chosen as the
 *   default-friendly path (e.g. "reset this locked-out user's password" from
 *   the User Management screen with a single click) over forcing the admin
 *   to invent and type a password themselves every time; an admin who wants
 *   to set a specific password still can via `newPassword`.
 */
export async function adminResetPassword(targetId, newPassword) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const tempPassword = newPassword || crypto.randomBytes(9).toString("base64url");

  user.passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  return { user, tempPassword: newPassword ? null : tempPassword };
}

/**
 * Sets or clears (managerId = null) a user's manager. A non-null managerId
 * must belong to a manager or admin — same rule as createUser.
 */
export async function assignManager(targetId, managerId) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (managerId === null || managerId === undefined) {
    user.managerId = null;
  } else {
    await ensureValidManagerId(managerId);
    user.managerId = managerId;
  }

  await user.save();

  return user;
}
