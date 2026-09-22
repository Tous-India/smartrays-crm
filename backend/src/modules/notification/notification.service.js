import ApiError from "../../utils/ApiError.js";
import { dispatchPush } from "../../services/push.service.js";
import Notification from "./notification.model.js";
import PushSubscription from "./pushSubscription.model.js";
import DeviceToken from "./deviceToken.model.js";
import User from "../user/user.model.js";

/**
 * Creates the notification record AND attempts a push to every active
 * subscription and app device this user has, per §6.7/the Leads push
 * requirements ("push notification when a lead is assigned," "push for
 * upcoming follow-ups"). `relatedEntity` is `{ module, id }` or omitted/null
 * — see notification.model.js.
 *
 * The DB record is the source of truth (it's what `GET /notifications`
 * returns, real-time delivery or not); a push attempt failing — expired
 * subscription, the user has no subscriptions at all, a network error —
 * must never throw out of this function or block the record from being
 * created. Delivery is `push.service.js#dispatchPush`'s (mobile-backend-
 * plan.md §2.3): the Web Push branch that used to live here, moved
 * unchanged, plus FCM for app devices when it is enabled. Callers never
 * touch push directly, and did not change when FCM arrived.
 */
export async function createNotification(userId, type, message, relatedEntity = null) {
  const notification = await Notification.create({
    userId,
    type,
    message,
    relatedEntity,
  });

  await dispatchPush(userId, notification);

  return notification;
}

/**
 * Upserts by `endpoint`, not `userId` — see pushSubscription.model.js for
 * why the endpoint itself is the natural unique key. Re-subscribing an
 * already-known endpoint (e.g. the push permission was re-granted after
 * being revoked) re-activates and re-associates it rather than erroring on
 * a duplicate key.
 */
export async function subscribe(userId, subscriptionObject) {
  const { endpoint, keys } = subscriptionObject;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new ApiError(400, "A valid subscription object (endpoint + keys) is required");
  }

  const subscription = await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId, keys, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(userId, { $addToSet: { pushSubscriptions: subscription._id } });

  return subscription;
}

/**
 * Scoped to the caller — an endpoint that doesn't belong to this user (or
 * doesn't exist at all) is a silent no-op rather than an error, since from
 * the client's perspective "make sure this endpoint isn't subscribed
 * anymore" is the actual intent either way.
 */
export async function unsubscribe(userId, endpoint) {
  const subscription = await PushSubscription.findOneAndUpdate(
    { endpoint, userId },
    { isActive: false }
  );

  if (subscription) {
    await User.findByIdAndUpdate(userId, { $pull: { pushSubscriptions: subscription._id } });
  }
}

/**
 * Always scoped to `userId` — there is no cross-user access to another
 * user's notifications anywhere in this module, the same "self data" shape
 * as `GET /attendance/me`/`GET /auth/me` (no permission tier needed; seeing
 * your own notifications needs no grant).
 *
 * `types` (added §7.29, 2026-07-31 — the Leads/Leave sidebar badge feature)
 * — an optional array of `NOTIFICATION_TYPES` values, filtering to just
 * those types. This is deliberately the SAME endpoint the bell dropdown
 * already uses, not a new one: the sidebar badges are just this same list,
 * filtered by type, with the caller taking `.length` — see
 * `frontend/README.md`'s badge section for why a dedicated count endpoint
 * wasn't added.
 */
export async function listNotifications(userId, unreadOnly = false, types = null) {
  const filter = { userId };

  if (unreadOnly) {
    filter.isRead = false;
  }

  if (types && types.length > 0) {
    filter.type = { $in: types };
  }

  return Notification.find(filter).sort({ createdAt: -1 });
}

/**
 * 404 (not 403) for a notification that doesn't belong to the caller —
 * matching the Leads/Location/User/Payroll precedent for out-of-scope
 * records: its existence isn't confirmed to someone it doesn't belong to.
 */
export async function markRead(notificationId, userId) {
  const notification = await Notification.findOne({ _id: notificationId, userId });

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  notification.isRead = true;
  await notification.save();

  return notification;
}

/**
 * `types` (added §7.29) — scopes the bulk mark-read to just those types,
 * e.g. the Leads sidebar nav click marking only `lead_created`/`lead_assigned`
 * as read without touching an unrelated unread Leave notification. Omitted
 * (or empty), this is the original unscoped "mark everything read" the bell
 * dropdown's "Mark all as read" button already relies on.
 */
export async function markAllRead(userId, types = null) {
  const filter = { userId, isRead: false };

  if (types && types.length > 0) {
    filter.type = { $in: types };
  }

  await Notification.updateMany(filter, { isRead: true });
}

/**
 * An app install's FCM token (mobile-backend-plan.md §2.3). Upserts by
 * `token` — the same idempotent shape `subscribe` has for an endpoint: a
 * token seen before is re-activated and re-associated (a shared phone that
 * signed in as someone else) rather than duplicated; `lastSeenAt` records
 * the re-registration the app performs on every sign-in and token refresh.
 */
export async function registerDevice(userId, { token, platform, deviceId, appVersion }) {
  return DeviceToken.findOneAndUpdate(
    { token },
    {
      userId,
      transport: "fcm",
      platform: platform || "android",
      deviceId: deviceId || null,
      appVersion: appVersion || null,
      isActive: true,
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Scoped to the caller, and a silent no-op for a token that is not theirs
 * or does not exist — "make sure this device gets nothing more" is the
 * intent either way, the same reasoning as `unsubscribe`.
 */
export async function unregisterDevice(userId, token) {
  await DeviceToken.updateOne({ token, userId }, { $set: { isActive: false } });
}

/**
 * Every live device registration of one install — what a mobile logout
 * deactivates alongside the refresh tokens of the same `deviceId`, so a
 * signed-out phone gets no further pushes even if the app never got to
 * call `unregisterDevice` itself (a dead connection at sign-out).
 */
export async function deactivateDeviceTokens(userId, deviceId) {
  if (!deviceId) {
    return;
  }

  await DeviceToken.updateMany({ userId, deviceId, isActive: true }, { $set: { isActive: false } });
}
