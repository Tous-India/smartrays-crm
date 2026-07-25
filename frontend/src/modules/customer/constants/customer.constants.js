/**
 * Mirrors backend/src/modules/customer/customer.model.js#BILLING_TYPES /
 * #CUSTOMER_STATUSES exactly.
 */
export const BILLING_TYPES = ["registered", "non_gst", "overseas"];

export const BILLING_TYPE_LABELS = {
  registered: "GST Registered",
  non_gst: "Non-GST",
  overseas: "Overseas",
};

export const CUSTOMER_STATUSES = ["active", "inactive"];

export const CUSTOMER_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
};

// Ant Design Tag `color` prop values.
export const CUSTOMER_STATUS_COLORS = {
  active: "green",
  inactive: "default",
};

/**
 * Mirrors backend/src/modules/customer/contract.model.js#CONTRACT_TYPES.
 * `yearly` has no automation (see contract.model.js's own comment) — still a
 * valid, selectable type, just one with no side effect on save.
 */
export const CONTRACT_TYPES = ["monthly", "onetime", "yearly"];

export const CONTRACT_TYPE_LABELS = {
  monthly: "Monthly",
  onetime: "One-time",
  yearly: "Yearly",
};

// Ant Design Tag `color` prop values — used for the List View's "Type
// badges" column (§ functional spec Customer List View).
export const CONTRACT_TYPE_COLORS = {
  monthly: "blue",
  onetime: "purple",
  yearly: "gold",
};

/**
 * "monthly" is deliberately hidden from every contract-type *picker* in the
 * UI (the Add Customer wizard's Contracts step, the standalone Add/Edit
 * Contract modal) while staying fully valid in the backend enum/model and in
 * `CONTRACT_TYPE_LABELS`/`CONTRACT_TYPE_COLORS` above — kept for a future
 * PPA-style recurring-billing deal, not removed outright. Any existing
 * "monthly" contract still displays normally everywhere (List View badges,
 * Customer Detail's Contracts section) via the untouched maps above; it just
 * can't be newly *selected* from a dropdown right now.
 */
export const CONTRACT_TYPE_UI_OPTIONS = Object.entries(CONTRACT_TYPE_LABELS)
  .filter(([value]) => value !== "monthly")
  .map(([value, label]) => ({ value, label }));

// Re-exported from the Lead module's constants rather than redefined here —
// mirrors backend/src/modules/customer/customer.model.js importing
// CLIENT_TYPES/ROOF_TYPES/CONNECTION_TYPES from lead.model.js for the exact
// same reason: one source of truth for enums shared by both modules.
export {
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_OPTIONS,
  ROOF_TYPE_LABELS,
  ROOF_TYPE_OPTIONS,
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPE_OPTIONS,
} from "../../lead/constants/lead.constants";

// Mirrors backend/src/modules/customer/customer.model.js#NET_METERING_STATUSES.
export const NET_METERING_STATUS_LABELS = {
  not_applied: "Not Applied",
  applied: "Applied",
  approved: "Approved",
  installed: "Installed",
};

export const NET_METERING_STATUS_OPTIONS = Object.entries(NET_METERING_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Mirrors backend/src/modules/customer/customer.model.js#SUBSIDY_CLAIM_STATUSES.
export const SUBSIDY_CLAIM_STATUS_LABELS = {
  not_applicable: "Not Applicable",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  disbursed: "Disbursed",
};

export const SUBSIDY_CLAIM_STATUS_OPTIONS = Object.entries(SUBSIDY_CLAIM_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Mirrors backend/src/modules/customer/customerActivity.model.js#ACTIVITY_ACTIONS.
 */
export const ACTIVITY_ACTION_LABELS = {
  created: "Customer created",
  edited: "Customer updated",
  deactivated: "Customer deactivated",
  reactivated: "Customer reactivated",
  contract_added: "Contract added",
  contract_removed: "Contract removed",
  credential_revealed: "Credential revealed",
};
