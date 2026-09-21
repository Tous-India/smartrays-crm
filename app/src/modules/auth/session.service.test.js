import apiClient, { refreshClient } from "../../api/apiClient";
import { saveTokens, loadTokens, clearTokens } from "../../store/tokenStorage";
import useSessionStore, { SESSION_STATUS } from "../../store/sessionStore";
import { restoreSession, signOut } from "./session.service";

/**
 * Launch restore and sign-out, against a fake adapter (see apiClient.test.js
 * for the same technique). What matters: a server answer ends a session, a
 * dead network does not, and sign-out always clears locally.
 */

function respond(config, status, data) {
  const response = { status, statusText: String(status), headers: {}, config, data };

  if (status >= 400) {
    const error = new Error(`status ${status}`);
    error.config = config;
    error.response = response;
    return Promise.reject(error);
  }

  return Promise.resolve(response);
}

function networkDown(config) {
  const error = new Error("Network Error");
  error.config = config;
  error.request = {};
  return Promise.reject(error);
}

const calls = [];

beforeEach(async () => {
  calls.length = 0;
  // The refresh path is exercised by apiClient.test.js; here it simply fails.
  refreshClient.defaults.adapter = networkDown;
  await clearTokens();
  useSessionStore.getState().setRestoring();
});

test("no stored tokens → signed out, without asking the server", async () => {
  apiClient.defaults.adapter = async (config) => {
    calls.push(config.url);
    return respond(config, 200, { data: {} });
  };

  await restoreSession();

  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
  expect(calls).toEqual([]);
});

test("stored tokens + a live server → signed in with the server's user", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  apiClient.defaults.adapter = async (config) => respond(config, 200, { data: { name: "Employee", role: "employee" } });

  await restoreSession();

  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
  expect(useSessionStore.getState().user).toEqual({ name: "Employee", role: "employee" });
});

test("stored tokens but the server cannot be reached → unreachable, tokens KEPT", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  apiClient.defaults.adapter = networkDown;

  await restoreSession();

  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.UNREACHABLE);
  expect(await loadTokens()).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
});

test("stored tokens the server refuses (refresh dead too) → signed out, tokens cleared", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  apiClient.defaults.adapter = async (config) =>
    respond(config, 401, { success: false, message: "gone", errors: [{ code: "SESSION_EXPIRED" }] });

  await restoreSession();

  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
  expect(await loadTokens()).toBeNull();
});

test("a deactivated account (403) → signed out, tokens cleared", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  apiClient.defaults.adapter = async (config) => respond(config, 403, { success: false, message: "deactivated" });

  await restoreSession();

  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
  expect(await loadTokens()).toBeNull();
});

test("sign-out revokes the refresh token on the server, then clears locally — and clears even when the server is down", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  useSessionStore.getState().setSignedIn({ name: "Employee" });
  apiClient.defaults.adapter = async (config) => {
    calls.push({ url: config.url, body: JSON.parse(config.data) });
    return respond(config, 200, { data: null });
  };

  await signOut();

  expect(calls).toEqual([{ url: "/auth/mobile/logout", body: { refreshToken: "refresh-1" } }]);
  expect(await loadTokens()).toBeNull();
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);

  await saveTokens({ accessToken: "access-2", refreshToken: "refresh-2" });
  useSessionStore.getState().setSignedIn({ name: "Employee" });
  apiClient.defaults.adapter = networkDown;

  await signOut();

  expect(await loadTokens()).toBeNull();
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
});
