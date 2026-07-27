import { Column } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getLeadsByClientType } from "../api/analyticsApi";
import { CLIENT_TYPE_LABELS } from "../../lead/constants/lead.constants";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 4 — count of leads grouped by clientType. Column rather than
// Pie here, since Leads by Source (above) already uses Pie — a second Pie
// right next to it would read as visually redundant for a different axis.
function LeadsByClientTypeChart() {
  const { data, isLoading, error } = useAnalyticsQuery(getLeadsByClientType, undefined, { defaultValue: [] });

  const chartData = (data || []).map((row) => ({
    clientType: CLIENT_TYPE_LABELS[row.clientType] || row.clientType,
    count: row.count,
  }));

  return (
    <ChartSectionCard
      title="Leads by Client Type"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No leads yet"
    >
      <Column data={chartData} xField="clientType" yField="count" height={260} />
    </ChartSectionCard>
  );
}

export default LeadsByClientTypeChart;
