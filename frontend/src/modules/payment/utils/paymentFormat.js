import dayjs from "dayjs";

/**
 * Display formatting shared by the global Payments table and the customer
 * page's Payments section (§7.70) — one payment must look identical in both
 * places, since both list the same record.
 *
 * Date + time, matching the "DD MMM YYYY" token convention
 * `AttendanceTimeline.jsx`/`LeaveListPage.jsx` use, extended with hours:
 * minutes (12-hour, no seconds) — `Payment.date` is a full `Date` captured
 * with a real time by the Record Payment modal's own `showTime` picker.
 */
export function formatPaymentDate(value) {
  return dayjs(value).format("DD MMM YYYY, h:mm A");
}

export function formatPaymentAmount(value) {
  return `₹${value.toLocaleString()}`;
}
