/**
 * Where a notification takes you when opened (§6.7, 2026-08-07).
 *
 * The bell dropdown and the service worker BOTH need this, so a push and an
 * in-app click land in the same place. The service worker cannot import from
 * `src/` — it is a standalone script served from `public/` — so `sw.js`
 * carries its own copy of this table. `notificationRoutes.test.js` parses both
 * files and fails if they drift, which is the only thing keeping two copies
 * honest.
 *
 * Leave and Attendance have no per-record detail route: Leave lives in a tab
 * on `/attendance` and attendance records open from the table itself, so both
 * land on `/attendance` and ignore `relatedEntity.id`.
 *
 * `tickets` was REMOVED from this table 2026-08-07 when Tickets was deferred
 * from the UI. The backend still creates ticket-assignment notifications and
 * was deliberately left untouched, so they keep arriving — they simply resolve
 * to `null` now, which means the bell shows and marks them read in place
 * without navigating, and a push opens the app root instead of a route that no
 * longer exists. Sending a user to a dead `/tickets/:id` would be strictly
 * worse than not moving them at all.
 */
export const MODULE_ROUTES = {
  leads: (id) => `/leads/${id}`,
  leave: () => "/attendance",
  attendance: () => "/attendance",
};

/**
 * Resolves a notification's `relatedEntity` to a path, or `null` when there
 * is nowhere specific to go — the caller then leaves the user where they are
 * (bell) or opens the app root (service worker).
 */
export function routeForNotification(notification) {
  const module = notification?.relatedEntity?.module;
  const id = notification?.relatedEntity?.id;
  const build = module ? MODULE_ROUTES[module] : null;

  if (!build) {
    return null;
  }

  // `leave`/`attendance` ignore the id; `leads`/`tickets` require one.
  const path = build(id);

  return path.endsWith("/undefined") || path.endsWith("/null") ? null : path;
}

export default MODULE_ROUTES;
