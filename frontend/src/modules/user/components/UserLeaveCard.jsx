import { Link } from "react-router-dom";
import { Statistic } from "antd";
import useLeaveBalance from "../../leave/hooks/useLeaveBalance";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

/**
 * Current paid-leave balance — reuses `useLeaveBalance`/`GET /leave/balance`
 * verbatim, the same hook Leave's own personal view uses, just passed this
 * employee's id explicitly instead of omitting it (self-balance vs.
 * someone-else's is exactly what that endpoint's own `employeeId` param
 * already distinguishes server-side).
 */
function UserLeaveCard({ user }) {
  const { balance, isLoading, error } = useLeaveBalance(user._id);

  return (
    <WidgetCard title="Leave Balance" isLoading={isLoading} error={error} isEmpty={!balance}>
      {balance && (
        <>
          <Statistic
            title={<span className="text-xs text-gray-500">Paid Leave Remaining</span>}
            value={balance.paidLeaveRemaining}
            suffix={`/ ${balance.paidLeaveLimit}`}
            valueStyle={{ fontSize: 20 }}
          />
          <div className="mt-1 text-xs text-gray-500">{balance.paidLeaveUsed} used this year</div>
        </>
      )}
      <div className="mt-2 text-right text-sm">
        <Link to={ROUTE_PATHS.LEAVE}>View leave history →</Link>
      </div>
    </WidgetCard>
  );
}

export default UserLeaveCard;
