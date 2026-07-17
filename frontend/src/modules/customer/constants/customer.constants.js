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
