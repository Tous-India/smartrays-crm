import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Row, Col, Statistic } from "antd";
import { overdueText } from "../../complaint/utils/complaintTime";
import { usePermission } from "../../../hooks/usePermission";
import { listTickets } from "../../ticket/api/ticketApi";
import WidgetCard from "./WidgetCard";

/**
 * Total open tickets + open-but-unassigned tickets, admin/manager per
 * `tickets.view_all` (§5's matrix). Reuses `listTickets("all")` — the same
 * scoped fetch a future Tickets list page would call for that scope — and
 * derives both counts client-side, since `GET /tickets` has no
 * status/assignment aggregation of its own.
 */
function TicketsOpenWidget() {
  const canView = usePermission("tickets", "view_all");
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listTickets("all")
      .then((response) => {
        if (cancelled) {
          return;
        }
        // 2026-10-22: customer complaints. "Waiting" = not picked up yet;
        // "Overdue" = past the escalation rule (not picked up in 4 h, or not
        // resolved in 48 h — complaintTime.js, the server's figures).
        const tickets = response.data.data;
        setOpenCount(tickets.filter((ticket) => ticket.status === "open").length);
        setOverdueCount(tickets.filter((ticket) => overdueText(ticket)).length);
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
    <WidgetCard title="Customer complaints" isLoading={isLoading} error={error} isEmpty={false}>
      <Row gutter={16}>
        <Col span={12}>
          <Statistic
            title={<span className="text-xs text-gray-500">Waiting</span>}
            value={openCount}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<span className="text-xs text-gray-500">Overdue</span>}
            value={overdueCount}
            valueStyle={{ fontSize: 20, color: overdueCount > 0 ? "#cf1322" : undefined }}
          />
        </Col>
      </Row>
      {/* Tickets came back as Complaints (2026-10-22), so the link has a real destination again. */}
      <Link to="/complaints" className="mt-3 inline-block">View complaints →</Link>
    </WidgetCard>
  );
}

export default TicketsOpenWidget;
