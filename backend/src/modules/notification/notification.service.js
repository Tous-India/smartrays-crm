import ApiError from "../../utils/ApiError.js";
import { sendPush } from "../../services/webPush.service.js";
import Notification from "./notification.model.js";
import PushSubscription from "./pushSubscription.model.js";
import User from "../user/user.model.js";

/**
 * Creates the notification record AND attempts a push to every active
 * subscription this user has, per §6.7/the Leads push requirements ("push
 * notification when a lead is assigned," "push for upcoming follow-ups").
 * `relatedEntity` is `{ module, id }` or omitted/null — see
 * notification.model.js.
 *
 * The DB record is the source of truth (it's what `GET /notifications`
 * returns, real-time delivery or not); a push attempt failing — expired
 * subscription, the user has no subscriptions at all, a network error —
 * must never throw out of this function or block the record from being
 * created. Every subscription is attempted independently and failures are
 * caught per-subscription, not as a group, so one bad subscription can't
 * suppress a push to the user's other devices.
 */
export async function createNotification(userId, type, message, relatedEntity = null) {
  const notification = await Notification.create({
    userId,
    type,
    message,
    relatedEntity,
  });

  const subscriptions = await PushSubscription.find({ userId, isActive: true });

  await Promise.all(subscriptions.map((subscription) => attemptPush(subscription, notification)));

  return notification;
}

/**
 * Never throws — a push failure is logged and swallowed here, exactly once
 * per subscription. A 404/410 response means the push service considers the
 * subscription gone (the user uninstalled the PWA, cleared site data,
 * etc.) — deactivated rather than deleted outright, so there's still a
 * record of what used to be subscribed and a later re-subscribe of the same
 * endpoint (see `subscribe` below) can simply re-activate this same row.
 */
async function attemptPush(subscription, notification) {
  try {
    await sendPush(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      { type: notification.type, message: notification.message, relatedEntity: notification.relatedEntity }
    );
  } catch (error) {
    console.error(
      `[notification] Push failed for subscription ${subscription._id} (user ${subscription.userId}):`,
      error.message
    );

    if (error.statusCode === 404 || error.statusCode === 410) {
      subscription.isActive = false;
      await subscription.save();
    }
  }
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
 */
export async function listNotifications(userId, unreadOnly = false) {
  const filter = unreadOnly ? { userId, isRead: false } : { userId };

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

export async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
}
