import { Line } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getLeadsConversion } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 2 — won vs total leads per month, plotted as a conversionRate
// (%) trend line, date-range filtered by the page's shared filter.
function LeadsConversionChart({ dateRange }) {
  const { data, isLoading, error } = useAnalyticsQuery(getLeadsConversion, dateRange, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Leads Conversion Rate"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No leads in this range"
    >
      <Line data={chartData} xField="month" yField="conversionRate" height={260} />
    </ChartSectionCard>
  );
}

export default LeadsConversionChart;
