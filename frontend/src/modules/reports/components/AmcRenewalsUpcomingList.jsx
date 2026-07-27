import { useState } from "react";
import { Select, List, Tag } from "antd";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { getAmcRenewalsUpcoming } from "../api/analyticsApi";
import ChartSectionCard from "./ChartSectionCard";

const DAY_WINDOW_OPTIONS = [
  { value: 7, label: "Next 7 days" },
  { value: 15, label: "Next 15 days" },
  { value: 30, label: "Next 30 days" },
  { value: 60, label: "Next 60 days" },
  { value: 90, label: "Next 90 days" },
];

// Endpoint 9 — AMC records renewing within a day window (default 30). A
// list, not a chart, per this task's own spec.
function AmcRenewalsUpcomingList() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useAnalyticsQuery(getAmcRenewalsUpcoming, days, {
    defaultValue: { count: 0, renewals: [] },
  });

  const renewals = data?.renewals || [];

  return (
    <ChartSectionCard
      title="Upcoming AMC Renewals"
      extra={
        <Select value={days} onChange={setDays} options={DAY_WINDOW_OPTIONS} size="small" style={{ width: 140 }} />
      }
      isLoading={isLoading}
      error={error}
      isEmpty={renewals.length === 0}
      emptyDescription="No renewals due in this window"
    >
      <List
        size="small"
        dataSource={renewals}
        renderItem={(renewal) => (
          <List.Item>
            <div className="flex w-full items-center justify-between">
              <span>{renewal.customerName}</span>
              <span className="flex items-center gap-2">
                <Tag color="blue">{new Date(renewal.renewalDate).toLocaleDateString()}</Tag>
                <span className="text-gray-500">
                  {renewal.amount != null ? renewal.amount.toLocaleString() : "—"}
                </span>
              </span>
            </div>
          </List.Item>
        )}
      />
    </ChartSectionCard>
  );
}

export default AmcRenewalsUpcomingList;
