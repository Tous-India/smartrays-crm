import { useEffect, useState } from "react";
import { Row, Col, Statistic } from "antd";
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
  const [unassignedCount, setUnassignedCount] = useState(0);
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
        const openTickets = response.data.data.filter((ticket) => ticket.status === "open");
        setOpenCount(openTickets.length);
        setUnassignedCount(openTickets.filter((ticket) => !ticket.assignedToId).length);
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
    <WidgetCard title="Open Tickets" isLoading={isLoading} error={error} isEmpty={false}>
      <Row gutter={16}>
        <Col span={12}>
          <Statistic
            title={<span className="text-xs text-gray-500">Open</span>}
            value={openCount}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<span className="text-xs text-gray-500">Unassigned</span>}
            value={unassignedCount}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
      </Row>
      {/* The "View all tickets →" link was removed 2026-08-07 when Tickets
          was deferred from the UI: /tickets no longer resolves, and a link to
          a dead route is exactly the state AmcRenewalsDueWidget has been sat
          in for weeks. The counts themselves still come from a live backend
          that was never touched, so the widget keeps earning its place — it
          just no longer offers a destination that does not exist. */}
    </WidgetCard>
  );
}

export default TicketsOpenWidget;
