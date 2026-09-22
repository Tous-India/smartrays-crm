import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "../theme";

/**
 * The raised white card the shift card introduced (TodayShiftCard): the one
 * surface for a block of content. With `onPress` it is a tappable row card
 * (a service, a leave request) and says so to a screen reader.
 */
function Card({ children, onPress, style, testID }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.8 },
});

export default Card;
