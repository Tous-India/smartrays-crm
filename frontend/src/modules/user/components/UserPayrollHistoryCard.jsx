import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List } from "antd";
import dayjs from "dayjs";
import { listPayroll } from "../../payroll/api/payrollApi";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

/**
 * Admin-only (gated by the caller — see `UserDetailPage`'s own admin check
 * before rendering this at all, same as Payroll's own `payroll.run`-gated
 * "scope=all" server-side restriction this reuses). `GET /payroll` has no
 * `employeeId` filter of its own (only `scope`/`month` — confirmed against
 * `payroll.service.js#listPayroll`), so this fetches every record via
 * `scope: "all"` (no `month`, unlike `PayrollStatusWidget`'s single-month
 * fetch, since this wants the FULL history) and filters to this one
 * employee client-side — the same "fetch broader, filter client-side"
 * approach this page's Team/Attendance cards already use.
 */
function UserPayrollHistoryCard({ userId }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listPayroll({ scope: "all" })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const own = response.data.data
          .filter((record) => record.employeeId === userId)
          .sort((a, b) => b.year - a.year || b.month - a.month);
        setRecords(own);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <WidgetCard
      title="Payroll History"
      isLoading={isLoading}
      error={error}
      isEmpty={records.length === 0}
      emptyDescription="No payslips yet"
    >
      <List
        size="small"
        dataSource={records.slice(0, 6)}
        renderItem={(record) => (
          <List.Item>
            <Link to={`/payroll/${record._id}/payslip`}>
              {dayjs(`${record.year}-${String(record.month).padStart(2, "0")}-01`).format("MMMM YYYY")}
            </Link>
            <span className="text-sm text-gray-500">₹{record.netAmount?.toLocaleString()}</span>
          </List.Item>
        )}
      />
    </WidgetCard>
  );
}

export default UserPayrollHistoryCard;
