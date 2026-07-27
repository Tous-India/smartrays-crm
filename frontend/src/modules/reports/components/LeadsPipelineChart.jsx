import { Column } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getLeadsPipeline } from "../api/analyticsApi";
import { LEAD_STATUS_LABELS } from "../../lead/constants/lead.constants";
import ChartSectionCard from "./ChartSectionCard";

/**
 * Endpoint 1 — count of leads grouped by status. A Column chart (rather
 * than Funnel): Lead status isn't a strictly monotonically-narrowing
 * pipeline (a lead can sit in any status independent of how many came
 * before it, and "lost" isn't a sub-stage of "won"), so a bar-per-status
 * count reads more honestly than a Funnel implies.
 */
function LeadsPipelineChart() {
  const { data, isLoading, error } = useAnalyticsQuery(getLeadsPipeline, undefined, { defaultValue: [] });

  const chartData = (data || []).map((row) => ({
    status: LEAD_STATUS_LABELS[row.status] || row.status,
    count: row.count,
  }));

  return (
    <ChartSectionCard
      title="Leads Pipeline"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No leads yet"
    >
      <Column data={chartData} xField="status" yField="count" height={260} />
    </ChartSectionCard>
  );
}

export default LeadsPipelineChart;
