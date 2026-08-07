/* eslint-env serviceworker */

/**
 * Smartrays service worker (§6.7, 2026-08-07) — Web Push only.
 *
 * Deliberately does NOT cache anything. This app is not offline-capable and
 * pretending otherwise would serve stale HTML after a deploy, which is a far
 * worse bug than the one push solves. The only jobs here are showing a push
 * and routing the click.
 *
 * ROUTE TABLE — must stay identical to
 * `src/modules/notification/notificationRoutes.js`. A service worker is a
 * standalone script served from `public/` and cannot import from `src/`, so
 * this is a second copy by necessity. `notificationRoutes.test.js` parses
 * both files and fails if they diverge; without that guard a push and an
 * in-app click would silently drift to different destinations.
 */
// Must stay identical to src/modules/notification/notificationRoutes.js —
// notificationRoutes.test.js parses this file and fails on drift. `tickets`
// was dropped from both 2026-08-07 when Tickets was deferred from the UI; a
// ticket push now opens the app root rather than a dead /tickets/:id.
const MODULE_ROUTES = {
  leads: (id) => `/leads/${id}`,
  leave: () => "/attendance",
  attendance: () => "/attendance",
};

function routeForNotification(payload) {
  const module = payload && payload.relatedEntity && payload.relatedEntity.module;
  const id = payload && payload.relatedEntity && payload.relatedEntity.id;
  const build = module ? MODULE_ROUTES[module] : null;

  if (!build) {
    return null;
  }

  const path = build(id);

  return path.endsWith("/undefined") || path.endsWith("/null") ? null : path;
}

// Take over as soon as installed rather than waiting for every tab to close —
// otherwise a user who enables push keeps an old (or no) worker until they
// close the app entirely, and their first pushes go nowhere.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/**
 * `notification.service.js#createNotification` sends
 * `{ type, message, relatedEntity }`. There is no title field, so the type
 * supplies a human heading and the message is the body.
 */
const TYPE_TITLES = {
  lead_created: "New lead",
  lead_assigned: "Lead assigned to you",
  lead_follow_up_due: "Follow-up due",
  ticket_assigned: "Ticket assigned to you",
  leave_requested: "Leave request",
  leave_approved: "Leave approved",
  leave_declined: "Leave declined",
  leave_unapproved_absence: "Unapproved absence recorded",
  attendance_check_in: "Checked in",
  attendance_break_in: "Break started",
  attendance_break_out: "Break ended",
  attendance_check_out: "Checked out",
};

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A malformed or non-JSON push must still surface something rather than
    // throwing inside the handler and showing nothing at all.
    payload = { message: event.data ? event.data.text() : "" };
  }

  const title = TYPE_TITLES[payload.type] || "Smartrays";
  const body = payload.message || "You have a new notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/smart-favicon.webp",
      badge: "/smart-favicon.webp",
      // Same tag per type collapses a burst (four attendance events in a
      // minute) into one entry instead of stacking four.
      tag: payload.type || "smartrays",
      renotify: true,
      data: { url: routeForNotification(payload) },
    })
  );
});

/**
 * Focus an ALREADY-OPEN tab rather than opening a second one, navigating it
 * if the notification points somewhere specific. Opening a duplicate tab of
 * an app the user already has open is the most common service-worker
 * annoyance, and it loses their in-page state.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data && event.notification.data.url;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Same-origin tab already open: focus it, and navigate only when
          // there is somewhere specific to go.
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            const focused = client.focus();

            if (target && "navigate" in client) {
              return focused.then(() => client.navigate(target)).catch(() => focused);
            }

            return focused;
          }
        }

        return self.clients.openWindow(target || "/");
      })
  );
});
