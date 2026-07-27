import { Pie } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getLeadsBySource } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 3 — count of leads grouped by source.
function LeadsBySourceChart() {
  const { data, isLoading, error } = useAnalyticsQuery(getLeadsBySource, undefined, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Leads by Source"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No leads yet"
    >
      <Pie data={chartData} angleField="count" colorField="source" height={260} label={{ text: "count" }} />
    </ChartSectionCard>
  );
}

export default LeadsBySourceChart;
