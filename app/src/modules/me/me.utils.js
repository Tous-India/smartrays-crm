/** Payroll statuses a payslip exists for — a draft or a period under review has none (the server 409s). */
export const PAYSLIP_STATUSES = ["approved", "paid"];

/** "September 2026" from a payroll record's numeric month and year. */
export function formatPayrollMonth(record) {
  return new Date(record.year, record.month - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

/** "₹12,345" — rupees, no paise, as the payslip prints them. */
export function formatRupees(amount) {
  if (typeof amount !== "number") {
    return "—";
  }

  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** The records the app lists: approved or paid, newest first. */
export function payslipRecords(records) {
  return records.filter((record) => PAYSLIP_STATUSES.includes(record.status));
}
