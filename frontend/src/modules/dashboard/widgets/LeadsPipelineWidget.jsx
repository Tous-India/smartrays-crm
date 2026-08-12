import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listLeads } from "../../lead/api/leadApi";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "../../lead/constants/lead.constants";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Leads Pipeline overview — count of leads per status (§7.13's Dashboard
 * scope). Reuses `listLeads()` with no filters, the exact same scoped fetch
 * the Leads list page itself calls (admin org-wide, manager own-team,
 * sales_associate own — enforced server-side in `lead.service.js`, no
 * scoping logic duplicated here).
 *
 * Permission-gated internally via `usePermission`, on top of whatever
 * candidate list `dashboardConfig.js` put this widget in for the user's
 * role — a per-user override away from the role's default grant (§7.12)
 * must still hide this widget, not just the role-level config.
 */
function LeadsPipelineWidget() {
  const canView = usePermission("leads", "view");
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listLeads({})
      .then((response) => {
        if (!cancelled) {
          setLeads(response.data.data);
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

  const counts = LEAD_STATUSES.reduce((acc, status) => {
    acc[status] = leads.filter((lead) => lead.status === status).length;
    return acc;
  }, {});

  return (
    <WidgetCard
      title="Leads Pipeline"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && leads.length === 0}
      emptyDescription="No leads yet"
    >
      <div className="flex flex-wrap gap-2">
        {LEAD_STATUSES.map((status) => (
          <Tag key={status} color={LEAD_STATUS_COLORS[status]}>
            {LEAD_STATUS_LABELS[status]}: {counts[status]}
          </Tag>
        ))}
      </div>
      <div className="mt-2 text-left text-sm">
        <Link to={ROUTE_PATHS.LEADS}>View all leads →</Link>
      </div>
    </WidgetCard>
  );
}

export default LeadsPipelineWidget;
