import dayjs from "dayjs";

/**
 * The Payments table's date-range filter tabs — computed client-side, then
 * sent as `from`/`to` (YYYY-MM-DD) to `GET /payments`.
 */
export const PAYMENT_DATE_FILTER_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisMonth", label: "This Month" },
  { key: "financialYear", label: "Financial Year" },
  { key: "allTime", label: "All Time" },
];

const DATE_FORMAT = "YYYY-MM-DD";

/**
 * Indian financial year: April 1 – March 31. No existing FY utility
 * anywhere else in this codebase (checked before writing this — Payroll and
 * every other date-range convention here works in plain calendar
 * months/dates) — this is the first.
 */
function financialYearRange() {
  const today = dayjs();
  // dayjs months are 0-indexed; 3 = April. Before April, "this" FY started
  // in the previous calendar year.
  const fyStartYear = today.month() >= 3 ? today.year() : today.year() - 1;
  const start = dayjs(new Date(fyStartYear, 3, 1));
  const end = dayjs(new Date(fyStartYear + 1, 2, 31));

  return { from: start.format(DATE_FORMAT), to: end.format(DATE_FORMAT) };
}

/**
 * Returns `{ from, to }` for the given filter key — both empty strings for
 * "All Time" (no date restriction; the table still paginates as normal).
 */
export function computePaymentDateRange(key) {
  const today = dayjs();

  switch (key) {
    case "today":
      return { from: today.format(DATE_FORMAT), to: today.format(DATE_FORMAT) };
    case "yesterday": {
      const yesterday = today.subtract(1, "day");
      return { from: yesterday.format(DATE_FORMAT), to: yesterday.format(DATE_FORMAT) };
    }
    case "thisMonth":
      return {
        from: today.startOf("month").format(DATE_FORMAT),
        to: today.endOf("month").format(DATE_FORMAT),
      };
    case "financialYear":
      return financialYearRange();
    case "allTime":
    default:
      return { from: "", to: "" };
  }
}
