import { useMemo } from "react";
import dayjs from "dayjs";
import { Card, Col, Row, Statistic, Tooltip, Typography } from "antd";

const { Text } = Typography;

/**
 * Admin-facing leave stats for the Leave Requests tab (§B3, 2026-08-05).
 *
 * Replaces `LeaveBalanceCard`, which showed the VIEWER's own paid-leave
 * balance — a personal metric that told an admin nothing about the queue
 * they were there to work. (The employee's own balance card is untouched
 * and still leads their own Apply Leave / My Leave tabs.)
 *
 * All four are derived from the leave list already fetched for this tab —
 * no extra requests. Each answers a question an approver actually has:
 * - **Pending Requests** — what needs action right now.
 * - **On Leave Today** — who is absent as you read this, named, because
 *   "3 people" is not actionable but "Priya, Sam, Dev" is.
 * - **Upcoming This Week** — staffing visibility before it bites.
 * - **Unapproved Absences (month)** — feeds the 2x payroll deduction rule,
 *   so it belongs in front of the person who applies it.
 */
function LeaveAdminStats({ leaveRequests, employeeNameById }) {
  const stats = useMemo(() => {
    const today = dayjs();
    const weekEnd = today.add(7, "day").endOf("day");
    const monthStart = today.startOf("month");
    const monthEnd = today.endOf("month");

    // A request covers a day when that day falls inside [startDate, endDate]
    // — an overlap check, not a startDate match, so a multi-day leave counts
    // on every day it spans rather than only the day it began.
    const covers = (leave, day) =>
      !dayjs(leave.startDate).isAfter(day, "day") && !dayjs(leave.endDate).isBefore(day, "day");

    const pending = leaveRequests.filter((leave) => leave.status === "pending");

    const onLeaveToday = leaveRequests.filter(
      (leave) => leave.status === "approved" && covers(leave, today)
    );

    const upcoming = leaveRequests.filter(
      (leave) =>
        leave.status === "approved" &&
        dayjs(leave.startDate).isAfter(today, "day") &&
        !dayjs(leave.startDate).isAfter(weekEnd, "day")
    );

    const unapprovedAbsences = leaveRequests.filter(
      (leave) =>
        leave.isDoubleDeduction &&
        !dayjs(leave.startDate).isBefore(monthStart, "day") &&
        !dayjs(leave.startDate).isAfter(monthEnd, "day")
    );

    return { pending, onLeaveToday, upcoming, unapprovedAbsences };
  }, [leaveRequests]);

  const namesOf = (requests) =>
    requests.map((leave) => employeeNameById.get(String(leave.employeeId)) || "Unknown").join(", ");

  const todayNames = namesOf(stats.onLeaveToday);

  return (
    <Row gutter={[12, 12]}>
      <Col xs={12} lg={6}>
        <Card size="small" className="app-elevated-card">
          <Statistic
            title="Pending Requests"
            value={stats.pending.length}
            valueStyle={{ color: stats.pending.length > 0 ? "#d46b08" : undefined }}
          />
        </Card>
      </Col>

      <Col xs={12} lg={6}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="On Leave Today" value={stats.onLeaveToday.length} />
          {todayNames && (
            <Tooltip title={todayNames}>
              <Text type="secondary" className="block truncate text-xs" data-testid="on-leave-today-names">
                {todayNames}
              </Text>
            </Tooltip>
          )}
        </Card>
      </Col>

      <Col xs={12} lg={6}>
        <Card size="small" className="app-elevated-card">
          <Statistic title="Upcoming This Week" value={stats.upcoming.length} />
        </Card>
      </Col>

      <Col xs={12} lg={6}>
        <Card size="small" className="app-elevated-card">
          <Statistic
            title="Unapproved Absences"
            value={stats.unapprovedAbsences.length}
            valueStyle={{ color: stats.unapprovedAbsences.length > 0 ? "#cf1322" : undefined }}
          />
          <Text type="secondary" className="text-xs">
            this month · 2× deduction
          </Text>
        </Card>
      </Col>
    </Row>
  );
}

export default LeaveAdminStats;
