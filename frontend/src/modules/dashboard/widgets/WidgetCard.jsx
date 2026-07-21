import { Card, Spin, Alert, Empty } from "antd";

/**
 * Shared presentational shell every dashboard widget renders through —
 * loading/error/empty states look identical across widgets, and (the whole
 * point) a widget's own fetch failing only ever replaces THIS card's body
 * with an inline error, never throws up to `DashboardPage` and takes any
 * other widget down with it.
 */
function WidgetCard({ title, isLoading, error, isEmpty, emptyDescription = "No data yet", children }) {
  return (
    <Card title={title} className="h-full">
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      ) : error ? (
        <Alert type="error" message="Couldn't load this widget" showIcon />
      ) : isEmpty ? (
        <Empty description={emptyDescription} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        children
      )}
    </Card>
  );
}

export default WidgetCard;
