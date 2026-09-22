import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import TextField, { TRAILING_WIDTH } from "./TextField";
import { colors } from "../theme";

/**
 * A TextField for a password, with an eye button at its right end that shows
 * or hides what was typed. The field starts hidden; whether it is hidden is
 * the caller's state (`hidden` / `onToggleHidden`), so a screen can put it
 * back to hidden when the user leaves — a password left visible on a screen
 * that is later returned to is the thing to avoid.
 *
 * The button is a Pressable, not a focusable control: tapping it does not
 * take focus from the input, so the keyboard stays and the caret stays. Only
 * `secureTextEntry` changes; the value is untouched.
 */
function PasswordField({ hidden, onToggleHidden, testID, ...fieldProps }) {
  const toggle = (
    <Pressable
      onPress={onToggleHidden}
      accessibilityRole="button"
      accessibilityLabel={hidden ? "Show password" : "Hide password"}
      hitSlop={4}
      style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      testID={testID ? `${testID}-toggle` : undefined}
    >
      <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={22} color={colors.textSecondary} />
    </Pressable>
  );

  return <TextField {...fieldProps} testID={testID} secureTextEntry={hidden} trailing={toggle} />;
}

const styles = StyleSheet.create({
  // The whole reserved column is the target: at least 44 × 44.
  toggle: { width: TRAILING_WIDTH, minHeight: 44, alignSelf: "stretch", justifyContent: "center", alignItems: "center" },
  togglePressed: { opacity: 0.6 },
});

export default PasswordField;
