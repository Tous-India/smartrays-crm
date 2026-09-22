import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import usePushStore from "../modules/push/pushStore";
import { colors, radius, spacing, typography } from "../theme";

/** How long a foreground notice stays before it slides away on its own. */
const AUTO_DISMISS_MS = 8000;

/**
 * The in-app banner for a push that arrived while the app was open
 * (STEP 4). Sits above the navigator; a tap goes where the notification
 * would have, the cross or eight seconds dismisses it.
 */
function PushNotice({ onOpen }) {
  const notice = usePushStore((state) => state.notice);
  const dismiss = usePushStore((state) => state.dismissNotice);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="push-notice">
      <Pressable
        onPress={() => {
          dismiss();
          onOpen(notice.data);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}. ${notice.body}`}
        style={styles.banner}
        testID="push-notice-open"
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textOnBrand} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {notice.title}
          </Text>
          {notice.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {notice.body}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.close} testID="push-notice-dismiss">
          <Ionicons name="close" size={20} color={colors.textOnBrand} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: spacing.md, zIndex: 10 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandNavy,
    borderRadius: radius.lg,
    padding: spacing.md,
    elevation: 6,
  },
  text: { flex: 1 },
  title: { ...typography.body, color: colors.textOnBrand, fontWeight: "600" },
  body: { ...typography.small, color: colors.textOnBrand, opacity: 0.9, marginTop: 2 },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});

export default PushNotice;
