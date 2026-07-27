import dayjs from "dayjs";

/**
 * The Reports page's shared date-range filter, controlling every
 * trend-based chart (leads conversion, customers growth, payments trend,
 * attendance trend, payroll cost trend). Same preset-tab + computed-range
 * shape as `payment/utils/paymentDateFilters.js`, with a different preset
 * set per this task's own spec (Month/3-Months/Financial-Year/Custom
 * instead of Payments' Today/Yesterday/Month/FY/All-Time) — kept as its own
 * file rather than generalizing the Payments one, since the two option
 * lists genuinely differ and there's no third caller yet to justify a
 * shared abstraction.
 */
export const ANALYTICS_DATE_FILTER_OPTIONS = [
  { key: "thisMonth", label: "This Month" },
  { key: "last3Months", label: "Last 3 Months" },
  { key: "financialYear", label: "This Financial Year" },
  { key: "custom", label: "Custom Range" },
];

const DATE_FORMAT = "YYYY-MM-DD";

// Indian financial year: April 1 - March 31 — same convention
// `paymentDateFilters.js#financialYearRange` already established.
function financialYearRange() {
  const today = dayjs();
  const fyStartYear = today.month() >= 3 ? today.year() : today.year() - 1;
  const start = dayjs(new Date(fyStartYear, 3, 1));
  const end = dayjs(new Date(fyStartYear + 1, 2, 31));

  return { from: start.format(DATE_FORMAT), to: end.format(DATE_FORMAT) };
}

/**
 * Returns `{ from, to }` for the given filter key. For `"custom"`, returns
 * whatever range the caller has picked so far (empty strings until they
 * pick one) — the caller (`DateRangeFilter`) owns that state.
 */
export function computeAnalyticsDateRange(key, customRange) {
  const today = dayjs();

  switch (key) {
    case "thisMonth":
      return {
        from: today.startOf("month").format(DATE_FORMAT),
        to: today.endOf("month").format(DATE_FORMAT),
      };
    case "last3Months":
      return {
        from: today.subtract(2, "month").startOf("month").format(DATE_FORMAT),
        to: today.endOf("month").format(DATE_FORMAT),
      };
    case "financialYear":
      return financialYearRange();
    case "custom":
      return customRange || { from: "", to: "" };
    default:
      return { from: "", to: "" };
  }
}
