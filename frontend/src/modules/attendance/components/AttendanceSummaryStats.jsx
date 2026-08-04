import { Card, Statistic, Row, Col } from "antd";
import { computeAttendanceSummary } from "../utils/attendanceSummary";

/**
 * Present/Absent/Half Day/On Leave counts + attendance rate for the
 * currently-selected month — reused by both Personal and Team Attendance
 * views, same "one shared render component" precedent `AttendanceTimeline`
 * already established. Pure client-side computation over the `records`
 * already fetched for the view (see `attendanceSummary.js`); no new
 * endpoint needed.
 *
 * **`app-elevated-card` (BUG 1, 2026-08-04)** — the shared card-shadow
 * class was never actually applied here despite being requested twice:
 * confirmed via `git log` that this file had only ever been touched by its
 * original feature-build commit, never by one adding a shadow className.
 * Not a CSS specificity/override issue and not a reverted commit — the
 * class itself (`frontend/src/styles/index.css`) already exists and
 * already works correctly elsewhere (Dashboard stat cards, Customer
 * Detail's section cards); it was simply never wired onto these five
 * `<Card>` elements' `className`.
 */
function AttendanceSummaryStats({ records, month }) {
  const summary = computeAttendanceSummary(records, month);

  return (
    <Row gutter={12}>
      <Col xs={12} sm={8} md={4}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="Present" value={summary.present} valueStyle={{ color: "#389e0d" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="Absent" value={summary.absent} valueStyle={{ color: "#cf1322" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="Half Day" value={summary.half_day} valueStyle={{ color: "#d46b08" }} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={4}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="On Leave" value={summary.on_leave} valueStyle={{ color: "#1d39c4" }} />
        </Card>
      </Col>
      <Col xs={24} sm={8} md={8}>
        <Card size="small" className="app-elevated-card">
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
