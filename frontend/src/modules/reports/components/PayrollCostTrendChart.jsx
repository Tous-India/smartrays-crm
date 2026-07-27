import { Column } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getPayrollCostTrend } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 11 — sum of Payroll netAmount per month, date-range filtered,
// admin-only (Payroll has no team tier at all, §5's matrix).
function PayrollCostTrendChart({ dateRange }) {
  const { data, isLoading, error } = useAnalyticsQuery(getPayrollCostTrend, dateRange, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Payroll Cost Trend"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No payroll history in this range"
    >
      <Column data={chartData} xField="month" yField="totalCost" height={260} />
    </ChartSectionCard>
  );
}

export default PayrollCostTrendChart;
