import { useEffect } from "react";
import { heartbeat } from "../api/attendanceApi";
import { submitLocationPing, fetchLocationConfig } from "../../location/api/locationApi";

/**
 * Cross-module import, same precedent as the backend's own
 * `attendance.service.js#checkOut` calling directly into
 * `transport/travelLog.service.js` to auto-generate a TravelLog — a
 * checked-in shift is fundamentally the thing driving both signals here,
 * so this hook lives under `attendance/` (it starts/stops with attendance's
 * own check-in state) but reaches into `location`'s API for the ping call
 * rather than duplicating it or awkwardly inverting the dependency.
 */

// The backend's own env.js comment states the assumption this feature was
// designed against directly: ATTENDANCE_GAP_THRESHOLD_MINUTES defaults to
// 10, "roughly two missed heartbeats at the expected ~2-5 minute client
// cadence before flagging a gap." 3 minutes sits inside that stated range
// and gives a comfortable ~3.3x margin under the default 10-minute
// threshold — a single delayed/dropped heartbeat (network hiccup, tab
// briefly backgrounded) won't false-positive a connectivity gap, but a
// heartbeat interval anywhere near or above the threshold itself would mean
// every normal heartbeat looks like a gap.
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;

// Only used if GET /location/config fails — mirrors the backend's own
// LOCATION_PING_INTERVAL_MINUTES default (env.js), never invented fresh.
const FALLBACK_PING_INTERVAL_MINUTES = 2;

function logAndSwallow(label) {
  return (error) => {
    // A single failed heartbeat/ping must never crash the app or block
    // check-out — the exact "never block the primary action" principle
    // attendance.service.js#checkOut already applies to its own TravelLog
    // auto-generation. Logged so a real, persistent failure is still
    // visible in devtools, not silently invisible either.
    // eslint-disable-next-line no-console
    console.error(`${label} failed:`, error);
  };
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}

async function sendPing() {
  const position = await getCurrentPositionAsync();

  await submitLocationPing({
    coords: { lat: position.coords.latitude, lng: position.coords.longitude },
    capturedAt: new Date().toISOString(),
  });
}

/**
 * Runs both the Attendance heartbeat loop (§6.5/§7.4 — connectivity-gap
 * detection needs periodic "still alive" proof) and the Location ping loop
 * (§7.4b — the live map has nothing to show without pings) for as long as
 * `isActive` is true, and only then.
 *
 * Driven by the caller's own derived "am I checked in" boolean rather than
 * an imperative start()/stop() pair tied to the check-in button's onClick —
 * that's what makes the resume-on-reload case free: whether `isActive` is
 * already `true` on the very first render (the page loaded mid-shift) or
 * transitions `false → true` (a fresh check-in just succeeded), this same
 * effect body runs identically. There is no separate "resume" code path to
 * keep in sync with the "fresh start" one.
 *
 * Pauses (not fully stops) both intervals while the tab is hidden
 * (`visibilitychange`) — there is no one to see a live map update while a
 * tab is backgrounded, so this avoids pointless network/battery cost — and
 * resumes them when it becomes visible again. `beforeunload` needs no
 * listener of its own: a real tab close terminates the JS engine outright,
 * which destroys both intervals with it automatically; the two cases that
 * genuinely need explicit cleanup — navigating away within this SPA
 * (unmounting this component) and backgrounding the tab — are exactly what
 * the effect's own cleanup function and the `visibilitychange` handler
 * below already cover.
 */
export function useCheckedInHeartbeatLoop(isActive) {
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    let heartbeatIntervalId = null;
    let pingIntervalId = null;
    let isCancelled = false;

    function startIntervals(pingIntervalMinutes) {
      heartbeatIntervalId = setInterval(() => {
        heartbeat().catch(logAndSwallow("Attendance heartbeat"));
      }, HEARTBEAT_INTERVAL_MS);

      pingIntervalId = setInterval(() => {
        sendPing().catch(logAndSwallow("Location ping"));
      }, pingIntervalMinutes * 60 * 1000);
    }

    function stopIntervals() {
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }

      if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopIntervals();
      } else if (!heartbeatIntervalId) {
        // Re-resolve the ping cadence rather than caching it from the
        // initial fetch — the whole point of GET /location/config being a
        // real endpoint (not a hardcoded client constant) is that an admin
        // can change LOCATION_PING_INTERVAL_MINUTES without a client
        // redeploy, and a long-backgrounded tab is exactly when that's
        // most likely to have changed underneath it.
        resolvePingIntervalMinutes().then((minutes) => {
          if (!isCancelled) {
            startIntervals(minutes);
          }
        });
      }
    }

    async function resolvePingIntervalMinutes() {
      try {
        const response = await fetchLocationConfig();
        return response.data.data.pingIntervalMinutes;
      } catch {
        return FALLBACK_PING_INTERVAL_MINUTES;
      }
    }

    resolvePingIntervalMinutes().then((minutes) => {
      if (!isCancelled) {
        startIntervals(minutes);
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      stopIntervals();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive]);
}

export default useCheckedInHeartbeatLoop;
