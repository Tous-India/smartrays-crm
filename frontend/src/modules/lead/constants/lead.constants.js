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

// Ant Design Tag `color` prop values — the shared STATUS_COLOR_MAP used by
// both the Leads table and the Lead Detail page's status badge.
export const LEAD_STATUS_COLORS = {
  new: "default",
  contacted: "cyan",
  qualified: "purple",
  proposal_sent: "orange",
  negotiation: "gold",
  won: "green",
  lost: "red",
};

// Ant Design's own "1" palette shade for each named color token — the same
// hue at low saturation/high lightness, i.e. the soft pastel tint of that
// color rather than its solid form. Keyed by COLOR NAME, not by lead
// status, specifically so `LEAD_STATUS_PASTEL_COLORS` below can derive from
// `LEAD_STATUS_COLORS` instead of duplicating a second, separately-
// maintained per-status map — if a status's color ever changes above, its
// pastel tint follows automatically.
const ANTD_COLOR_PASTEL_TINTS = {
  default: "#FAFAFA",
  cyan: "#E6FFFB",
  purple: "#F9F0FF",
  orange: "#FFF7E6",
  gold: "#FFFBE6",
  green: "#F6FFED",
  red: "#FFF1F0",
};

// The Status dropdown's (LeadStatusSelect.jsx) per-stage background — a
// soft pastel hint rather than the Tag badge's loud solid color, derived
// from LEAD_STATUS_COLORS above rather than a second hardcoded mapping.
export const LEAD_STATUS_PASTEL_COLORS = Object.fromEntries(
  Object.entries(LEAD_STATUS_COLORS).map(([status, colorName]) => [status, ANTD_COLOR_PASTEL_TINTS[colorName]])
);

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

// Mirrors backend/src/modules/lead/lead.model.js#CLIENT_TYPES.
export const CLIENT_TYPE_LABELS = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

export const CLIENT_TYPE_OPTIONS = Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Mirrors backend/src/modules/lead/lead.model.js#ROOF_TYPES.
export const ROOF_TYPE_LABELS = {
  rcc: "RCC",
  tin_shed: "Tin Shed",
  tile: "Tile",
  ground_mount: "Ground Mount",
  other: "Other",
};

export const ROOF_TYPE_OPTIONS = Object.entries(ROOF_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Mirrors backend/src/modules/lead/lead.model.js#CONNECTION_TYPES.
export const CONNECTION_TYPE_LABELS = {
  single_phase: "Single Phase",
  three_phase: "Three Phase",
};

export const CONNECTION_TYPE_OPTIONS = Object.entries(CONNECTION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Mirrors backend/src/modules/lead/lead.model.js#SITE_SURVEY_STATUSES.
export const SITE_SURVEY_STATUS_LABELS = {
  not_scheduled: "Not Scheduled",
  scheduled: "Scheduled",
  completed: "Completed",
};

export const SITE_SURVEY_STATUS_OPTIONS = Object.entries(SITE_SURVEY_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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
