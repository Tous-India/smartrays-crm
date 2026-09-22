import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

/** A labelled on/off switch in a form row ("Half day"). */
function ToggleRow({ label, hint, value, onValueChange, testID }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={typography.body}>{label}</Text>
        {hint ? <Text style={[typography.small, styles.hint]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.disabledBg, true: colors.brandGreen }}
        thumbColor={colors.card}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg, gap: spacing.md },
  text: { flex: 1 },
  hint: { marginTop: 2 },
});

export default ToggleRow;
