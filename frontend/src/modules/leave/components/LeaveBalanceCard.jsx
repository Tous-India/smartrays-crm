import { Card, Statistic } from "antd";
import useLeaveBalance from "../hooks/useLeaveBalance";

/**
 * Prominent "own balance always" card at the top of the Leave page — reuses
 * `GET /leave/balance` (no client-side re-derivation of the quota math,
 * which stays entirely server-side in `leave.service.js#getLeaveBalance`).
 * `employeeId` omitted (the default) fetches the current user's own balance;
 * passed, shows a specific employee's — used for the "admin/manager can see
 * an employee's balance when viewing their requests" requirement.
 *
 * **`app-elevated-card` (BUG 1, 2026-08-04)** — see `AttendanceSummaryStats`'s
 * own docblock for the full diagnosis (same missing-className cause, same
 * fix, different component): the shared shadow class was never actually
 * applied here despite being requested twice — confirmed via `git log` that
 * this file was only ever touched by its original feature-build commit.
 */
function LeaveBalanceCard({ employeeId, title = "Your Paid Leave Balance This Month" }) {
  const { balance, isLoading } = useLeaveBalance(employeeId);

  return (
    <Card size="small" title={title} loading={isLoading} className="app-elevated-card max-w-xs">
      <Statistic
        value={balance?.paidLeaveUsed ?? 0}
        suffix={`/ ${balance?.paidLeaveLimit ?? 1} used`}
      />
      <div className="mt-1 text-sm text-gray-500">
        {balance?.paidLeaveRemaining ?? 1} remaining this month
      </div>
    </Card>
  );
}

export default LeaveBalanceCard;
