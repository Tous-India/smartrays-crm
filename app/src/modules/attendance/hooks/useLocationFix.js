import { useCallback, useEffect, useRef, useState } from "react";
import Geolocation from "@react-native-community/geolocation";
import { ACCEPTABLE_ACCURACY_METERS, LOCATION_FIX_TIMEOUT_MS } from "../../../constants/attendance.constants";
import { FINE_LOCATION_PERMISSION, PERMISSION_STATUS, requestPermission } from "../../../utils/permissions.utils";

/**
 * One fresh GPS fix with a hard timeout (app-plan.md §1.2). The web's
 * prompt can hang forever; this one ends in exactly one of these states:
 *
 *   locating     — asking, up to LOCATION_FIX_TIMEOUT_MS
 *   found        — a fix within the acceptable accuracy
 *   poor         — a fix, but less precise than the app accepts by default;
 *                  the caller may take it anyway (§1.2: "Try again / Check
 *                  in anyway") — the server records what it gets
 *   timeout      — no fix in time
 *   unavailable  — location services off, or no provider
 *   denied       — the permission was refused this time; may ask again
 *   blocked      — "don't ask again"; only the settings page can change it
 *
 * `coords` always carries `accuracy` in metres alongside lat/lng.
 */
export const FIX_STATUS = {
  IDLE: "idle",
  LOCATING: "locating",
  FOUND: "found",
  POOR: "poor",
  TIMEOUT: "timeout",
  UNAVAILABLE: "unavailable",
  DENIED: "denied",
  BLOCKED: "blocked",
};

// @react-native-community/geolocation's PositionError codes.
const ERROR_PERMISSION_DENIED = 1;
const ERROR_POSITION_UNAVAILABLE = 2;
const ERROR_TIMEOUT = 3;

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: LOCATION_FIX_TIMEOUT_MS,
      maximumAge: 0,
    });
  });
}

function statusForError(error) {
  if (error?.code === ERROR_PERMISSION_DENIED) {
    return FIX_STATUS.BLOCKED;
  }

  if (error?.code === ERROR_TIMEOUT) {
    return FIX_STATUS.TIMEOUT;
  }

  if (error?.code === ERROR_POSITION_UNAVAILABLE) {
    return FIX_STATUS.UNAVAILABLE;
  }

  return FIX_STATUS.TIMEOUT;
}

function useLocationFix({ auto = true } = {}) {
  const [status, setStatus] = useState(FIX_STATUS.IDLE);
  const [coords, setCoords] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const request = useCallback(async () => {
    setStatus(FIX_STATUS.LOCATING);
    setCoords(null);

    const permission = await requestPermission(FINE_LOCATION_PERMISSION);

    if (!isMounted.current) {
      return;
    }

    if (permission === PERMISSION_STATUS.BLOCKED) {
      setStatus(FIX_STATUS.BLOCKED);
      return;
    }

    if (permission === PERMISSION_STATUS.DENIED) {
      setStatus(FIX_STATUS.DENIED);
      return;
    }

    try {
      const position = await getCurrentPositionAsync();

      if (!isMounted.current) {
        return;
      }

      const fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      setCoords(fix);
      setStatus(fix.accuracy > ACCEPTABLE_ACCURACY_METERS ? FIX_STATUS.POOR : FIX_STATUS.FOUND);
    } catch (error) {
      if (isMounted.current) {
        setStatus(statusForError(error));
      }
    }
  }, []);

  /** "Check in anyway": keep the imprecise fix as the one to send. */
  const acceptPoorFix = useCallback(() => {
    setStatus((current) => (current === FIX_STATUS.POOR ? FIX_STATUS.FOUND : current));
  }, []);

  useEffect(() => {
    if (auto) {
      request();
    }
  }, [auto, request]);

  return { status, coords, request, acceptPoorFix };
}

export default useLocationFix;
