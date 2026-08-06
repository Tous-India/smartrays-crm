import LeaveSection from "../modules/leave/components/LeaveSection";

/**
 * `/leave` for employees (§7.39, 2026-08-05) — apply for leave plus their own
 * history, split out of the Attendance page's tabs so attendance and leave
 * are separate destinations for this role.
 *
 * Deliberately a thin wrapper: `LeaveSection` already carries the Balance
 * card, the fetch-error Alert, the per-row scope gate and the request modal.
 * Writing a second leave component would duplicate all of that and let the
 * two drift.
 */
function EmployeeLeavePage() {
  return <LeaveSection view="all" />;
}

export default EmployeeLeavePage;
