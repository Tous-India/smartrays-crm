/**
 * A one-line pub/sub so every live `useMyAttendance` instance refetches after
 * a check-in/out/break, no matter which component performed it.
 *
 * Needed as of the fixed-header Check-In button (2026-08-05): there are now
 * TWO independent consumers of "am I checked in right now" mounted at the
 * same time — the header button/timer (on every page) and
 * `CheckInOutWidget` (on `/attendance`). Each hook instance holds its own
 * state, so without this, checking in from the header would leave the widget
 * a few feet below it still showing "Not Checked In" until a remount, and
 * vice versa.
 *
 * Deliberately not a store: there's no shared STATE here, only a "something
 * changed, re-read it" signal — each hook still owns its own data and its
 * own month. A `Set` of callbacks is the whole implementation.
 */
const subscribers = new Set();

export function subscribeToAttendanceChanges(callback) {
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

export function notifyAttendanceChanged() {
  subscribers.forEach((callback) => callback());
}
