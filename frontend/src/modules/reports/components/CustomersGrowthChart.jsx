import { Area } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getCustomersGrowth } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 5 — new customers per month (signedUpAt), date-range filtered.
function CustomersGrowthChart({ dateRange }) {
  const { data, isLoading, error } = useAnalyticsQuery(getCustomersGrowth, dateRange, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Customer Growth"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No new customers in this range"
    >
      <Area data={chartData} xField="month" yField="newCustomers" height={260} />
    </ChartSectionCard>
  );
}

export default CustomersGrowthChart;
