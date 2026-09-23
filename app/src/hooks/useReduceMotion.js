import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the OS asks for reduced motion (Settings → Accessibility → Remove
 * animations). Every looping animation in the app reads this: with it on the
 * shimmer stops and a placeholder is drawn flat, which is the point of the
 * setting — the content still loads and the layout is unchanged.
 *
 * Starts `false` and corrects itself on the first answer; a change while the
 * app is open is honoured through the listener.
 */
function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) {
          setReduceMotion(Boolean(enabled));
        }
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(Boolean(enabled));
    });

    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

export default useReduceMotion;
