import bcrypt from "bcryptjs";
import crypto from "crypto";
import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { getTemplatePermissionsForRole } from "../permission/permission.service.js";
import { resolveCustomerIdByEmailDomain } from "../customer/customer.service.js";
import User from "./user.model.js";
import Team from "../team/team.model.js";
import Lead from "../lead/lead.model.js";
import DeletedUserAuditLog from "./deletedUserAuditLog.model.js";

// Leads in either of these statuses are historically closed — they don't
// need reassignment before their owner can be deactivated, only leads still
// actually open do. Shared by both `getDeactivationImpact` and
// `setUserActiveStatus` below so the two can never disagree on what counts.
const CLOSED_LEAD_STATUSES = ["won", "lost"];

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
 * enforced both here (create) and in updateUser/assignManager. Exported so
 * team.service.js can enforce the exact same rule for a Team's
 * `headManagerId` rather than a second copy of this check.
 */
export async function ensureValidManagerId(managerId) {
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

  // `teamId` (§7.28) resolves to that Team's `headManagerId` and filters by
  // `managerId` matching it — the same derived-membership mechanism every
  // other "own team" query already uses (§11.9), not a second concept. A
  // nonexistent teamId matches nothing rather than throwing, the same
  // forgiving-filter convention `status`/`role` filters elsewhere already
  // follow.
  let teamFilter = {};
  if (filters.teamId) {
    const team = await Team.findById(filters.teamId);
    teamFilter = team ? { managerId: team.headManagerId } : { _id: null };
  }

  const combinedFilter = {
    $and: [scopeFilter, roleFilter, isActiveFilter, managerIdFilter, teamFilter],
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

/**
 * What needs reassigning before `targetId` can be deactivated (§7.31,
 * 2026-07-31) — `GET /users/:id/deactivation-impact`. Two independent
 * things can block a clean deactivation: leading one or more active Teams,
 * and owning one or more still-open Leads (`CLOSED_LEAD_STATUSES` excluded
 * — a won/lost lead is historically closed, nobody needs to "take over" it).
 * `memberCount` per team mirrors `team.service.js#listTeams`'s own derived
 * count exactly, so this never disagrees with what the Teams screen itself
 * would show.
 */
export async function getDeactivationImpact(targetId) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const ledTeams = await Team.find({ headManagerId: targetId, isActive: true }).select("name headManagerId");
  const teamsLed = await Promise.all(
    ledTeams.map(async (team) => ({
      _id: team._id,
      name: team.name,
      memberCount: await User.countDocuments({ managerId: team.headManagerId }),
    }))
  );

  const ownedLeadsCount = await Lead.countDocuments({
    ownerId: targetId,
    status: { $nin: CLOSED_LEAD_STATUSES },
  });

  return { teamsLed, ownedLeadsCount };
}

/**
 * Deactivating (not reactivating — that's always safe, no guard below) a
 * user who currently leads one or more active Teams or owns one or more
 * still-open Leads no longer hard-blocks the way it used to (§7.28) — a
 * deliberate reversal (§7.31, 2026-07-31): instead of forcing the admin to
 * go reassign things elsewhere first, this same call can carry
 * `reassignments.reassignTeamsTo` (`{ teamId: newHeadUserId, ... }`, one
 * entry per led team) and `reassignments.reassignLeadsTo` (a single userId
 * every still-open lead's `ownerId` moves to), and does the reassignment
 * itself before deactivating.
 *
 * With nothing to reassign (no led teams, no open leads), this behaves
 * exactly as before — no reassignment info needed, straight to deactivated.
 *
 * When something DOES need reassigning: every led team must have an entry
 * in `reassignTeamsTo`, and if there's at least one open lead,
 * `reassignLeadsTo` must be supplied — anything missing is rejected (400)
 * naming exactly what's still unresolved, the same clear-error-naming-
 * specifics principle the old hard-block guard used. Only once everything
 * required is present is each new head validated (`ensureValidManagerId`)
 * and the new lead owner confirmed to exist — ALL validation happens before
 * ANY write, so an invalid id can never leave a half-applied reassignment.
 *
 * Order of writes once validated: team-head reassignment, then lead-owner
 * reassignment, then the deactivation itself — chosen so a failure partway
 * through (an infrastructure error, not a validation one, since validation
 * already happened) never leaves the user deactivated without their
 * teams/leads actually having been reassigned first. **Not wrapped in a
 * Mongo transaction** — checked first: this app's dev/test database
 * (`mongodb-memory-server`, standalone, no replica set — see
 * `tests/helpers/testDb.js`) does not support multi-document transactions
 * at all, only the production Atlas cluster does, so wrapping this in
 * `session.withTransaction()` would break the entire test suite for this
 * feature while working fine in production — an inconsistency worse than
 * the (small, validated-before-write) risk this ordered-writes approach
 * accepts instead.
 */
export async function setUserActiveStatus(targetId, isActive, reassignments = {}) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!isActive) {
    const { reassignTeamsTo = {}, reassignLeadsTo } = reassignments;

    const ledTeams = await Team.find({ headManagerId: targetId, isActive: true }).select("name");
    const ownedLeadsCount = await Lead.countDocuments({
      ownerId: targetId,
      status: { $nin: CLOSED_LEAD_STATUSES },
    });

    const unresolvedTeams = ledTeams.filter((team) => !reassignTeamsTo[String(team._id)]);
    const needsLeadReassignment = ownedLeadsCount > 0 && !reassignLeadsTo;

    if (unresolvedTeams.length > 0 || needsLeadReassignment) {
      const parts = [];

      if (unresolvedTeams.length > 0) {
        parts.push(
          `leads the following team(s) needing a new head: ${unresolvedTeams.map((team) => team.name).join(", ")}`
        );
      }

      if (needsLeadReassignment) {
        parts.push(`owns ${ownedLeadsCount} active lead(s) needing a new owner`);
      }

      throw new ApiError(
        400,
        `Cannot deactivate: this person ${parts.join("; and ")}. Provide reassignment info to continue.`
      );
    }

    // Everything required is present — validate it's all actually valid
    // before writing anything.
    for (const team of ledTeams) {
      await ensureValidManagerId(reassignTeamsTo[String(team._id)]);
    }

    let newLeadOwner = null;

    if (ownedLeadsCount > 0) {
      newLeadOwner = await User.findById(reassignLeadsTo);

      if (!newLeadOwner) {
        throw new ApiError(400, "reassignLeadsTo does not match an existing user");
      }
    }

    // Validated — now apply, in the order described above.
    for (const team of ledTeams) {
      await Team.updateOne({ _id: team._id }, { headManagerId: reassignTeamsTo[String(team._id)] });
    }

    if (newLeadOwner) {
      await Lead.updateMany(
        { ownerId: targetId, status: { $nin: CLOSED_LEAD_STATUSES } },
        { ownerId: newLeadOwner._id }
      );
    }
  }

  user.isActive = isActive;
  await user.save();

  return user;
}

/**
 * Guarded, permanent hard-delete (§7.28, 2026-07-30 — a deliberate reversal
 * of the earlier "no hard delete for Users" decision; see final-plan.md
 * §6.1/§7.0 for the dated reasoning). Deactivate (soft, reversible) remains
 * the default lifecycle action for every other case — this exists only for
 * an admin who explicitly wants a deactivated account gone for good.
 *
 * Guards run in this exact order:
 *   1. Reject outright if the user is still `isActive: true` — hard-delete
 *      is only ever a step AFTER deactivation, never a shortcut around it.
 *   2. Reject if the user is currently a Team's `headManagerId`. In
 *      practice this should be unreachable — `setUserActiveStatus` already
 *      refuses to deactivate a team head, and guard #1 above means only an
 *      already-deactivated user reaches this point — but it's cheap
 *      defense-in-depth against any future path that flips `isActive` to
 *      false without going through that guard.
 *   3. Require a non-empty `reason` — there is no undo after this, so a
 *      reason is mandatory, not optional context.
 * Only once all three pass is a full snapshot of the user document written
 * to `DeletedUserAuditLog` (the only place this data survives), and only
 * then is the User document actually removed.
 *
 * Deliberately does NOT cascade-delete or fix up this user's id anywhere
 * else (Lead.ownerId, Attendance, Payment.collectedBy, etc.) — every one of
 * those already resolves an unknown/missing user id to "—" via the same
 * Map-lookup-with-fallback pattern used throughout the app (e.g. this same
 * file's `managerNameById` on the frontend), so those records keep
 * displaying gracefully rather than crashing; there's nothing to fix up.
 */
export async function hardDeleteUser(targetId, reason, requestingUser) {
  const user = await User.findById(targetId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isActive) {
    throw new ApiError(400, "Cannot delete an active user — deactivate this user first");
  }

  const ledTeams = await Team.find({ headManagerId: targetId, isActive: true }).select("name");

  if (ledTeams.length > 0) {
    const teamNames = ledTeams.map((team) => team.name).join(", ");
    throw new ApiError(
      400,
      `Cannot delete: this person leads the following team(s): ${teamNames}. Reassign the team's head first.`
    );
  }

  if (!reason || !reason.trim()) {
    throw new ApiError(400, "A reason is required to permanently delete a user");
  }

  await DeletedUserAuditLog.create({
    deletedUserId: user._id,
    deletedBy: requestingUser._id,
    reason: reason.trim(),
    snapshot: user.toObject(),
  });

  await User.deleteOne({ _id: targetId });
}

/**
 * Admin override for a user's password (§7.17) — route-level `requireAdmin`
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

// --- Employee self-service (§7.39, 2026-08-05) ---

// Always self-editable: a photo asserts nothing about who someone IS in the
// org chart, so it needs no gate.
const ALWAYS_SELF_EDITABLE = ["photo"];

// Self-editable ONLY when the user's manager/admin has granted
// `canEditOwnProfile`. These identify a person to everyone else, so they are
// HR-controlled by default.
const GATED_SELF_EDITABLE = ["name", "phone"];

/**
 * Fields this endpoint must NEVER write, under any condition. Listed
 * explicitly rather than relying on "not in the allow-list" alone, so the
 * rejection message can name them and so the intent survives someone later
 * widening the allow-list without thinking.
 *
 * `password` is absent deliberately: it is changed through
 * `POST /auth/change-password`, which requires the CURRENT password. Routing
 * it through here would let anyone with a live session change the password
 * without proving they know the old one.
 */
const NEVER_SELF_EDITABLE = [
  "email",
  "role",
  "permissions",
  "managerId",
  "isActive",
  "teamId",
  "passwordHash",
  "password",
  "canEditOwnProfile",
  "baseSalary",
  "customerId",
];

/**
 * `PATCH /users/me` — self-update behind a SERVER-SIDE whitelist.
 *
 * Rejects loudly (400/403) rather than silently dropping disallowed fields.
 * A silent drop returns 200 and looks like success, which hides both an
 * honest client bug and a deliberate privilege-escalation attempt — and an
 * employee PATCHing their own `role` or `managerId` is the obvious attack
 * here, so it must fail visibly and be attributable.
 */
export async function updateOwnProfile(userId, payload = {}) {
  const submittedFields = Object.keys(payload);

  const forbidden = submittedFields.filter((field) => NEVER_SELF_EDITABLE.includes(field));

  if (forbidden.length > 0) {
    throw new ApiError(403, `These fields cannot be changed here: ${forbidden.join(", ")}`);
  }

  const unknown = submittedFields.filter(
    (field) => ![...ALWAYS_SELF_EDITABLE, ...GATED_SELF_EDITABLE].includes(field)
  );

  if (unknown.length > 0) {
    throw new ApiError(400, `Unrecognised field(s): ${unknown.join(", ")}`);
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const gatedAttempts = submittedFields.filter((field) => GATED_SELF_EDITABLE.includes(field));

  if (gatedAttempts.length > 0 && !user.canEditOwnProfile) {
    throw new ApiError(
      403,
      "Your profile name and phone are managed by your manager. Ask them to enable self-editing."
    );
  }

  submittedFields.forEach((field) => {
    user[field] = payload[field];
  });

  await user.save();

  return user;
}

/** The caller's OWN role and permissions — never anyone else's. */
export async function getOwnPermissions(userId) {
  const user = await User.findById(userId).select("role permissions");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return { role: user.role, permissions: user.permissions || {} };
}

/**
 * Only the target user's own manager, or an admin, may toggle
 * `canEditOwnProfile` — the point of the flag is that it is granted TO
 * someone BY someone else.
 */
export async function setCanEditOwnProfile(targetUserId, canEdit, requestingUser) {
  const target = await User.findById(targetUserId);

  if (!target) {
    throw new ApiError(404, "User not found");
  }

  const isOwnManager = String(target.managerId) === String(requestingUser._id);

  if (requestingUser.role !== "admin" && !isOwnManager) {
    throw new ApiError(403, "Only this person's manager or an admin can change this");
  }

  target.canEditOwnProfile = Boolean(canEdit);
  await target.save();

  return target;
}

export { ALWAYS_SELF_EDITABLE, GATED_SELF_EDITABLE, NEVER_SELF_EDITABLE };
