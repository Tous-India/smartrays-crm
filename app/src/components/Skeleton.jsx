import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import useReduceMotion from "../hooks/useReduceMotion";
import { colors, radius, spacing } from "../theme";

/**
 * A placeholder block shaped like the text or control that is coming
 * (STEP: loading animations). One primitive, `SkeletonBlock`, plus the row
 * shapes the lists use — so a screen never writes its own loader.
 *
 * The shimmer is a slow opacity pulse driven by React Native's own
 * `Animated` on the native driver: no gradient library, no reanimated, no
 * Lottie — a few hundred bytes of JS against a dependency, for an effect
 * nobody should notice. With the OS "remove animations" setting on, the
 * pulse never starts and the blocks are drawn flat (`useReduceMotion`).
 *
 * Nothing here delays anything: the caller swaps skeletons for real rows the
 * moment the data arrives.
 */
const PULSE_MS = 900;
const DIM = 0.45;

export function SkeletonBlock({ width, height = 12, style, radius: blockRadius = radius.sm, testID }) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: DIM, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[styles.block, { width, height, borderRadius: blockRadius, opacity: pulse }, style]}
    />
  );
}

/** A card-shaped placeholder: the frame a real Card draws, with blocks inside. */
export function SkeletonCard({ children, testID }) {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

/**
 * The row shapes. Each mirrors the real component's layout closely enough
 * that nothing jumps when the data lands: a title line, a meta line, and
 * whatever sits on the right.
 */
export function ServiceSkeletonRow() {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        <SkeletonBlock width="58%" height={14} />
        <SkeletonBlock width={64} height={18} radius={radius.sm} />
      </View>
      <SkeletonBlock width="80%" height={10} style={styles.meta} />
    </SkeletonCard>
  );
}

export function LeaveSkeletonRow() {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        <SkeletonBlock width="52%" height={14} />
        <SkeletonBlock width={72} height={18} radius={radius.sm} />
      </View>
      <SkeletonBlock width="66%" height={10} style={styles.meta} />
    </SkeletonCard>
  );
}

export function AttendanceSkeletonRow() {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        <SkeletonBlock width="40%" height={14} />
        <SkeletonBlock width={60} height={18} radius={radius.sm} />
      </View>
      <SkeletonBlock width="72%" height={10} style={styles.meta} />
    </SkeletonCard>
  );
}

export function TeamSkeletonRow() {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width={80} height={18} radius={radius.sm} />
      </View>
      <SkeletonBlock width="60%" height={10} style={styles.meta} />
    </SkeletonCard>
  );
}

/** A plain two-line card, for lists with no shape of their own yet. */
export function GenericSkeletonRow() {
  return (
    <SkeletonCard>
      <SkeletonBlock width="55%" height={14} />
      <SkeletonBlock width="80%" height={10} style={styles.meta} />
    </SkeletonCard>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.brandPanelAlt },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  meta: { marginTop: spacing.md },
});

export default SkeletonBlock;
