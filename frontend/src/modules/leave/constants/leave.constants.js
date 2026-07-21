/**
 * Mirrors backend/src/modules/leave/leave.model.js's `LEAVE_TYPES`/
 * `LEAVE_STATUSES` exactly. `unapproved_absence` is deliberately excluded
 * from `REQUESTABLE_LEAVE_TYPES` — it's only ever set via the dedicated
 * mark-unapproved-absence admin action, never requestable directly, same
 * exclusion `leave.validation.js#validateLeaveRequestInput` already enforces
 * server-side.
 */
export const LEAVE_TYPES = ["paid", "unpaid", "unapproved_absence"];
export const REQUESTABLE_LEAVE_TYPES = ["paid", "unpaid"];
export const LEAVE_STATUSES = ["pending", "approved", "rejected"];

export const LEAVE_TYPE_LABELS = {
  paid: "Paid",
  unpaid: "Unpaid",
  unapproved_absence: "Unapproved Absence",
};

export const LEAVE_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// Ant Design Tag `color` prop values.
export const LEAVE_STATUS_COLORS = {
  pending: "gold",
  approved: "green",
  rejected: "red",
};
