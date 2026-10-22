// Customer complaint link (2026-10-22). Plain words, with a short Hindi line
// under the customer-facing ones — the customers are homeowners and small
// businesses across Delhi NCR, many more at ease reading Hindi.

export const COMPLAINT_CATEGORIES = [
  { value: "technical", label: "Not working", hindi: "काम नहीं कर रहा", hint: "Panels, inverter, power", icon: "🔧" },
  { value: "sales_billing", label: "Billing / Payment", hindi: "बिल / भुगतान", hint: "Bill, payment, quote", icon: "🧾" },
  { value: "installation", label: "Installation", hindi: "इंस्टॉलेशन", hint: "Fitting, wiring, structure", icon: "🏗️" },
  { value: "other", label: "Something else", hindi: "कुछ और", hint: "Anything else", icon: "💬" },
];

export const CATEGORY_LABEL = Object.fromEntries(COMPLAINT_CATEGORIES.map((c) => [c.value, c.label]));

export const CALLBACK_TIMES = [
  { value: "morning", label: "Morning", hindi: "सुबह", detail: "9 – 12" },
  { value: "afternoon", label: "Afternoon", hindi: "दोपहर", detail: "12 – 4" },
  { value: "evening", label: "Evening", hindi: "शाम", detail: "4 – 7" },
  { value: "anytime", label: "Any time", hindi: "कभी भी", detail: "" },
];

export const CALLBACK_LABEL = Object.fromEntries(CALLBACK_TIMES.map((t) => [t.value, `${t.label}${t.detail ? ` (${t.detail})` : ""}`]));

// What the CUSTOMER sees — three words only.
export const PUBLIC_STATUS = {
  received: { label: "Received", hindi: "मिल गई", color: "#163b78", background: "#e8eef8" },
  in_progress: { label: "In progress", hindi: "काम चल रहा है", color: "#9a5b00", background: "#fff4e0" },
  resolved: { label: "Resolved", hindi: "हल हो गई", color: "#1d8343", background: "#e6f4ec" },
};

// What STAFF see — the same three words; "closed" reads as Resolved.
export const STAFF_STATUS = {
  open: { label: "Waiting", color: "blue" },
  in_progress: { label: "In progress", color: "gold" },
  resolved: { label: "Resolved", color: "green" },
  closed: { label: "Resolved", color: "green" },
};

export const PHOTO_LIMITS = { maxCount: 3, maxBytes: 5 * 1024 * 1024 };
