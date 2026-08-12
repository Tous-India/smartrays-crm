import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Statistic } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listAmc } from "../../amc/api/amcApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Count of AMC records renewing within the next 30 days. Reuses
 * `listAmc()` with no filter params — `amc.service.js#listAMC` already
 * scopes server-side by the caller (admin all, manager "own team",
 * sales_associate "own", via the underlying Customer's ownership) exactly
 * per §5's `amc.view` pattern, so no new scoping logic is needed here. The
 * 30-day window itself is derived client-side (`GET /amc` has no date-range
 * filter of its own).
 */
function AmcRenewalsDueWidget() {
  const canView = usePermission("amc", "view");
  const [dueCount, setDueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listAmc()
      .then((response) => {
        if (cancelled) {
          return;
        }
        const now = Date.now();
        const cutoff = now + THIRTY_DAYS_MS;
        setDueCount(
          response.data.data.filter((amc) => {
            const renewalTime = new Date(amc.renewalDate).getTime();
            return renewalTime >= now && renewalTime <= cutoff;
          }).length
        );
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

  return (
    <WidgetCard title="AMC Renewals Due" isLoading={isLoading} error={error} isEmpty={false}>
      <Statistic
        title={<span className="text-xs text-gray-500">Due within 30 days</span>}
        value={dueCount}
        valueStyle={{ fontSize: 20 }}
      />
      {/*
        Points at CUSTOMERS, not ROUTE_PATHS.AMC. There is no `/amc` route —
        AMC moved inside Customer Detail (§7.35) and the renewals worklist is
        `ExpiringAmcPanel`, rendered above the Customers table (§7.42). The
        constant survived the move and this link kept pointing at it, so
        "View all AMC records" went nowhere from the Dashboard.
      */}
      <div className="mt-2 text-left text-sm">
        <Link to={ROUTE_PATHS.CUSTOMERS}>View AMC renewals →</Link>
      </div>
    </WidgetCard>
  );
}

export default AmcRenewalsDueWidget;
