import * as Keychain from "react-native-keychain";
import { Platform } from "react-native";

/**
 * Every secret the app holds, and where it lives (app-plan.md §3.2).
 *
 * The keychain (Android Keystore-backed) holds the token pair, the trusted-
 * device token and the install's device id — one keychain entry per kind, so
 * each can be cleared on its own. Nothing here ever touches AsyncStorage or a
 * plain file. The access token is ALSO kept in memory, because it is read on
 * every request and the keychain is an async native call.
 */

const SERVICE_SESSION = "com.smartrays.crm.session";
const SERVICE_TRUSTED_DEVICE = "com.smartrays.crm.trusted-device";
const SERVICE_DEVICE = "com.smartrays.crm.device";

let accessTokenInMemory = null;

async function readEntry(service) {
  const entry = await Keychain.getGenericPassword({ service });

  return entry ? entry.password : null;
}

async function writeEntry(service, value) {
  await Keychain.setGenericPassword(service, value, { service });
}

async function clearEntry(service) {
  await Keychain.resetGenericPassword({ service });
}

/** The access token for the request about to go out — synchronous, in memory. */
export function getAccessToken() {
  return accessTokenInMemory;
}

/**
 * Stores a fresh token pair (login, 2FA verify, refresh). The refresh token
 * rotates on every use, so this is called on every refresh too.
 */
export async function saveTokens({ accessToken, refreshToken }) {
  accessTokenInMemory = accessToken;
  await writeEntry(SERVICE_SESSION, JSON.stringify({ accessToken, refreshToken }));
}

/**
 * Restores the pair on launch. Returns null when nobody is signed in on this
 * install, or when the stored entry cannot be read as a pair.
 */
export async function loadTokens() {
  const raw = await readEntry(SERVICE_SESSION);

  if (!raw) {
    return null;
  }

  try {
    const tokens = JSON.parse(raw);

    if (!tokens.accessToken || !tokens.refreshToken) {
      return null;
    }

    accessTokenInMemory = tokens.accessToken;

    return tokens;
  } catch (parseError) {
    return null;
  }
}

export async function getRefreshToken() {
  const tokens = await loadTokens();

  return tokens ? tokens.refreshToken : null;
}

/** Logout and session loss: the pair goes, the trusted-device token stays. */
export async function clearTokens() {
  accessTokenInMemory = null;
  await clearEntry(SERVICE_SESSION);
}

/**
 * "Remember this device" (§7.40) — sent back as the X-Trusted-Device header on
 * later logins. Survives logout on purpose, exactly as the web's cookie does.
 */
export async function saveTrustedDeviceToken(token) {
  await writeEntry(SERVICE_TRUSTED_DEVICE, token);
}

export async function getTrustedDeviceToken() {
  return readEntry(SERVICE_TRUSTED_DEVICE);
}

export async function clearTrustedDeviceToken() {
  await clearEntry(SERVICE_TRUSTED_DEVICE);
}

function newDeviceId() {
  // Not a secret and not security-relevant — it only lets the server act on
  // one install's refresh tokens (reuse detection, logout) rather than all.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A stable id for this install, minted on first use and kept in the keychain. */
export async function getDeviceId() {
  const existing = await readEntry(SERVICE_DEVICE);

  if (existing) {
    return existing;
  }

  const created = newDeviceId();
  await writeEntry(SERVICE_DEVICE, created);

  return created;
}

/** What the server shows an admin next to a session: "Google Pixel 8 · Android 16". */
export function getDeviceLabel() {
  const constants = Platform.constants || {};
  const model = [constants.Brand, constants.Model].filter(Boolean).join(" ");

  return `${model || "Android device"} · Android ${Platform.Version}`;
}
