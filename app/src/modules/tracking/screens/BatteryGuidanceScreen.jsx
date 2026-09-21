import { Linking, StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import PrimaryButton from "../../../components/PrimaryButton";
import LinkText from "../../../components/LinkText";
import { getOemGuidance } from "../oem.utils";
import * as tracking from "../trackingAdapter";
import { TRACKING_FLAGS } from "../../../constants/tracking.constants";
import { openAppSettings } from "../../../utils/permissions.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * "Keep tracking alive on this phone" (app-plan.md §1.4) — shown once, after
 * the first successful check-in on a flagged manufacturer. Each step is the
 * vendor's own menu wording; the buttons open the settings and let the user
 * choose. Deliberately NOT the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog
 * (Play restricts it): the system's own battery-optimisation list is opened
 * instead, where the user picks the app themselves.
 */
function BatteryGuidanceScreen({ navigation }) {
  const guidance = getOemGuidance();

  async function handleDone() {
    await tracking.setFlag(TRACKING_FLAGS.BATTERY_GUIDANCE, `done|${new Date().toISOString()}`);
    navigation.goBack();
  }

  function openBatterySettings() {
    Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(() => openAppSettings());
  }

  return (
    <Screen testID="battery-guidance-screen">
      <Text style={typography.title}>Keep tracking alive on this phone</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>
        {guidance ? `${guidance.label} phones` : "Some phones"} stop background apps to save battery, which would end
        your shift tracking without telling anyone. Three settings keep it running.
      </Text>

      <View style={styles.card}>
        {(guidance ? guidance.steps : []).map((step, index) => (
          <Text key={step} style={[typography.body, styles.step]}>
            {index + 1}. {step}
          </Text>
        ))}
      </View>

      <PrimaryButton title="Open battery settings" onPress={openBatterySettings} testID="battery-open-settings" />
      <PrimaryButton title="Open app settings" onPress={openAppSettings} testID="battery-open-app-settings" style={styles.secondButton} />

      <View style={styles.footer}>
        <LinkText title="Done" onPress={handleDone} testID="battery-done" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs + 2, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  step: { marginBottom: spacing.md },
  secondButton: { marginTop: spacing.md },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});

export default BatteryGuidanceScreen;
