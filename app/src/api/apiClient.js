import axios from "axios";
import Config from "react-native-config";
import { API_PATHS } from "../constants/api.constants";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "../store/tokenStorage";
import useSessionStore from "../store/sessionStore";

/**
 * The one axios instance every module calls (app-plan.md §3.2).
 *
 * Request: the in-memory access token goes out as `Authorization: Bearer`.
 * Response: a 401 means the access token has expired — it lives 15 minutes
 * by design, so this happens many times a day. The client refreshes ONCE and
 * replays the request. While a refresh is in flight every other 401 waits on
 * that same promise rather than starting its own: the refresh token rotates
 * on use, so two concurrent refreshes would present the same token twice,
 * and the server treats a second presentation as reuse and revokes the
 * device. If the refresh itself fails, the tokens are cleared and the store
 * is set to signed out — the navigator takes it from there.
 *
 * `API_BASE_URL` is build-time configuration (react-native-config, app/.env);
 * an unset value fails loudly here rather than as a mysterious network error.
 */

if (!Config.API_BASE_URL) {
  throw new Error("API_BASE_URL is not set — copy app/.env.example to app/.env and rebuild.");
}

const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// A bare instance for the refresh call itself — no interceptors, so a 401 on
// refresh can never trigger another refresh. Exported for tests only, so a
// fake adapter can stand in for the server on both instances.
export const refreshClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// Endpoints where a 401 is the ANSWER (wrong password, bad code, dead refresh
// token), never a signal to refresh.
const NO_REFRESH_PATHS = [API_PATHS.MOBILE_LOGIN, API_PATHS.MOBILE_TWO_FACTOR_VERIFY, API_PATHS.MOBILE_REFRESH];

function isAuthPath(url = "") {
  return NO_REFRESH_PATHS.some((path) => url.includes(path));
}

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

let refreshInFlight = null;

/**
 * Exchanges the stored refresh token for a new pair and stores it. Shared:
 * every caller during one refresh receives the same promise.
 */
function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function performRefresh() {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    throw new Error("No refresh token stored");
  }

  const response = await refreshClient.post(API_PATHS.MOBILE_REFRESH, { refreshToken });
  const tokens = response.data.data;

  await saveTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });

  return tokens.accessToken;
}

/** The session is gone for good: forget the tokens and tell the navigator. */
async function handleSessionLost() {
  await clearTokens();
  useSessionStore.getState().setSignedOut();
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    const shouldRefresh =
      response && response.status === 401 && config && !config._retriedAfterRefresh && !isAuthPath(config.url);

    if (!shouldRefresh) {
      throw error;
    }

    config._retriedAfterRefresh = true;

    let accessToken;

    try {
      accessToken = await refreshSession();
    } catch (refreshError) {
      await handleSessionLost();
      throw error;
    }

    config.headers.Authorization = `Bearer ${accessToken}`;

    return apiClient(config);
  }
);

export default apiClient;
