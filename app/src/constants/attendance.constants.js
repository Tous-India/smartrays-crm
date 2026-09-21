/**
 * The capture screen's own thresholds (app-plan.md §1.2). These are about
 * the phone's fix, not about attendance rules — the geofence radius, what a
 * violation means and photo retention are the server's (final-plan.md §7.4b,
 * §6.5) and are never evaluated here.
 */
export const LOCATION_FIX_TIMEOUT_MS = 20000;

/** A fix less precise than this is offered as "use anyway", not taken silently. */
export const ACCEPTABLE_ACCURACY_METERS = 100;

/** Longest edge and JPEG quality the photo is reduced to before upload. */
export const PHOTO_MAX_EDGE_PX = 1280;
export const PHOTO_JPEG_QUALITY = 70;
