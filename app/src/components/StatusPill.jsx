import { StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * A small status chip — the app's version of the web's AntD Tag. `tone`
 * picks the colour: neutral (grey), success (green), danger (red), warning
 * (amber). The words are the caller's; a status is shown as the server
 * spells it.
 */
const TONES = {
  neutral: { backgroundColor: colors.brandPanelAlt, color: colors.textLabel },
  success: { backgroundColor: colors.brandGreen, color: colors.textOnBrand },
  danger: { backgroundColor: colors.dangerBg, color: colors.danger },
  warning: { backgroundColor: "#fff7e6", color: "#ad6800" },
  // Assigned / On the way (2026-10-23) — in hand, nothing wrong.
  info: { backgroundColor: "#e8eef8", color: colors.brandNavy },
};

function StatusPill({ label, tone = "neutral", style, testID }) {
  const palette = TONES[tone] || TONES.neutral;

  return (
    <Text style={[styles.pill, palette, style]} testID={testID}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: {
    ...typography.small,
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
});

export default StatusPill;
