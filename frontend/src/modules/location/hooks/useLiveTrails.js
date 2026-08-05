import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLiveLocations, fetchLocationHistory } from "../api/locationApi";
import { getTeamAttendance } from "../../attendance/api/attendanceApi";
import { toLocalDateKey, toLocalMonthKey } from "../../../utils/date.utils";

// 45s — inside the task's stated 30-60s window. Deliberately slower than the
// old 12s live poll: each cycle now also pulls a trail per checked-in
// employee, so a tighter interval would multiply that cost for no real gain
// (pings themselves only arrive every few minutes).
const POLL_INTERVAL_MS = 45000;

/**
 * Everything the live map needs, composed from three existing endpoints —
 * no backend change (2026-08-05):
 *
 * - `GET /location/live` — who is checked in RIGHT NOW plus their latest
 *   ping. Already scoped server-side, and already excludes checked-out
 *   employees (it queries open attendance records only), which is what makes
 *   "checked-out employees drop off the live map" free.
 * - `GET /location/history?employeeId&date` — that employee's ping trail for
 *   today, for the polyline.
 * - `GET /attendance/team?month` — the check-in coords (the start marker,
 *   and the same point that already serves as the geofence centre, so
 *   nothing is stored twice) and `geofenceViolations`.
 *
 * **Two things the trail needs are NOT stored the way you'd expect, and are
 * derived here instead:**
 *
 * 1. `LocationPing` has no geofence flag — it stores only
 *    `{employeeId, attendanceId, coords, capturedAt}`. Violations live on the
 *    Attendance record as time INTERVALS (`{start, end, maxDistanceMeters}`),
 *    computed per shift rather than per ping. A ping is therefore marked as
 *    violating when its `capturedAt` falls inside one of those intervals.
 * 2. There is no per-employee trail endpoint, so trails are fetched one call
 *    per checked-in employee. Fine for a handful of people on a 45s cycle;
 *    a large org would want a batched endpoint rather than this fan-out.
 *
 * Refetches on `visibilitychange` as well as on the interval — the same
 * pattern `useCheckedInHeartbeatLoop` and the notification hook already use,
 * because a backgrounded tab's timers are throttled and the first thing a
 * returning user sees must not be minutes-stale.
 */
export function useLiveTrails({ enabled = true } = {}) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const inFlightRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      const liveResponse = await fetchLiveLocations();
      const live = liveResponse.data.data;

      if (live.length === 0) {
        setEntries([]);
        setError(null);
        return;
      }

      const today = toLocalDateKey(new Date());

      // Attendance carries the check-in coords + geofence windows. A caller
      // without `attendance.view_location` gets coords stripped server-side,
      // so this degrades to "trail only, no start marker" rather than failing.
      const attendanceByIdPromise = getTeamAttendance(toLocalMonthKey(new Date()))
        .then((response) => new Map(response.data.data.map((record) => [String(record._id), record])))
        .catch(() => new Map());

      const [attendanceById, trails] = await Promise.all([
        attendanceByIdPromise,
        Promise.all(
          live.map((entry) =>
            fetchLocationHistory({ employeeId: String(entry.employeeId), date: today })
              .then((response) => response.data.data)
              .catch(() => [])
          )
        ),
      ]);

      setEntries(
        live.map((entry, index) => {
          const attendance = attendanceById.get(String(entry.attendanceId));
          const violations = attendance?.geofenceViolations || [];

          return {
            ...entry,
            checkInCoords: attendance?.checkIn?.coords || null,
            pings: trails[index].map((ping) => ({
              ...ping,
              isGeofenceViolation: isInsideAnyViolation(ping.capturedAt, violations),
            })),
          };
        })
      );
      setError(null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }

    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refetch();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refetch]);

  return { entries, isLoading, error, refetch };
}

function isInsideAnyViolation(capturedAt, violations) {
  const at = new Date(capturedAt).getTime();

  return violations.some((violation) => {
    const start = new Date(violation.start).getTime();
    // An open violation (`end: null`) is still running, so it extends to now.
    const end = violation.end ? new Date(violation.end).getTime() : Date.now();

    return at >= start && at <= end;
  });
}

export default useLiveTrails;
