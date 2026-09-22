import apiClient, { refreshClient } from "../../api/apiClient";
import { saveTokens, loadTokens, clearTokens, getTrustedDeviceToken, saveTrustedDeviceToken } from "../../store/tokenStorage";
import useSessionStore, { SESSION_STATUS } from "../../store/sessionStore";
import { restoreSession, signIn, completeTwoFactor, signOut } from "./session.service";

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

describe("signIn", () => {
  /**
   * A server that answers login with either a token pair or a 2FA challenge,
   * and /auth/me with the user for the access token it just issued.
   */
  function loginServer({ challenge = false } = {}) {
    const seen = { login: null, verify: null, headers: null };

    return {
      seen,
      adapter: async (config) => {
        if (config.url.includes("/auth/mobile/login")) {
          seen.login = JSON.parse(config.data);
          seen.headers = config.headers;

          if (challenge) {
            return respond(config, 200, {
              data: { requiresTwoFactor: true, preAuthToken: "pre-auth", email: "employee@test.local", name: "Employee" },
            });
          }

          return respond(config, 200, {
            data: { user: { name: "Employee" }, accessToken: "access-1", accessExpiresIn: 900, refreshToken: "refresh-1" },
          });
        }

        if (config.url.includes("/auth/mobile/2fa/verify")) {
          seen.verify = { body: JSON.parse(config.data), authorization: config.headers.Authorization };

          return respond(config, 200, {
            data: {
              user: { name: "Employee" },
              accessToken: "access-2",
              accessExpiresIn: 900,
              refreshToken: "refresh-2",
              trustedDeviceToken: "trusted-1",
            },
          });
        }

        if (config.url.includes("/auth/me")) {
          return respond(config, 200, { data: { name: "Employee", role: "employee", via: config.headers.Authorization } });
        }

        return respond(config, 404, { message: "not found" });
      },
    };
  }

  test("password only: stores the pair, loads the user through the Bearer path, signs in", async () => {
    const server = loginServer();
    apiClient.defaults.adapter = server.adapter;

    const result = await signIn("  employee@test.local ", "secret");

    expect(result).toEqual({ requiresTwoFactor: false });
    expect(server.seen.login).toMatchObject({ email: "employee@test.local", password: "secret" });
    expect(server.seen.login.deviceId).toBeTruthy();
    expect(server.seen.login.deviceLabel).toMatch(/Android/);
    expect(await loadTokens()).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
    expect(useSessionStore.getState().user).toMatchObject({ role: "employee", via: "Bearer access-1" });
  });

  test("sends a stored trusted-device token as the X-Trusted-Device header", async () => {
    await saveTrustedDeviceToken("trusted-0");
    const server = loginServer();
    apiClient.defaults.adapter = server.adapter;

    await signIn("employee@test.local", "secret");

    expect(server.seen.headers["X-Trusted-Device"]).toBe("trusted-0");
  });

  test("a two-factor challenge stores nothing and hands back the pre-auth token", async () => {
    const server = loginServer({ challenge: true });
    apiClient.defaults.adapter = server.adapter;

    const result = await signIn("employee@test.local", "secret");

    expect(result).toEqual({
      requiresTwoFactor: true,
      preAuthToken: "pre-auth",
      email: "employee@test.local",
      name: "Employee",
    });
    expect(await loadTokens()).toBeNull();
    expect(useSessionStore.getState().status).toBe(SESSION_STATUS.RESTORING);
  });

  test("completeTwoFactor verifies with the pre-auth token, keeps the trusted-device token, signs in", async () => {
    const server = loginServer({ challenge: true });
    apiClient.defaults.adapter = server.adapter;

    await completeTwoFactor("pre-auth", " 123456 ", true);

    expect(server.seen.verify.authorization).toBe("Bearer pre-auth");
    expect(server.seen.verify.body).toMatchObject({ token: "123456", rememberDevice: true });
    expect(await loadTokens()).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" });
    expect(await getTrustedDeviceToken()).toBe("trusted-1");
    expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
  });

  test("a wrong password propagates the server's 401 and stores nothing", async () => {
    apiClient.defaults.adapter = async (config) => respond(config, 401, { success: false, message: "Invalid email or password" });

    await expect(signIn("employee@test.local", "wrong")).rejects.toMatchObject({
      response: { data: { message: "Invalid email or password" } },
    });
    expect(await loadTokens()).toBeNull();
    expect(useSessionStore.getState().status).toBe(SESSION_STATUS.RESTORING);
  });
});

describe("the consent cache follows the server (final-plan.md §7.73)", () => {
  const CONSENT = {
    id: "c1",
    decision: "granted",
    disclosureVersion: "2026-09-21.1",
    appVersion: "0.0.1",
    deviceId: "d",
    recordedAt: "2026-09-21T09:00:00.000Z",
  };

  function serverWith(consent) {
    return async (config) => {
      calls.push(config.url);

      if (config.url.includes("/location/consent/me")) {
        return respond(config, 200, { data: consent });
      }
      if (config.url.includes("/auth/mobile/login")) {
        return respond(config, 200, { data: { requiresTwoFactor: false, accessToken: "a", refreshToken: "r" } });
      }
      return respond(config, 200, { data: { name: "Employee", role: "employee" } });
    };
  }

  async function settled() {
    // The sync runs after the session is set, without being awaited.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    global.mockTrackingNative.flags = {};
  });

  test("launch restore fetches the latest decision and caches it — a reinstall is not asked again", async () => {
    await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    apiClient.defaults.adapter = serverWith(CONSENT);

    await restoreSession();
    await settled();

    expect(calls).toContain("/location/consent/me");
    expect(global.mockTrackingNative.flags.disclosure).toBe("granted|2026-09-21.1|2026-09-21T09:00:00.000Z");
  });

  test("sign-in does the same", async () => {
    apiClient.defaults.adapter = serverWith(CONSENT);

    await signIn("e@x.com", "pw");
    await settled();

    expect(calls).toContain("/location/consent/me");
    expect(global.mockTrackingNative.flags.disclosure).toBe("granted|2026-09-21.1|2026-09-21T09:00:00.000Z");
  });

  test("a failed consent fetch changes nothing about the session", async () => {
    await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    apiClient.defaults.adapter = async (config) => {
      if (config.url.includes("/location/consent/me")) {
        return respond(config, 500, { message: "boom" });
      }
      return respond(config, 200, { data: { name: "Employee", role: "employee" } });
    };

    await restoreSession();
    await settled();

    expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
  });
});
