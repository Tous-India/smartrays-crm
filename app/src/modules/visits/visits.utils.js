import Geolocation from "@react-native-community/geolocation";
import { LOCATION_FIX_TIMEOUT_MS } from "../../constants/attendance.constants";
import { FINE_LOCATION_PERMISSION, PERMISSION_STATUS, requestPermission } from "../../utils/permissions.utils";

// Verified site visits (2026-10-22): helpers for the app side.

export const VISIT_STATUS_LABEL = {
  not_started: "Not started",
  not_at_site: "Not at site",
  at_site: "At the site",
  left_early: "Left early",
  verified: "Done ✓",
};

export const VISIT_STATUS_TONE = {
  not_started: "neutral",
  not_at_site: "danger",
  at_site: "warning",
  left_early: "danger",
  verified: "success",
};

/** Straight-line distance in metres (the server makes the real decision). */
export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function plainDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/**
 * One fresh, high-accuracy fix — the same request the check-in screen makes.
 * Resolves { lat, lng, accuracy }; rejects with a message the employee can act on.
 */
export async function getFreshFix() {
  const permission = await requestPermission(FINE_LOCATION_PERMISSION);
  if (permission !== PERMISSION_STATUS.GRANTED) {
    throw new Error("Location permission is needed to prove you are at the site.");
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => reject(new Error("Could not get your location. Step into the open and try again.")),
      { enableHighAccuracy: true, timeout: LOCATION_FIX_TIMEOUT_MS, maximumAge: 0 }
    );
  });
}
