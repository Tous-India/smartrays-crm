import LocationConsent from "./locationConsent.model.js";
import User from "../user/user.model.js";
import { resolveVisibleEmployeeIds } from "./location.service.js";

/**
 * The location-consent record (final-plan.md §7.73). Three verbs, all read
 * or append — nothing in this module updates or deletes a decision.
 */

function present(record) {
  if (!record) {
    return null;
  }

  return {
    id: record._id,
    userId: record.userId,
    decision: record.decision,
    disclosureVersion: record.disclosureVersion,
    appVersion: record.appVersion,
    deviceId: record.deviceId,
    recordedAt: record.createdAt,
  };
}

/**
 * Appends the caller's decision. `userId` is the session's — a body can never
 * record a decision for someone else.
 */
export async function recordLocationConsent(requestingUser, { decision, disclosureVersion, appVersion, deviceId }) {
  const record = await LocationConsent.create({
    userId: requestingUser._id,
    decision,
    disclosureVersion,
    appVersion: appVersion || null,
    deviceId: deviceId || null,
  });

  return present(record);
}

/** The caller's latest decision, or null when they have never answered. */
export async function getMyLatestConsent(requestingUser) {
  const record = await LocationConsent.findOne({ userId: requestingUser._id }).sort({ createdAt: -1, _id: -1 });

  return present(record);
}

// Roles whose location can be tracked at all — the ones a decision is about.
const FIELD_ROLES = ["employee", "manager", "sales_associate"];

/**
 * The latest decision for every employee the caller may view, including
 * those who have never answered (decision null) — a manager checking their
 * team needs to see the gaps, not just the answers. Scoped exactly as the
 * live map is (`resolveVisibleEmployeeIds`): all for `view_all`, the team
 * plus self for `view_team`, self for `view`.
 */
export async function listLatestConsents(requestingUser) {
  const visibleIds = await resolveVisibleEmployeeIds(requestingUser);

  const userFilter = { isActive: true, role: { $in: FIELD_ROLES } };

  if (visibleIds) {
    userFilter._id = { $in: visibleIds };
  }

  const users = await User.find(userFilter).select("_id name email role").sort({ name: 1 });

  const latest = await LocationConsent.aggregate([
    { $match: { userId: { $in: users.map((user) => user._id) } } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: "$userId", record: { $first: "$$ROOT" } } },
  ]);

  const byUser = new Map(latest.map((entry) => [String(entry._id), entry.record]));

  return users.map((user) => {
    const record = byUser.get(String(user._id));

    return {
      employeeId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      decision: record ? record.decision : null,
      disclosureVersion: record ? record.disclosureVersion : null,
      appVersion: record ? record.appVersion : null,
      deviceId: record ? record.deviceId : null,
      recordedAt: record ? record.createdAt : null,
    };
  });
}
