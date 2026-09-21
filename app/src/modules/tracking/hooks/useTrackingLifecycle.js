import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as tracking from "../trackingAdapter";
import { flushQueue } from "../pingQueue.service";
import { getTrackingState, syncTrackingWithShift, TRACKING_STATUS } from "../tracking.service";
import { FLUSH_INTERVAL_MS } from "../../../constants/tracking.constants";

/**
 * Keeps the engine in step with the shift while the home screen is mounted,
 * and reports what the shift card should say.
 *
 * - `openRecord` changes (check-in, check-out, relaunch) → sync the engine.
 * - Every fix the engine reports, and every FLUSH_INTERVAL_MS while online,
 *   push the queue. Coming back online pushes immediately.
 * - The app returning to the foreground re-syncs, so a permission changed
 *   in the settings is picked up without a relaunch.
 */
function useTrackingLifecycle({ openRecord, isOnline, attendanceLoaded }) {
  const [state, setState] = useState({ status: TRACKING_STATUS.OFF, reason: null, queuedCount: 0, lastCapturedAt: null });
  const wasOnline = useRef(isOnline);

  const refresh = useCallback(async () => {
    try {
      setState(await getTrackingState(openRecord));
    } catch (error) {
      // The engine is unreachable (not linked): the card keeps its last state.
    }
  }, [openRecord]);

  const sync = useCallback(async () => {
    if (!attendanceLoaded) {
      return;
    }

    try {
      await syncTrackingWithShift(openRecord);
    } catch (error) {
      console.log(`[tracking] sync failed: ${error.message}`);
    }

    refresh();
  }, [attendanceLoaded, openRecord, refresh]);

  useEffect(() => {
    sync();
  }, [sync]);

  // A fix landed while the app is open: count it, and push it up if we can.
  useEffect(() => {
    const unsubscribe = tracking.onPing(() => {
      refresh();

      if (isOnline) {
        flushQueue().then(refresh).catch(() => {});
      }
    });

    return unsubscribe;
  }, [isOnline, refresh]);

  useEffect(() => {
    if (!isOnline) {
      wasOnline.current = false;
      return undefined;
    }

    if (!wasOnline.current) {
      wasOnline.current = true;
      flushQueue().then(refresh).catch(() => {});
    }

    const timer = setInterval(() => {
      flushQueue().then(refresh).catch(() => {});
    }, FLUSH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isOnline, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        sync();
      }
    });

    return () => subscription.remove();
  }, [sync]);

  return { trackingState: state, refreshTracking: refresh };
}

export default useTrackingLifecycle;
