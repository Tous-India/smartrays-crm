import { fetchCurrentUser, logoutMobile } from "../../api/authApi";
import { loadTokens, getRefreshToken, clearTokens } from "../../store/tokenStorage";
import useSessionStore from "../../store/sessionStore";
import { hasServerResponse } from "../../utils/apiError.utils";

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
