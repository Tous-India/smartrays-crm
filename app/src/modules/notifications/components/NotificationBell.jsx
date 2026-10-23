import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors } from "../../../theme";

/** The bell at the top of Home (2026-10-23): unread count, opens the notifications list. */
function NotificationBell({ unread, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      hitSlop={8}
      style={styles.bell}
      testID="notification-bell"
    >
      <Ionicons name="notifications-outline" size={26} color={colors.brandNavy} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.count} testID="notification-bell-count">
            {unread > 9 ? "9+" : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { color: colors.textOnBrand, fontSize: 11, fontWeight: "700" },
});

export default NotificationBell;
