import { listNotifications, markNotificationRead } from "./api/notificationApi";
import { announceNotificationsChanged } from "./notificationEvents";

/**
 * Marks read the notification(s) pointing at ONE specific record (§7.44,
 * 2026-08-06) — resolved through `relatedEntity`, which every notification
 * already carries.
 *
 * **Only ever that record's notifications.** Never a bulk clear by type: that
 * was the §7.43 bug, where clicking a nav item marked everything read whether
 * or not it had been seen. Acting on leave request X dismisses X's
 * notification and leaves Y's alone.
 *
 * Reads the list rather than calling a dedicated endpoint. A
 * `PATCH /notifications/read-by-entity` would be one round trip instead of
 * two and is the cleaner shape, but this is deliberately frontend-only: the
 * endpoint doesn't exist, and adding one would mean a backend deploy for what
 * is a UI dismissal rule. `GET /notifications` is already polled every 45s by
 * the bell, so the extra read is cheap and warm. Worth revisiting if this
 * grows past a handful of call sites.
 *
 * Never throws: dismissing a notification is a side effect of the real action
 * (approving leave, opening a lead). If it fails, the action still succeeded
 * and the badge simply clears on its next poll — surfacing an error here
 * would report a failure the user does not care about and did not cause.
 */
export async function markNotificationsForEntity(module, id) {
  if (!module || !id) {
    return 0;
  }

  try {
    const response = await listNotifications();

    const matching = (response.data.data || []).filter(
      (notification) =>
        !notification.isRead &&
        notification.relatedEntity?.module === module &&
        String(notification.relatedEntity?.id) === String(id)
    );

    if (matching.length === 0) {
      return 0;
    }

    await Promise.all(matching.map((notification) => markNotificationRead(notification._id)));

    // Keeps the bell and BOTH sidebar badges in step in the same tick — the
    // three read the same endpoint with no shared store, so without this the
    // sidebar would lag up to its own 60s poll behind the action.
    announceNotificationsChanged();

    return matching.length;
  } catch {
    return 0;
  }
}

export default markNotificationsForEntity;
