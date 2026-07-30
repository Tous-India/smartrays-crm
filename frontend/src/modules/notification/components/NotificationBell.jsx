import { Badge, Dropdown, Button, Empty, Spin } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import useNotifications from "../hooks/useNotifications";

// Maps `relatedEntity.module` (see backend/src/modules/notification/
// notification.service.js#createNotification callers) to the route that
// entity's detail page lives at.
const MODULE_ROUTES = {
  leads: (id) => `/leads/${id}`,
  tickets: (id) => `/tickets/${id}`,
  // Leave has no per-record detail route — every leave notification just
  // goes to the list page, ignoring `relatedEntity.id`.
  leave: () => "/leave",
};

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * In-app notification bell for the app shell header — polls the existing
 * Notification module (GET /notifications, PATCH /notifications/:id/read,
 * PATCH /notifications/read-all; see useNotifications.js), no new backend
 * endpoints. Deliberately excludes browser push subscription setup
 * (`/notifications/subscribe`) — that's a separate concern from this
 * in-app dropdown.
 */
function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();

  async function handleNotificationClick(notification) {
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }

    const buildRoute = notification.relatedEntity?.module
      ? MODULE_ROUTES[notification.relatedEntity.module]
      : null;

    if (buildRoute && notification.relatedEntity?.id) {
      navigate(buildRoute(notification.relatedEntity.id));
    }
  }

  const panel = (
    <div className="w-96 rounded-md bg-white shadow-lg" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <span className="font-medium">Notifications</span>
        {unreadCount > 0 && (
          <Button type="link" size="small" className="!px-0" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spin size="small" />
          </div>
        ) : notifications.length === 0 ? (
          <Empty description="No notifications yet" image={Empty.PRESENTED_IMAGE_SIMPLE} className="!py-8" />
        ) : (
          notifications.map((notification) => (
            <div
              key={notification._id}
              role="button"
              tabIndex={0}
              className={`cursor-pointer border-b border-gray-50 px-4 py-3 text-sm hover:bg-gray-50 ${
                notification.isRead ? "" : "bg-blue-50/60"
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-2">
                {!notification.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                <div className={notification.isRead ? "ml-4" : ""}>
                  <div className={notification.isRead ? "text-gray-600" : "font-medium text-gray-900"}>
                    {notification.message}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">{timeAgo(notification.createdAt)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      dropdownRender={() => panel}
    >
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined className="!text-white/80" />}
          aria-label="Notifications"
        />
      </Badge>
    </Dropdown>
  );
}

export default NotificationBell;
