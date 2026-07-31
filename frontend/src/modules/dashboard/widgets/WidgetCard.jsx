import { Card, Spin, Alert, Empty } from "antd";

/**
 * Shared presentational shell every dashboard widget renders through —
 * loading/error/empty states look identical across widgets, and (the whole
 * point) a widget's own fetch failing only ever replaces THIS card's body
 * with an inline error, never throws up to `DashboardPage` and takes any
 * other widget down with it.
 *
 * Tightened per the UI/UX pass — these are glance-summary cards, not page
 * headers: `size="small"` shrinks AntD's default Card padding/head height,
 * the title renders at `text-sm` instead of Card's default ~16px bold, and
 * the empty state drops AntD's illustrated `PRESENTED_IMAGE_SIMPLE` graphic
 * entirely (`image={false}`) — at this card's scale a large empty-inbox
 * icon reads as more prominent than the actual "No leads yet"-style text
 * next to it, the opposite of what a compact summary card wants.
 */
function WidgetCard({ title, isLoading, error, isEmpty, emptyDescription = "No data yet", children }) {
  return (
    <Card
      size="small"
      title={<span className="text-sm font-medium">{title}</span>}
      className="app-dashboard-widget-card h-full"
    >
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spin size="small" />
        </div>
      ) : error ? (
        <Alert type="error" message="Couldn't load this widget" showIcon className="text-sm" />
      ) : isEmpty ? (
        <Empty description={<span className="text-sm text-gray-400">{emptyDescription}</span>} image={false} />
      ) : (
        children
      )}
    </Card>
  );
}

export default WidgetCard;
