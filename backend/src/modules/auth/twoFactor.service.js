import bcrypt from "bcryptjs";
import crypto from "crypto";
// otplib v13 is a rewrite: there is no `authenticator` singleton any more.
// The API is standalone functions taking an options object, and `verifySync`
// returns `{ valid, delta, ... }` rather than a bare boolean — verified
// against the installed package before building on it.
import { generateSecret, generateURI, verifySync } from "otplib";
import ApiError from "../../utils/ApiError.js";
import { encryptCredential, decryptCredential } from "../../services/credentialEncryption.service.js";
import User from "../user/user.model.js";
import { revokeAllTrustedDevices } from "./trustedDevice.service.js";

const SALT_ROUNDS = 10;
const RECOVERY_CODE_COUNT = 10;

// A 6-digit TOTP is 1-in-a-million per guess, which an unthrottled attacker
// clears in minutes. Five consecutive failures locks the attempt and forces
// the whole login to restart (password included) — the pre-auth token is
// invalidated, so a locked-out attacker cannot simply keep hammering verify.
const MAX_FAILED_ATTEMPTS = 5;

// `MANDATORY_2FA_ROLES`/`isTwoFactorMandatory` were re-exported here until
// 2026-08-08. The whole rule is gone — 2FA is opt-in for every role — so the
// dependency-free constants module they lived in was deleted rather than left
// behind as an unused definition of a policy that no longer exists.

/**
 * The fields the 2FA flows need, none of which an ordinary `find()` returns.
 * Every read of a secret in this module goes through here so no call site
 * can accidentally forget one and silently behave as though 2FA is off.
 */
const SECRET_FIELDS =
  "+twoFactorSecretEncrypted +twoFactorSecretIv +twoFactorRecoveryCodeHashes +twoFactorFailedAttempts +passwordHash";

export function findUserWithTwoFactor(userId) {
  return User.findById(userId).select(SECRET_FIELDS);
}

/**
 * Step 1 of enrolment — generates a secret and returns it ONCE, with the
 * `otpauth://` URI an authenticator app scans. Deliberately does NOT enable
 * 2FA: the secret is stored (encrypted) but `twoFactorEnabled` stays false
 * until `confirmTotpEnrolment` proves the user can actually produce a code
 * from it. Enabling first would let someone lock themselves out by scanning
 * a QR that never made it into their app.
 *
 * Re-running this before confirming simply replaces the pending secret,
 * which is what "the QR expired, show me another" should do.
 */
export async function beginTotpEnrolment(userId) {
  const user = await findUserWithTwoFactor(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.twoFactorEnabled) {
    throw new ApiError(409, "Two-factor authentication is already enabled. Reset it first to re-enrol.");
  }

  const secret = generateSecret();
  const { passwordEncrypted, passwordIv } = encryptCredential(secret);

  user.twoFactorSecretEncrypted = passwordEncrypted;
  user.twoFactorSecretIv = passwordIv;
  await user.save();

  return {
    secret,
    otpauthUrl: generateURI({
      strategy: "totp",
      issuer: "Smartrays CRM",
      label: user.email,
      secret,
    }),
  };
}

/**
 * Step 2 — the user proves possession by entering a code. Only now is 2FA
 * switched on, and only now are recovery codes issued (returned in PLAINTEXT
 * exactly once; only bcrypt hashes are stored).
 */
export async function confirmTotpEnrolment(userId, token) {
  const user = await findUserWithTwoFactor(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.twoFactorSecretEncrypted) {
    throw new ApiError(409, "Start enrolment before confirming it");
  }

  if (!verifyTotpForUser(user, token)) {
    throw new ApiError(401, "That code isn't valid. Check your authenticator app and try again.");
  }

  const { codes, hashes } = await generateRecoveryCodes();

  user.twoFactorEnabled = true;
  user.twoFactorRecoveryCodeHashes = hashes;
  user.twoFactorFailedAttempts = 0;
  await user.save();

  // §7.40 — re-enrolling means a NEW secret, so any device trusted against
  // the old one is trusting a factor that no longer exists.
  await revokeAllTrustedDevices(user._id);

  return { recoveryCodes: codes };
}

/**
 * Verifies a second factor — a TOTP code, or one of the recovery codes.
 *
 * Throws 429 once `MAX_FAILED_ATTEMPTS` consecutive failures accumulate; the
 * caller is expected to invalidate the pre-auth token at that point so the
 * user must start again from the password.
 *
 * A successful recovery code is CONSUMED (its hash removed), so it cannot be
 * replayed. Reuse is prevented structurally rather than by a "used" flag.
 */
export async function verifySecondFactor(userId, token) {
  const user = await findUserWithTwoFactor(userId);

  if (!user || !user.twoFactorEnabled) {
    throw new ApiError(400, "Two-factor authentication is not enabled for this account");
  }

  if (user.twoFactorFailedAttempts >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(429, "Too many incorrect codes. Please sign in again from the start.");
  }

  if (verifyTotpForUser(user, token)) {
    user.twoFactorFailedAttempts = 0;
    await user.save();

    return { method: "totp" };
  }

  const matchedIndex = await findMatchingRecoveryCodeIndex(user, token);

  if (matchedIndex !== -1) {
    user.twoFactorRecoveryCodeHashes.splice(matchedIndex, 1);
    user.twoFactorFailedAttempts = 0;
    await user.save();

    // §7.40 — redeeming a recovery code means the user lost access to their
    // authenticator, i.e. lost a device. Continuing to trust devices at that
    // moment would hold a door open for whoever now has it.
    await revokeAllTrustedDevices(user._id);

    return { method: "recovery_code", remainingRecoveryCodes: user.twoFactorRecoveryCodeHashes.length };
  }

  user.twoFactorFailedAttempts += 1;
  await user.save();

  if (user.twoFactorFailedAttempts >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(429, "Too many incorrect codes. Please sign in again from the start.");
  }

  throw new ApiError(401, "That code isn't valid.");
}

/** Issues a fresh set, invalidating every previously-issued code. */
export async function regenerateRecoveryCodes(userId) {
  const user = await findUserWithTwoFactor(userId);

  if (!user || !user.twoFactorEnabled) {
    throw new ApiError(400, "Two-factor authentication is not enabled for this account");
  }

  const { codes, hashes } = await generateRecoveryCodes();
  user.twoFactorRecoveryCodeHashes = hashes;
  await user.save();

  return { recoveryCodes: codes };
}

/**
 * Clears every 2FA artefact for a user. Used both by an admin resetting
 * someone else (see `auth.controller.js`, which requires the acting admin to
 * re-authenticate first) and by a user disabling their own.
 */
export async function clearTwoFactor(userId) {
  const user = await findUserWithTwoFactor(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecretEncrypted = null;
  user.twoFactorSecretIv = null;
  user.twoFactorRecoveryCodeHashes = [];
  user.twoFactorFailedAttempts = 0;
  await user.save();

  // §7.40 — covers BOTH a user disabling their own 2FA and an admin
  // resetting someone else's: either way the second factor those devices
  // were trusted against is gone.
  await revokeAllTrustedDevices(user._id);
}

/**
 * A user switching OFF their own 2FA (2026-08-08).
 *
 * Requires BOTH the current password AND a live second factor — a TOTP code or
 * a recovery code — in the same request. This is the load-bearing part of
 * making 2FA optional: a session alone must never be sufficient, because the
 * threat 2FA exists to defeat is precisely an attacker holding a session they
 * should not have. Letting a bare session turn it off would mean the
 * protection could be removed by exactly the thing it protects against.
 *
 * Order matters. The password is checked FIRST, so a wrong password cannot
 * burn a recovery code: `verifySecondFactor` consumes one on success and
 * increments the failure counter (eventually 429) on failure, and neither
 * should be reachable by someone who hasn't proven the first factor.
 *
 * `userId` is always the authenticated caller's own id — see the controller.
 * There is deliberately no target parameter; the only cross-user path remains
 * the audited admin reset.
 */
export async function disableOwnTwoFactor(userId, password, token) {
  const user = await findUserWithTwoFactor(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.twoFactorEnabled) {
    throw new ApiError(400, "Two-factor authentication is not enabled for this account");
  }

  const isPasswordValid = await bcrypt.compare(password || "", user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, "Your password is incorrect");
  }

  // Throws on an invalid code, so reaching the line below means both factors
  // were genuinely produced.
  await verifySecondFactor(user._id, token);

  // Clears the secret and every recovery code, and revokes all trusted
  // devices — a device trusted against a second factor must not outlive it.
  await clearTwoFactor(user._id);
}

function verifyTotpForUser(user, token) {
  if (!user.twoFactorSecretEncrypted || !user.twoFactorSecretIv || !token) {
    return false;
  }

  const secret = decryptCredential({
    passwordEncrypted: user.twoFactorSecretEncrypted,
    passwordIv: user.twoFactorSecretIv,
  });

  // otplib THROWS for anything that isn't a 6-digit string ("Token must be 6
  // digits, got 10") rather than returning `{ valid: false }`. Recovery codes
  // are 10 hex characters and arrive through this same field, so without this
  // guard the request 500s here and the recovery-code branch below is never
  // reached — i.e. recovery codes could never be redeemed at all.
  try {
    return verifySync({ secret, token: String(token).trim() }).valid === true;
  } catch {
    return false;
  }
}

async function findMatchingRecoveryCodeIndex(user, token) {
  const candidate = String(token || "").trim().toUpperCase();

  for (let index = 0; index < user.twoFactorRecoveryCodeHashes.length; index += 1) {
    // Sequential rather than Promise.all: bcrypt is deliberately slow, and
    // comparing all ten in parallel would spike CPU on every failed attempt,
    // which is exactly the path an attacker drives.
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(candidate, user.twoFactorRecoveryCodeHashes[index])) {
      return index;
    }
  }

  return -1;
}

async function generateRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase()
  );

  const hashes = await Promise.all(codes.map((code) => bcrypt.hash(code, SALT_ROUNDS)));

  return { codes, hashes };
}

export { MAX_FAILED_ATTEMPTS, RECOVERY_CODE_COUNT };
