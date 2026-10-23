// Customer complaints (2026-10-23). Plain words, with a short Hindi line
// under the customer-facing ones — the customers are homeowners and small
// businesses across Delhi NCR, many more at ease reading Hindi.

// The public form's first choice.
export const REQUEST_KINDS = [
  {
    value: "complaint",
    label: "Complaint / problem",
    hindi: "शिकायत / समस्या",
    hint: "Something is not working, a bill, a question",
    icon: "🔧",
  },
  {
    value: "requirement",
    label: "New requirement",
    hindi: "नई ज़रूरत",
    hint: "New installation, extra panels, an upgrade",
    icon: "☀️",
  },
];

export const CALLBACK_TIMES = [
  { value: "morning", label: "Morning", hindi: "सुबह", detail: "9 – 12" },
  { value: "afternoon", label: "Afternoon", hindi: "दोपहर", detail: "12 – 4" },
  { value: "evening", label: "Evening", hindi: "शाम", detail: "4 – 7" },
  { value: "anytime", label: "Any time", hindi: "कभी भी", detail: "" },
];

export const CALLBACK_LABEL = Object.fromEntries(CALLBACK_TIMES.map((t) => [t.value, `${t.label}${t.detail ? ` (${t.detail})` : ""}`]));

// What the CUSTOMER sees on the status page — five steps, in order.
export const PUBLIC_STEPS = [
  { value: "received", label: "Received", hindi: "मिल गई" },
  { value: "assigned", label: "Assigned", hindi: "तकनीशियन तय" },
  { value: "on_the_way", label: "On the way", hindi: "रास्ते में" },
  { value: "working", label: "Working", hindi: "काम चल रहा है" },
  { value: "resolved", label: "Resolved", hindi: "हल हो गई" },
];

// What STAFF see. "open" is Received — nobody assigned yet.
export const STAFF_STATUS = {
  open: { label: "Not assigned", color: "red" },
  assigned: { label: "Assigned", color: "blue" },
  on_the_way: { label: "On the way", color: "geekblue" },
  working: { label: "Working", color: "gold" },
  resolved: { label: "Resolved", color: "green" },
  closed: { label: "Resolved", color: "green" },
};

// The technician's steps after Assigned, in order.
export const WORK_STEPS = [
  { value: "on_the_way", label: "On the way" },
  { value: "working", label: "Working" },
  { value: "resolved", label: "Resolved" },
];

export const PRIORITIES = [
  { value: "low", label: "Low", color: "default" },
  { value: "medium", label: "Medium", color: "blue" },
  { value: "high", label: "High", color: "orange" },
  { value: "urgent", label: "Urgent", color: "red" },
];

export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

export const PHOTO_LIMITS = { maxCount: 3, maxBytes: 5 * 1024 * 1024 };
