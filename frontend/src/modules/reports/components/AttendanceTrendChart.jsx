import { Line } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getAttendanceTrend } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 10 — present-days/working-days ratio per month, date-range
// filtered. Admin sees org-wide, manager sees their team (view_all/
// view_team, resolved server-side).
function AttendanceTrendChart({ dateRange }) {
  const { data, isLoading, error } = useAnalyticsQuery(getAttendanceTrend, dateRange, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Attendance Rate Trend"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No attendance records in this range"
    >
      <Line data={chartData} xField="month" yField="attendanceRate" height={260} />
    </ChartSectionCard>
  );
}

export default AttendanceTrendChart;
