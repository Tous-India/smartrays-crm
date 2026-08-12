/**
 * Rupee formatting with an EXPLICIT locale (§7.58).
 *
 * A bare `toLocaleString()` follows whatever locale the runtime happens to
 * have: the same figure renders `₹1,20,000` under jsdom and `₹120,000` in a
 * browser started elsewhere. That is a real inconsistency on a screen showing
 * pay, and it made a test assert a grouping it did not control.
 *
 * `en-IN` is pinned deliberately — this is an Indian payroll, and lakh grouping
 * is what the people reading it expect. Pinning it also makes the tests
 * deterministic without them having to look away from the formatting.
 */
const FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** `₹1,20,000`, or an em dash — never `₹0` standing in for "not recorded". */
export function money(value) {
  return value == null ? "—" : `₹${FORMATTER.format(Math.round(value))}`;
}

/** The bare number, same grouping, for totals rows that supply their own mark. */
export function amount(value) {
  return value == null ? "—" : FORMATTER.format(Math.round(value));
}
