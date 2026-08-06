import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../user/user.model.js";

const SALT_ROUNDS = 10;

/** 30 days, per §7.40. */
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cap per user, oldest evicted first. Without a cap the array grows every
 * time someone ticks the box on a new browser, and each entry is a standing
 * credential — an unbounded list of those is exactly what you don't want on
 * an account document.
 */
const MAX_TRUSTED_DEVICES = 10;

/**
 * Deliberately NOT the session cookie's name. Two cookies with distinct
 * lifetimes and meanings: the session expires with the JWT, this one lasts
 * 30 days and only ever attests "this browser already passed a second
 * factor once".
 */
const TRUSTED_DEVICE_COOKIE = "smartrays_trusted_device";

/**
 * Trusted-device support (§7.40, 2026-08-05) — lets a browser skip the
 * SECOND factor on later logins.
 *
 * **The password is always still required.** This is checked only after
 * `loginUser` has verified the password, so a stolen device cookie on its own
 * reaches nothing: it converts a two-factor login into a one-factor login for
 * that browser, which is the whole (accepted) trade, and never into a
 * zero-factor one.
 *
 * Tokens are stored bcrypt-hashed, so a database leak yields nothing usable,
 * and each token is bound to the user document it lives on — a token cannot
 * be replayed against a different account because the lookup starts from the
 * authenticated user, not from the token.
 */
export function getTrustedDeviceCookieName() {
  return TRUSTED_DEVICE_COOKIE;
}

export function getTrustedDeviceMaxAgeMs() {
  return TRUSTED_DEVICE_TTL_MS;
}

/**
 * Drops expired entries. Called on every read AND every write (§7.40 item 5)
 * so the array can't accumulate dead credentials — an expired entry is not
 * merely ignored, it is removed.
 */
function pruneExpired(devices, now = new Date()) {
  return (devices || []).filter((device) => new Date(device.expiresAt) > now);
}

/**
 * Condenses a User-Agent into something a human can recognise in the revoke
 * list. Deliberately coarse: the point is "which of my browsers is this",
 * not fingerprinting.
 */
export function describeDevice(userAgent = "") {
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Unknown browser";

  const platform =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown OS";

  return `${browser} on ${platform}`;
}

/**
 * Issues a new device token, returning the RAW value for the caller to set
 * as a cookie. Only its hash is persisted.
 */
export async function rememberDevice(userId, userAgent) {
  const user = await User.findById(userId).select("+trustedDevices");

  if (!user) {
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, SALT_ROUNDS);

  const kept = pruneExpired(user.trustedDevices);
  kept.push({
    tokenHash,
    label: describeDevice(userAgent),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS),
  });

  // Oldest-first eviction once over the cap.
  user.trustedDevices = kept
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-MAX_TRUSTED_DEVICES);

  await user.save();

  return rawToken;
}

/**
 * True when `rawToken` matches a live trusted device for THIS user.
 *
 * Takes the user id rather than a bare token, so a token belonging to someone
 * else can never match: the candidate hashes are only ever loaded from the
 * account whose password was just verified.
 *
 * Expired entries are pruned as a side effect, so a stale token is both
 * rejected and cleaned up in the same pass.
 */
export async function isDeviceTrusted(userId, rawToken) {
  if (!rawToken) {
    return false;
  }

  const user = await User.findById(userId).select("+trustedDevices");

  if (!user) {
    return false;
  }

  const live = pruneExpired(user.trustedDevices);

  if (live.length !== (user.trustedDevices || []).length) {
    user.trustedDevices = live;
    await user.save();
  }

  for (const device of live) {
    // Sequential, not Promise.all — bcrypt is intentionally slow and this
    // runs on every login attempt; comparing up to ten in parallel would
    // spike CPU on exactly the path an attacker drives.
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(rawToken, device.tokenHash)) {
      return true;
    }
  }

  return false;
}

/** Safe view for the revoke UI — never exposes a hash. */
export async function listTrustedDevices(userId) {
  const user = await User.findById(userId).select("+trustedDevices");

  if (!user) {
    return [];
  }

  const live = pruneExpired(user.trustedDevices);

  if (live.length !== (user.trustedDevices || []).length) {
    user.trustedDevices = live;
    await user.save();
  }

  return live.map((device) => ({
    _id: device._id,
    label: device.label,
    createdAt: device.createdAt,
    expiresAt: device.expiresAt,
  }));
}

export async function revokeTrustedDevice(userId, deviceId) {
  const user = await User.findById(userId).select("+trustedDevices");

  if (!user) {
    return;
  }

  user.trustedDevices = pruneExpired(user.trustedDevices).filter(
    (device) => String(device._id) !== String(deviceId)
  );

  await user.save();
}

/**
 * Clears EVERY trusted device for a user (§7.40 item 4).
 *
 * Called on password change, 2FA reset, 2FA re-enrolment, admin reset, and
 * recovery-code redemption. Each of those means the previous trust decision
 * is no longer sound: a redeemed recovery code in particular implies the user
 * lost the device they were trusting, so continuing to honour it would keep a
 * door open for whoever now holds it.
 */
export async function revokeAllTrustedDevices(userId) {
  await User.updateOne({ _id: userId }, { $set: { trustedDevices: [] } });
}

export { TRUSTED_DEVICE_TTL_MS, MAX_TRUSTED_DEVICES, TRUSTED_DEVICE_COOKIE };
