import { Card, Spin, Alert, Empty } from "antd";

/**
 * Shared presentational shell every analytics chart section renders
 * through — the same loading/error/empty-state contract as the Dashboard's
 * `WidgetCard`, sized for a full chart instead of a glance-summary card. A
 * section's own fetch failing only ever replaces THIS card's body with an
 * inline error, never anything else on the page.
 */
function ChartSectionCard({ title, extra, isLoading, error, isEmpty, emptyDescription = "No data yet", children }) {
  return (
    <Card title={<span className="text-sm font-medium">{title}</span>} extra={extra} className="h-full">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : error ? (
        <Alert type="error" message="Couldn't load this chart" showIcon />
      ) : isEmpty ? (
        <Empty description={<span className="text-sm text-gray-400">{emptyDescription}</span>} />
      ) : (
        children
      )}
    </Card>
  );
}

export default ChartSectionCard;
