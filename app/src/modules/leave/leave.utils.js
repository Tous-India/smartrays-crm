import { formatDate } from "../../utils/date.utils";

/** The requestable types (the server's enum minus the admin-only absence mark). */
export const LEAVE_TYPES = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
];

/** The pill tone for a request's status, as the server spells it. */
export function statusTone(status) {
  if (status === "approved") {
    return "success";
  }

  if (status === "rejected") {
    return "danger";
  }

  return "warning";
}

/** "22 Sep 2026" for one day, "22 Sep 2026 – 24 Sep 2026" for a range, "(half day)" appended. */
export function formatLeaveSpan(leave) {
  const start = formatDate(leave.startDate);
  const end = formatDate(leave.endDate);
  const span = start === end ? start : `${start} – ${end}`;

  return leave.isHalfDay ? `${span} (half day)` : span;
}
