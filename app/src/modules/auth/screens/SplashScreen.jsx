import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import BrandHeader from "../../../components/BrandHeader";
import PrimaryButton from "../../../components/PrimaryButton";
import { colors, spacing, typography } from "../../../theme";

/**
 * Shown while the launch restore runs, and — with a Retry — when tokens exist
 * but the server could not be reached. Never signs anyone out by itself: a
 * dead connection is not a dead session.
 */
function SplashScreen({ unreachable = false, onRetry }) {
  return (
    <View style={styles.container} testID="splash-screen">
      <BrandHeader />
      {unreachable ? (
        <View style={styles.message}>
          <Text style={styles.text}>Could not reach the server. Check your connection and try again.</Text>
          <PrimaryButton title="Retry" onPress={onRetry} testID="splash-retry" style={styles.retry} />
        </View>
      ) : (
        <ActivityIndicator size="large" color={colors.brandNavy} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brandPanel,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  message: { alignItems: "stretch", width: "100%", maxWidth: 360 },
  text: { ...typography.body, textAlign: "center", marginBottom: spacing.lg },
  retry: { alignSelf: "stretch" },
});

export default SplashScreen;
