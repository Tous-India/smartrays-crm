import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The browser's Push API gives each subscription a globally unique
    // endpoint URL (one per browser/device installation) — used as the
    // natural upsert key in `notification.service.js#subscribe` rather than
    // `userId`, so re-subscribing the same browser (even after a logout/
    // login as a different user on a shared device) re-associates the
    // existing row instead of erroring on a duplicate key.
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    // VAPID subscription keys, exactly as the browser's PushManager returns
    // them — see §6.7.
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Soft-disabled on explicit unsubscribe, or automatically when a push
    // attempt comes back 404/410 (the push service telling us the
    // subscription is gone) — see notification.service.js. Kept as a row
    // rather than deleted so there's a record of what used to be
    // subscribed, and so re-subscribing the same endpoint later is a
    // straightforward re-activate via the same upsert.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);

export default PushSubscription;
