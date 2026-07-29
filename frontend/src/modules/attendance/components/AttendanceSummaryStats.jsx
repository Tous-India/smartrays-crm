import { Card, Statistic, Row, Col } from "antd";
import { computeAttendanceSummary } from "../utils/attendanceSummary";

/**
 * Present/Absent/Half Day/On Leave counts + attendance rate for the
 * currently-selected month — reused by both Personal and Team Attendance
 * views, same "one shared render component" precedent `AttendanceTimeline`
 * already established. Pure client-side computation over the `records`
 * already fetched for the view (see `attendanceSummary.js`); no new
 * endpoint needed.
 */
function AttendanceSummaryStats({ records, month }) {
  const summary = computeAttendanceSummary(records, month);

  return (
    <Row gutter={12}>
      <Col xs={12} sm={8} md={4}>
        <Card size="small">
          <Statistic title="Present" value={summary.present} valueStyle={{ color: "#389e0d" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small">
          <Statistic title="Absent" value={summary.absent} valueStyle={{ color: "#cf1322" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small">
          <Statistic title="Half Day" value={summary.half_day} valueStyle={{ color: "#d46b08" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small">
          <Statistic title="On Leave" value={summary.on_leave} valueStyle={{ color: "#1d39c4" }} />
        </Card>
      </Col>
      <Col xs={24} sm={8} md={8}>
        <Card size="small">
          <Statistic
            title={`Attendance Rate (of ${summary.workingDays} working days)`}
            value={summary.attendanceRate}
            suffix="%"
          />
        </Card>
      </Col>
    </Row>
  );
}

export default AttendanceSummaryStats;
