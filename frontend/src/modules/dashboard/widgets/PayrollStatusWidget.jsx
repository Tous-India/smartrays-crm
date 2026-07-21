import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listPayroll } from "../../payroll/api/payrollApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Whether payroll has been run for the current month, and if so how many
 * employees were processed — admin-only, matching `payroll.run` (§5's
 * matrix: Payroll has no `team` tier at all, Manager gets no grant
 * whatsoever). Reuses `listPayroll({ scope: "all", month })`, the same call
 * a future Payroll list page's admin "all" scope would make
 * (`payroll.service.js#listPayroll` already scopes server-side); "has
 * payroll run" and "how many employees" are both derived from that response
 * length, not a new backend endpoint.
 */
function PayrollStatusWidget() {
  const canView = usePermission("payroll", "run");
  const [processedCount, setProcessedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    listPayroll({ scope: "all", month })
      .then((response) => {
        if (!cancelled) {
          setProcessedCount(response.data.data.length);
        }
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
  }, [canView]);

  if (!canView) {
    return null;
  }

  const hasRun = processedCount > 0;

  return (
    <WidgetCard title="Payroll Status (This Month)" isLoading={isLoading} error={error} isEmpty={false}>
      <div className="flex items-center gap-2">
        <span>Run this month:</span>
        <Tag color={hasRun ? "green" : "default"}>{hasRun ? "Yes" : "Not yet"}</Tag>
      </div>
      {hasRun && (
        <div className="mt-2">
          Employees processed: <strong>{processedCount}</strong>
        </div>
      )}
      <div className="mt-3 text-right">
        <Link to={ROUTE_PATHS.PAYROLL}>View payroll →</Link>
      </div>
    </WidgetCard>
  );
}

export default PayrollStatusWidget;
