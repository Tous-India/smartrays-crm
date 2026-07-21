import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List, Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listLeads } from "../../lead/api/leadApi";
import WidgetCard from "./WidgetCard";

/**
 * Today + overdue follow-up counts, plus a short linked list. Reuses the
 * Leads list page's own `followUp` filter values ("today"/"overdue") via two
 * parallel calls — same server-side scoping as every other Leads widget,
 * just two filtered fetches instead of one unfiltered one.
 */
function LeadsFollowUpWidget() {
  const canView = usePermission("leads", "view");
  const [todayLeads, setTodayLeads] = useState([]);
  const [overdueLeads, setOverdueLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([listLeads({ followUp: "today" }), listLeads({ followUp: "overdue" })])
      .then(([todayResponse, overdueResponse]) => {
        if (cancelled) {
          return;
        }
        setTodayLeads(todayResponse.data.data);
        setOverdueLeads(overdueResponse.data.data);
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

  // Overdue first — more urgent than today's, matching the Leads list page's
  // own "overdue follow-ups render red" precedent (ConnectivityGapBar-style
  // urgency-first ordering shows up elsewhere in this app too).
  const combined = [
    ...overdueLeads.map((lead) => ({ ...lead, _bucket: "overdue" })),
    ...todayLeads.map((lead) => ({ ...lead, _bucket: "today" })),
  ].slice(0, 5);

  return (
    <WidgetCard
      title="Follow-ups Due"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && combined.length === 0}
      emptyDescription="No follow-ups due"
    >
      <div className="mb-2 flex gap-4 text-sm">
        <span>
          Today: <strong>{todayLeads.length}</strong>
        </span>
        <span>
          Overdue: <strong>{overdueLeads.length}</strong>
        </span>
      </div>
      <List
        size="small"
        dataSource={combined}
        renderItem={(lead) => (
          <List.Item>
            <Link to={`/leads/${lead._id}`}>{lead.name}</Link>
            <Tag color={lead._bucket === "overdue" ? "red" : "gold"} className="ml-2">
              {lead._bucket === "overdue" ? "Overdue" : "Today"}
            </Tag>
          </List.Item>
        )}
      />
    </WidgetCard>
  );
}

export default LeadsFollowUpWidget;
