import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

/**
 * The frame every screen renders in: safe area, the page background, and a
 * scroll view that keeps taps on buttons working while the keyboard is up.
 * `centered` puts short content (a form) in the vertical middle. `onRefresh`
 * adds pull-to-refresh to the scroll view (`refreshing` is the spinner).
 */
function Screen({ children, centered = false, scroll = true, onRefresh, refreshing = false, testID }) {
  const content = (
    <View style={[styles.content, centered && styles.centered]} testID={testID}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  centered: { justifyContent: "center" },
});

export default Screen;
