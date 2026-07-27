import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List } from "antd";
import { FireFilled } from "@ant-design/icons";
import { usePermission } from "../../../hooks/usePermission";
import { listLeads } from "../../lead/api/leadApi";
import WidgetCard from "./WidgetCard";

/**
 * Hot leads — `GET /leads` has no server-side `isHot` filter (only
 * search/followUp/status/owner, see `lead.service.js#listLeads`), so this
 * fetches the same scoped, unfiltered list every other Leads widget does and
 * filters client-side — the same precedent Team Attendance already set for
 * a filter the backend doesn't expose (`TeamAttendanceView`'s employee
 * selector).
 */
function LeadsHotWidget() {
  const canView = usePermission("leads", "view");
  const [hotLeads, setHotLeads] = useState([]);
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
          setHotLeads(response.data.data.filter((lead) => lead.isHot));
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

  return (
    <WidgetCard
      title="Hot Leads"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && hotLeads.length === 0}
      emptyDescription="No hot leads right now"
    >
      <List
        size="small"
        dataSource={hotLeads.slice(0, 5)}
        renderItem={(lead) => (
          <List.Item>
            {/* `style` for color, not a Tailwind className — AntD's `List`
                sets its own text color on item content that a plain utility
                class loses to (same issue found and fixed on the Leads
                table/detail hot-toggle and detail drawer title). */}
            <FireFilled className="mr-2" style={{ color: "#fa8c16" }} title="Hot lead" />
            <Link to={`/leads/${lead._id}`}>{lead.name}</Link>
          </List.Item>
        )}
      />
    </WidgetCard>
  );
}

export default LeadsHotWidget;
