import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useIsOnline from "../hooks/useIsOnline";
import { colors, spacing, typography } from "../theme";

/**
 * The frame every screen renders in: safe area, the page background, and a
 * scroll view that keeps taps on buttons working while the keyboard is up.
 * `centered` puts short content (a form) in the vertical middle. `onRefresh`
 * adds pull-to-refresh to the scroll view (`refreshing` is the spinner).
 * Offline (2026-10-23), a slim banner on top says so — on every screen, the
 * same way; the screens still decide which of their buttons need the server.
 */
function Screen({ children, centered = false, scroll = true, onRefresh, refreshing = false, testID }) {
  const content = (
    <View style={[styles.content, centered && styles.centered]} testID={testID}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <OfflineBanner />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, centered && styles.centered]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brandNavy]} /> : undefined
            }
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) {
    return null;
  }

  return (
    <View style={styles.offline} testID="offline-banner" accessibilityRole="alert">
      <Text style={[typography.small, styles.offlineText]}>
        No internet — showing what was last loaded. Your locations are saved and upload when you are back online.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offline: { backgroundColor: colors.dangerBg, borderBottomWidth: 1, borderBottomColor: colors.dangerBorder, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  offlineText: { color: colors.danger, fontWeight: "600" },
  safeArea: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  centered: { justifyContent: "center" },
});

export default Screen;
