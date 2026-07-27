import { Pie } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getCustomersStatusSplit } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 6 — active vs inactive customer count, rendered as a donut
// (Pie with an inner radius) per this task's "Pie/Donut" spec.
function CustomersStatusSplitChart() {
  const { data, isLoading, error } = useAnalyticsQuery(getCustomersStatusSplit, undefined, {
    defaultValue: { active: 0, inactive: 0 },
  });

  const split = data || { active: 0, inactive: 0 };
  const chartData = [
    { status: "Active", count: split.active },
    { status: "Inactive", count: split.inactive },
  ].filter((row) => row.count > 0);

  return (
    <ChartSectionCard
      title="Customer Status Split"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No customers yet"
    >
      <Pie
        data={chartData}
        angleField="count"
        colorField="status"
        innerRadius={0.6}
        height={260}
        label={{ text: "count" }}
      />
    </ChartSectionCard>
  );
}

export default CustomersStatusSplitChart;
