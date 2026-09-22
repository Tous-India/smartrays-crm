import mongoose from "mongoose";

/**
 * An app device's push registration (mobile-backend-plan.md §2.2) — a
 * SEPARATE collection from `PushSubscription`, on purpose. A Web Push
 * subscription is an endpoint plus two keys, all required; an FCM
 * registration is one token with none of those. Folding the two together
 * would mean loosening `PushSubscription`'s required fields and its unique
 * endpoint index, a change to the model every web subscriber already sits
 * in. Beyond the constraint they are different things: FCM tokens rotate
 * silently on the device and are refreshed by the app; their "gone" signal
 * is an error code, not an HTTP status; and their payload is FCM's
 * notification/data envelope, not a JSON blob for a service worker.
 *
 * `deviceId` is the same app-generated id the refresh token carries, so a
 * logout can find and deactivate both. `transport` leaves room for APNs.
 */
export const DEVICE_TRANSPORTS = ["fcm"];
export const DEVICE_PLATFORMS = ["android", "ios"];

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The FCM registration token — globally unique per app install, so it
    // is the natural upsert key: re-registering re-associates the row
    // (a shared phone signed in as someone else) instead of duplicating it.
    token: {
      type: String,
      required: true,
      unique: true,
    },
    transport: {
      type: String,
      enum: DEVICE_TRANSPORTS,
      default: "fcm",
    },
    platform: {
      type: String,
      enum: DEVICE_PLATFORMS,
      default: "android",
    },
    deviceId: {
      type: String,
      default: null,
    },
    appVersion: {
      type: String,
      default: null,
    },
    // Soft-disabled on unregister/logout, or when FCM reports the token
    // gone — the same treatment PushSubscription gives a 404/410.
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// "Every live device of this user" is the only query the dispatcher runs.
deviceTokenSchema.index({ userId: 1, isActive: 1 });

const DeviceToken = mongoose.model("DeviceToken", deviceTokenSchema);

export default DeviceToken;
