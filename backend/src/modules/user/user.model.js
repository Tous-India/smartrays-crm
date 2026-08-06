import mongoose from "mongoose";

// Role and permission shape follow .context/final-plan.md §5/§6.1.
// "Executive" is intentionally not a separate role — see final-plan.md §11.1.
const USER_ROLES = ["admin", "manager", "sales_associate", "employee", "customer"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
    },
    // Per-module action grants for non-admin roles, e.g. { leads: { view: true } }.
    // Checked through src/helpers/permission.helper.js.
    permissions: {
      type: Object,
      default: {},
    },
    // Self-reference to the user's manager. Used to compute "own team" scoping
    // instead of a separate Team collection — see final-plan.md §6.1/§6.7/§11.9.
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Self-service profile photo (§7.39, 2026-08-05) — a Cloudinary URL,
    // same storage approach as attendance photos. Always self-editable via
    // `PATCH /users/me`: a photo carries no authorisation meaning, unlike
    // name/phone which identify someone in the org chart.
    photo: {
      type: String,
      default: null,
    },
    // Whether this user may edit their OWN name/phone (§7.39). Default false:
    // in most orgs those fields are HR-controlled, and letting anyone rename
    // themselves freely makes an org chart untrustworthy. Set by that user's
    // manager or by an admin — never by the user themselves, which would
    // make the flag meaningless.
    canEditOwnProfile: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Added 2026-07-13 for Payroll (§7.7) — nothing before this tracked a
    // salary figure, and Payroll can't compute gross/net without one.
    // `select: false` (same defense-in-depth pattern as `passwordHash`):
    // list/dropdown views never leak it, only an explicit `.select("+baseSalary")`
    // (payroll.service.js) or the update flow itself (which sets it directly
    // in memory, unaffected by select:false) sees the actual value.
    baseSalary: {
      type: Number,
      min: 0,
      default: null,
      select: false,
    },
    // Added for Customer Portal self-signup (§7.8/§6.1) — only ever set for
    // `role: "customer"` accounts, linking a portal user to the Customer
    // company they belong to. Resolved automatically at self-signup via an
    // email-domain match against known Contact/Customer emails (see
    // customer.service.js#resolveCustomerIdByEmailDomain); can also be set
    // directly by an admin via the existing POST /auth/register flow as a
    // manual fallback.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    // Added for the Notification module (§6.7/§7.11-Platform, Phase 9) — one
    // entry per browser/device the user has enabled Web Push on.
    // `notification.service.js#subscribe`/`unsubscribe` keep this in sync
    // with the `PushSubscription` collection itself, which stays the
    // authoritative source (its own `isActive` flag, not this array's
    // membership, is what `createNotification` actually checks before
    // sending) — this array exists so a user's active subscriptions are
    // reachable from their own document too, without a separate query.
    pushSubscriptions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "PushSubscription" }],
      default: [],
    },
    // Added for the self-service forgot/reset-password flow (§7.17). Only
    // ever the SHA-256 hash of the token emailed to the user, never the raw
    // token itself — same "never store the real secret" reasoning as
    // `passwordHash`, so a database leak alone can't be used to reset a
    // user's password. `select: false` for the same defense-in-depth reason
    // as `passwordHash`/`baseSalary`: no ordinary find() should ever return
    // this, only auth.service.js's explicit `.select("+passwordResetToken
    // +passwordResetExpiresAt")` during the reset itself.
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    // Short-lived (~1 hour, set alongside the token) — checked against
    // `Date.now()` at reset time; an expired-but-still-present token is
    // treated exactly like no token at all.
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },

    // --- Two-factor authentication (§7.38, 2026-08-05) ---
    //
    // EVERY field below is `select: false`. A 2FA secret that leaked through
    // an ordinary `find()` would defeat the entire feature, so the only way
    // to read them is an explicit `.select("+twoFactorSecretEncrypted ...")`
    // inside the 2FA service itself.
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    // The TOTP shared secret, AES-256-GCM encrypted at rest by the EXISTING
    // `credentialEncryption.service.js` (CREDENTIALS_ENCRYPTION_KEY) — the
    // same crypto path the Credentials Vault uses, deliberately not a second
    // implementation. Stored as the ciphertext + IV pair that service
    // returns; the plaintext secret exists only in memory, and is returned
    // to the client exactly once, during enrolment.
    twoFactorSecretEncrypted: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorSecretIv: {
      type: String,
      default: null,
      select: false,
    },
    // BCRYPT hashes of the 10 single-use recovery codes — never the codes
    // themselves, for the same reason `passwordHash` isn't the password. A
    // code is consumed by removing its hash from this array, which makes
    // reuse impossible by construction rather than by a flag someone could
    // forget to check.
    twoFactorRecoveryCodeHashes: {
      type: [String],
      default: [],
      select: false,
    },
    // Consecutive failed verification attempts. Reset to 0 on success.
    // See `twoFactor.service.js` for the lockout threshold.
    twoFactorFailedAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    // Mongoose's default `minimize: true` silently strips empty nested objects
    // (including `permissions` itself once it's empty) from both what's saved
    // and what's returned. For a field whose entire meaning is "which grants
    // does this user have," an empty object and a missing field are not the
    // same thing — `permissions: {}` (no grants at all) must stay visibly
    // present, not vanish, especially once §7.12's permissions-management UI
    // exists and needs to show/edit the real stored state.
    minimize: false,
    toJSON: {
      transform: (_doc, returnedObject) => {
        delete returnedObject.passwordHash;
        return returnedObject;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;
export { USER_ROLES };
