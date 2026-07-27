import { Column } from "@ant-design/charts";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getCustomersContractValue } from "../api/analyticsApi";
import { CONTRACT_TYPE_LABELS } from "../../customer/constants/customer.constants";
import ChartSectionCard from "./ChartSectionCard";

// Endpoint 7 — sum + count of Contract value grouped by type.
function CustomersContractValueChart() {
  const { data, isLoading, error } = useAnalyticsQuery(getCustomersContractValue, undefined, { defaultValue: [] });

  const chartData = (data || []).map((row) => ({
    type: CONTRACT_TYPE_LABELS[row.type] || row.type,
    totalValue: row.totalValue,
  }));

  return (
    <ChartSectionCard
      title="Contract Value by Type"
      isLoading={isLoading}
      error={error}
      isEmpty={chartData.length === 0}
      emptyDescription="No contracts yet"
    >
      <Column data={chartData} xField="type" yField="totalValue" height={260} />
    </ChartSectionCard>
  );
}

export default CustomersContractValueChart;
