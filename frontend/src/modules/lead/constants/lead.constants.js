/**
 * Mirrors backend/src/modules/lead/lead.model.js#LEAD_STATUSES exactly — the
 * pipeline order matters here (both the Board columns and the functional
 * spec's "Pipeline Stages (in order)" list use this exact sequence).
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
];

export const LEAD_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

// Ant Design Tag `color` prop values.
export const LEAD_STATUS_COLORS = {
  new: "default",
  contacted: "blue",
  qualified: "cyan",
  proposal_sent: "gold",
  negotiation: "orange",
  won: "green",
  lost: "red",
};

// Mirrors backend/src/modules/lead/leadCall.model.js#CALL_OUTCOMES.
export const CALL_OUTCOMES = ["connected", "no_answer", "voicemail", "callback"];

export const CALL_OUTCOME_LABELS = {
  connected: "Connected",
  no_answer: "No Answer",
  voicemail: "Voicemail",
  callback: "Callback Requested",
};

// Per leads-customer-functional-spec.md's Follow-up filter dropdown.
export const FOLLOW_UP_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "this_week", label: "This Week" },
  { value: "none", label: "No Follow-up" },
];

/**
 * Informational mirror of backend/src/modules/lead/lead.service.js#COLUMN_ALIASES
 * — the backend matches import columns case-insensitively against this exact
 * alias list; there is no interactive column-remapping API. The import
 * wizard's "mapping" step displays this matching, it doesn't let the user
 * change it (see ImportWizardModal.jsx for the full explanation).
 */
export const IMPORT_COLUMN_ALIASES = {
  name: ["name"],
  email: ["email"],
  phone: ["phone"],
  companyName: ["companyname", "company name", "company"],
  source: ["source"],
  status: ["status"],
  budget: ["budget"],
};
