import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Row, Col, Statistic } from "antd";
import { isVisitOverdue } from "../../complaint/utils/complaintTime";
import { usePermission } from "../../../hooks/usePermission";
import { listComplaints } from "../../complaint/api/complaintApi";
import WidgetCard from "./WidgetCard";

/**
 * Customer complaints (2026-10-23) — for whoever sees them all (admin, or
 * complaints.view_all / complaints.assign): how many are not assigned yet,
 * and how many are past their visit date and still not resolved. Derived
 * client-side from the complaints list.
 */
function TicketsOpenWidget() {
  const canAssign = usePermission("complaints", "assign");
  const canView = usePermission("complaints", "view_all") || canAssign;
  const [notAssignedCount, setNotAssignedCount] = useState(0);
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

    listComplaints()
      .then((response) => {
        if (cancelled) {
          return;
        }
        const complaints = response.data.data;
        setNotAssignedCount(complaints.filter((complaint) => complaint.status === "open").length);
        setOverdueCount(complaints.filter((complaint) => isVisitOverdue(complaint)).length);
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
            title={<span className="text-xs text-gray-500">Not assigned</span>}
            value={notAssignedCount}
            valueStyle={{ fontSize: 20, color: notAssignedCount > 0 ? "#cf1322" : undefined }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<span className="text-xs text-gray-500">Visit date passed</span>}
            value={overdueCount}
            valueStyle={{ fontSize: 20, color: overdueCount > 0 ? "#cf1322" : undefined }}
          />
        </Col>
      </Row>
      <Link to="/complaints" className="mt-3 inline-block">View complaints →</Link>
    </WidgetCard>
  );
}

export default TicketsOpenWidget;
