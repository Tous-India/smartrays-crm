import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import LinkText from "../../../components/LinkText";
import useServerData from "../../../hooks/useServerData";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notificationApi";
import { rootRouteForNotification } from "../../push/pushNavigation";
import { formatDate, formatTime } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Notifications (2026-10-23): everything the server has sent me, newest
 * first — the in-app twin of the web's bell, so nothing depends on push
 * reaching the phone. Unread ones carry a dot; a tap marks it read and opens
 * what it is about (the same routing as tapping the push itself).
 */
function NotificationsScreen({ navigation }) {
  const notifications = useServerData(async () => (await listNotifications()).data.data, { initialData: [] });
  const unread = notifications.data.filter((notification) => !notification.isRead).length;

  async function open(notification) {
    if (!notification.isRead) {
      markNotificationRead(notification._id).catch(() => {});
    }
    const target = rootRouteForNotification({ type: notification.type, id: notification.relatedEntity?.id ? String(notification.relatedEntity.id) : undefined });
    navigation.navigate(target.name, target.params);
  }

  async function markAll() {
    await markAllNotificationsRead().catch(() => {});
    notifications.refetch();
  }

  return (
    <Screen onRefresh={notifications.refetch} refreshing={notifications.isRefreshing} testID="notifications-screen">
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "All read"}
        onBack={() => navigation.goBack()}
        right={unread > 0 ? <LinkText title="Mark all read" onPress={markAll} testID="notifications-mark-all" /> : null}
      />
      <ListState
        isLoading={notifications.isLoading}
        error={notifications.error}
        onRetry={notifications.refetch}
        isEmpty={!notifications.isLoading && notifications.data.length === 0}
        emptyText="No notifications yet."
        testID="notifications-list"
      />
      {!notifications.isLoading && !notifications.error
        ? notifications.data.map((notification) => (
            <Card key={notification._id} onPress={() => open(notification)} testID={`notification-${notification._id}`}>
              <View style={styles.row}>
                {!notification.isRead ? <View style={styles.dot} testID={`notification-unread-${notification._id}`} /> : <View style={styles.dotSpace} />}
                <View style={styles.body}>
                  <Text style={[typography.body, !notification.isRead && styles.unreadText]}>{notification.message}</Text>
                  <Text style={[typography.small, styles.when]}>
                    {formatDate(notification.createdAt)} · {formatTime(notification.createdAt)}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandNavy, marginTop: 6 },
  dotSpace: { width: 10 },
  body: { flex: 1 },
  unreadText: { fontWeight: "600" },
  when: { marginTop: spacing.xs },
});

export default NotificationsScreen;
