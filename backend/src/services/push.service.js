import { sendPush } from "./webPush.service.js";
import { isDeadTokenError, isFcmEnabled, sendFcm } from "./fcm.service.js";
import PushSubscription from "../modules/notification/pushSubscription.model.js";
import DeviceToken from "../modules/notification/deviceToken.model.js";

/**
 * The one dispatcher behind `createNotification` (mobile-backend-plan.md
 * §2.3): web subscribers get Web Push exactly as before, app devices get
 * FCM, and the caller gets nothing back it did not get before. Both lists
 * are attempted in one go; every delivery is independent and never throws
 * — a dead subscription or token is deactivated, anything else is logged
 * and left for next time. The notification record itself was written
 * before this runs and is the source of truth whether or not any push
 * lands.
 */
export async function dispatchPush(userId, notification) {
  const subscriptions = await PushSubscription.find({ userId, isActive: true });
  const devices = isFcmEnabled() ? await DeviceToken.find({ userId, isActive: true }) : [];

  await Promise.all([
    ...subscriptions.map((subscription) => attemptWebPush(subscription, notification)),
    ...devices.map((device) => attemptFcm(device, notification)),
  ]);
}

/**
 * The web path, moved here from notification.service.js unchanged: a
 * 404/410 from the push service means the subscription is gone (the PWA
 * uninstalled, site data cleared) — deactivated, not deleted, so a later
 * re-subscribe of the same endpoint re-activates the same row.
 */
async function attemptWebPush(subscription, notification) {
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
 * The FCM path. A token FCM reports dead is deactivated exactly as a gone
 * web subscription is; a transient failure is logged and the row kept.
 */
async function attemptFcm(device, notification) {
  const presentation = presentationFor(notification.type);

  try {
    await sendFcm({
      token: device.token,
      title: presentation.title,
      body: notification.message,
      data: fcmData(notification),
      channelId: presentation.channelId,
    });
  } catch (error) {
    console.error(`[notification] FCM failed for device ${device._id} (user ${device.userId}):`, error.code || error.message);

    if (isDeadTokenError(error)) {
      device.isActive = false;
      await device.save();
    }
  }
}

/**
 * The `data` envelope the app deep-links from: everything a string, as FCM
 * requires. `module`/`id` come from the notification's relatedEntity.
 */
export function fcmData(notification) {
  return {
    notificationId: String(notification._id),
    type: notification.type,
    module: notification.relatedEntity?.module ? String(notification.relatedEntity.module) : "",
    id: notification.relatedEntity?.id ? String(notification.relatedEntity.id) : "",
  };
}

/**
 * The Android channel each type lands in, and the title above the message.
 * Channel ids match what the app creates at start-up (NotificationChannels.kt):
 * a user can mute leave or attendance chatter without muting the tracking
 * notification, which lives in its own channel the service owns.
 */
const CHANNELS = {
  WORK: "smartrays_work",
  LEAVE: "smartrays_leave",
  ATTENDANCE: "smartrays_attendance",
  REMINDERS: "smartrays_reminders",
  GENERAL: "smartrays_general",
};

const PRESENTATION = {
  service_assigned: { title: "New service assigned", channelId: CHANNELS.WORK },
  leave_requested: { title: "Leave request", channelId: CHANNELS.LEAVE },
  leave_approved: { title: "Leave approved", channelId: CHANNELS.LEAVE },
  leave_declined: { title: "Leave declined", channelId: CHANNELS.LEAVE },
  leave_unapproved_absence: { title: "Absence recorded", channelId: CHANNELS.LEAVE },
  attendance_check_in: { title: "Check-in", channelId: CHANNELS.ATTENDANCE },
  attendance_check_out: { title: "Check-out", channelId: CHANNELS.ATTENDANCE },
  attendance_break_in: { title: "Break", channelId: CHANNELS.ATTENDANCE },
  attendance_break_out: { title: "Break over", channelId: CHANNELS.ATTENDANCE },
  shift_open_reminder: { title: "Still checked in?", channelId: CHANNELS.REMINDERS },
  complaint_new: { title: "New customer complaint", channelId: CHANNELS.WORK },
  complaint_assigned: { title: "Complaint assigned to you", channelId: CHANNELS.WORK },
  complaint_status: { title: "Complaint update", channelId: CHANNELS.WORK },
  complaint_sent_back: { title: "Complaint sent back", channelId: CHANNELS.WORK },
  complaint_reminder: { title: "Complaint reminder", channelId: CHANNELS.REMINDERS },
  complaint_daily_summary: { title: "Complaints today", channelId: CHANNELS.GENERAL },
  staff_location_alert: { title: "Team member not tracked", channelId: CHANNELS.WORK },
};

export function presentationFor(type) {
  return PRESENTATION[type] || { title: "Smartrays", channelId: CHANNELS.GENERAL };
}
