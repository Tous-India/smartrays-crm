import { Line } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getPaymentsTrend } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 8 — sum of Payment amount per month, date-range filtered,
// admin-only (payments.view has no team/own tier, §5's matrix).
function PaymentsTrendChart({ dateRange }) {
  const { data, isLoading, error } = useAnalyticsQuery(getPaymentsTrend, dateRange, { defaultValue: [] });

  const chartData = data || [];

  return (
    <ChartSectionCard
      title="Payments Trend"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No payments in this range"
    >
      <Line data={chartData} xField="month" yField="totalAmount" height={260} />
    </ChartSectionCard>
  );
}

export default PaymentsTrendChart;
