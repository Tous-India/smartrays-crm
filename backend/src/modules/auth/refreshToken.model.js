import mongoose from "mongoose";

/**
 * A mobile refresh token (mobile-backend-plan.md §1.3c) — its OWN collection,
 * not an array on `User`.
 *
 * The trusted-device precedent embeds tokens on the user and bcrypt-compares
 * across the array, which is fine for a handful of remembered browsers and
 * wrong here: refresh tokens rotate on every use and have to be found BY
 * VALUE, so the hash is SHA-256 (indexable) and unique.
 *
 * A record is never deleted on rotation — `replacedByHash` is what lets a
 * presented-again token be recognised as reuse (stolen, or the app lost its
 * write). The TTL index clears the whole chain once its expiry passes.
 * Nothing the web app uses reads or writes this collection.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // App-generated, stable per install — logout and reuse detection act on
    // one device, not on every session the user has.
    deviceId: {
      type: String,
      default: null,
    },
    deviceLabel: {
      type: String,
      default: "Unknown device",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedByHash: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// MongoDB removes the document once `expiresAt` has passed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
