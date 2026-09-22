import { fetchCurrentUser, loginMobile, logoutMobile, verifyTwoFactorMobile } from "../../api/authApi";
import {
  loadTokens,
  saveTokens,
  getRefreshToken,
  clearTokens,
  getTrustedDeviceToken,
  saveTrustedDeviceToken,
  getDeviceId,
  getDeviceLabel,
} from "../../store/tokenStorage";
import useSessionStore from "../../store/sessionStore";
import { hasServerResponse } from "../../utils/apiError.utils";
import { syncConsentFromServer } from "../tracking/tracking.service";

/**
 * The server's consent record is the source (final-plan.md §7.73); the
 * device only caches it. Refreshed whenever a session is established, in
 * the background — a failure here changes nothing the user can see now.
 */
function refreshConsentCache() {
  syncConsentFromServer().catch(() => {});
}

/**
 * Orchestration between the API, the keychain and the session store. Screens
 * call these; nothing else touches all three.
 */

/**
 * Launch: restore the pair from the keychain and ask the server who we are.
 * A stale access token is refreshed by the API client on the way. Only a
 * server answer (401 after a failed refresh, 403 deactivated) ends the
 * session; a network failure keeps the tokens and reports "unreachable" so
 * the user can retry instead of being signed out by a dead Wi-Fi.
 */
export async function restoreSession() {
  const { setRestoring, setSignedIn, setSignedOut, setUnreachable } = useSessionStore.getState();

  setRestoring();

  const tokens = await loadTokens();

  if (!tokens) {
    setSignedOut();
    return;
  }

  try {
    const response = await fetchCurrentUser();
    setSignedIn(response.data.data);
    refreshConsentCache();
  } catch (error) {
    if (hasServerResponse(error)) {
      await clearTokens();
      setSignedOut();
      return;
    }

    setUnreachable();
  }
}

/**
 * What every successful authentication ends with: keep the pair, keep the
 * trusted-device token when one was granted, then load the user through
 * the ordinary Bearer path and hand the store a signed-in session. If the
 * user cannot be loaded the tokens are dropped again — a half-session is
 * worse than none.
 */
async function establishSession(payload) {
  await saveTokens({ accessToken: payload.accessToken, refreshToken: payload.refreshToken });

  if (payload.trustedDeviceToken) {
    await saveTrustedDeviceToken(payload.trustedDeviceToken);
  }

  try {
    const response = await fetchCurrentUser();
    useSessionStore.getState().setSignedIn(response.data.data);
    refreshConsentCache();
  } catch (error) {
    await clearTokens();
    throw error;
  }
}

async function describeThisDevice() {
  return { deviceId: await getDeviceId(), deviceLabel: getDeviceLabel() };
}

/**
 * Email + password. Resolves to `{ requiresTwoFactor: true, preAuthToken,
 * email, name }` when the account has a second factor outstanding — the
 * screen then moves to the code step — or to `{ requiresTwoFactor: false }`
 * once the session is established. Errors (401 wrong password, 403
 * deactivated, 400 validation, network) are the caller's to show.
 */
export async function signIn(email, password) {
  const device = await describeThisDevice();
  const trustedDeviceToken = await getTrustedDeviceToken();

  const response = await loginMobile({ email: email.trim(), password, ...device }, trustedDeviceToken);
  const payload = response.data.data;

  if (payload.requiresTwoFactor) {
    return {
      requiresTwoFactor: true,
      preAuthToken: payload.preAuthToken,
      email: payload.email,
      name: payload.name,
    };
  }

  await establishSession(payload);

  return { requiresTwoFactor: false };
}

/**
 * The second factor: a TOTP code or a recovery code, plus whether to
 * remember this device. The server returns a trusted-device token only for
 * a TOTP verification with `rememberDevice` — a recovery code means the
 * authenticator is gone, and no new trust is minted in that breath (§7.40).
 */
export async function completeTwoFactor(preAuthToken, token, rememberDevice) {
  const device = await describeThisDevice();

  const response = await verifyTwoFactorMobile(preAuthToken, { token: token.trim(), rememberDevice, ...device });

  await establishSession(response.data.data);
}

/**
 * Sign out: revoke this install's refresh token server-side, then forget the
 * pair locally — in that order, and locally regardless of whether the server
 * call succeeded, so a dead connection can never trap someone in a session.
 * The trusted-device token stays, as on the web.
 */
export async function signOut() {
  const refreshToken = await getRefreshToken();

  try {
    if (refreshToken) {
      await logoutMobile(refreshToken);
    }
  } catch (error) {
    // Nothing to do: the server either revoked it, or will refuse it when it
    // is next presented. The local state is what the user is waiting on.
  } finally {
    await clearTokens();
    useSessionStore.getState().setSignedOut();
  }
}
