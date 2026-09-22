import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, spacing, typography } from "../theme";

/**
 * A screen's title row: the title, an optional line under it, and a back
 * arrow when the screen sits above another in its tab's stack.
 */
function ScreenHeader({ title, subtitle, onBack, right }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back} testID="screen-back">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <Text style={[typography.title, styles.title]} numberOfLines={2}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? <Text style={[typography.subtitle, styles.subtitle]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  title: { flex: 1 },
  subtitle: { marginTop: spacing.xs },
});

export default ScreenHeader;
