const EARTH_RADIUS_METERS = 6371000;

/**
 * Straight-line ("as the crow flies") distance between two `{lat, lng}`
 * points, in meters, via the Haversine formula — deliberately separate from
 * `googleMaps.service.js#getDistanceKm` (a real Distance Matrix API call for
 * driving distance). Geofencing (§6.5/§7.4) needs a fast, synchronous check
 * with no external dependency on every location ping; depending on Google
 * Maps here would mean a ping starts failing/blocking whenever that API is
 * unavailable or rate-limited, which this feature must never do.
 */
export function haversineDistanceMeters(coordsA, coordsB) {
  const lat1 = toRadians(coordsA.lat);
  const lat2 = toRadians(coordsB.lat);
  const deltaLat = toRadians(coordsB.lat - coordsA.lat);
  const deltaLng = toRadians(coordsB.lng - coordsA.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * The accuracy-aware geofence rule (mobile-backend-plan.md §3.6), in one
 * place so attendance and site visits apply exactly the same test:
 * - a fix less precise than `maxAccuracyMeters` cannot say where the person
 *   is, so it is not evaluated at all (`evaluated: false`);
 * - otherwise it is outside when `distance − accuracy > radius` — the NEAREST
 *   position consistent with the fix must itself be outside.
 * A fix with no `accuracy` (every web ping) is evaluated on distance alone.
 */
export function evaluateFixAgainstFence(center, coords, radiusMeters, maxAccuracyMeters) {
  const hasAccuracy = typeof coords.accuracy === "number";

  if (hasAccuracy && coords.accuracy > maxAccuracyMeters) {
    return { evaluated: false, distanceMeters: haversineDistanceMeters(center, coords), outside: false };
  }

  const distanceMeters = haversineDistanceMeters(center, coords);
  const effectiveDistance = hasAccuracy ? distanceMeters - coords.accuracy : distanceMeters;

  return { evaluated: true, distanceMeters, outside: effectiveDistance > radiusMeters };
}
