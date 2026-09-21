import apiClient, { refreshClient } from "./apiClient";
import { saveTokens, getAccessToken, loadTokens, clearTokens } from "../store/tokenStorage";
import useSessionStore, { SESSION_STATUS } from "../store/sessionStore";

/**
 * The interceptor contract: refresh once on 401, replay the request, share
 * one refresh between concurrent callers, and sign out when the refresh
 * fails. Driven through a fake axios adapter, so no network and no timers —
 * the adapter IS the server, and it counts what it was asked.
 */

function jsonResponse(config, status, data) {
  const response = { status, statusText: String(status), headers: {}, config, data };

  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = response;
    return Promise.reject(error);
  }

  return Promise.resolve(response);
}

/**
 * A server whose access tokens are named ("good-1", "good-2"…) and whose
 * refresh endpoint hands out the next name. `me` answers 401 for any token
 * that is not the current one.
 */
function fakeServer({ refreshFails = false, refreshDelayMs = 0 } = {}) {
  const state = { currentToken: "good-1", refreshCalls: 0, meCalls: 0, issued: 1 };

  const adapter = async (config) => {
    if (config.url.includes("/auth/mobile/refresh")) {
      state.refreshCalls += 1;

      if (refreshDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
      }

      if (refreshFails) {
        return jsonResponse(config, 401, { success: false, message: "gone", errors: [{ code: "SESSION_EXPIRED" }] });
      }

      state.issued += 1;
      state.currentToken = `good-${state.issued}`;

      return jsonResponse(config, 200, {
        data: { accessToken: state.currentToken, accessExpiresIn: 900, refreshToken: `refresh-${state.issued}` },
      });
    }

    if (config.url.includes("/auth/me")) {
      state.meCalls += 1;
      const presented = (config.headers.Authorization || "").replace("Bearer ", "");

      if (presented !== state.currentToken) {
        return jsonResponse(config, 401, { success: false, message: "expired", errors: [{ code: "SESSION_EXPIRED" }] });
      }

      return jsonResponse(config, 200, { data: { name: "Employee", token: presented } });
    }

    if (config.url.includes("/auth/mobile/login")) {
      return jsonResponse(config, 401, { success: false, message: "Invalid email or password" });
    }

    return jsonResponse(config, 404, { success: false, message: "not found" });
  };

  return { state, adapter };
}

beforeEach(async () => {
  await clearTokens();
  useSessionStore.getState().setSignedIn({ name: "Employee" });
});

test("attaches the in-memory access token as a Bearer header", async () => {
  const server = fakeServer();
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;
  await saveTokens({ accessToken: "good-1", refreshToken: "refresh-1" });

  const response = await apiClient.get("/auth/me");

  expect(response.data.data.token).toBe("good-1");
  expect(server.state.refreshCalls).toBe(0);
});

test("on 401 it refreshes ONCE, stores the new pair, and replays the request", async () => {
  const server = fakeServer();
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;
  await saveTokens({ accessToken: "stale", refreshToken: "refresh-1" });

  const response = await apiClient.get("/auth/me");

  expect(response.data.data.token).toBe("good-2");
  expect(server.state.refreshCalls).toBe(1);
  expect(server.state.meCalls).toBe(2);
  expect(getAccessToken()).toBe("good-2");
  expect(await loadTokens()).toEqual({ accessToken: "good-2", refreshToken: "refresh-2" });
});

test("concurrent 401s queue behind ONE refresh — the rotating token is never presented twice", async () => {
  const server = fakeServer({ refreshDelayMs: 20 });
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;
  await saveTokens({ accessToken: "stale", refreshToken: "refresh-1" });

  const responses = await Promise.all([
    apiClient.get("/auth/me"),
    apiClient.get("/auth/me"),
    apiClient.get("/auth/me"),
    apiClient.get("/auth/me"),
  ]);

  expect(server.state.refreshCalls).toBe(1);
  expect(responses.map((response) => response.data.data.token)).toEqual(["good-2", "good-2", "good-2", "good-2"]);
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
});

test("when the refresh fails it clears the tokens, signs out, and rethrows the ORIGINAL error", async () => {
  const server = fakeServer({ refreshFails: true });
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;
  await saveTokens({ accessToken: "stale", refreshToken: "refresh-1" });

  await expect(apiClient.get("/auth/me")).rejects.toMatchObject({ response: { status: 401, data: { message: "expired" } } });

  expect(server.state.refreshCalls).toBe(1);
  expect(getAccessToken()).toBeNull();
  expect(await loadTokens()).toBeNull();
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
});

test("a 401 from the login endpoint is the answer, not a reason to refresh", async () => {
  const server = fakeServer();
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;
  await saveTokens({ accessToken: "good-1", refreshToken: "refresh-1" });

  await expect(apiClient.post("/auth/mobile/login", {})).rejects.toMatchObject({
    response: { data: { message: "Invalid email or password" } },
  });

  expect(server.state.refreshCalls).toBe(0);
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_IN);
});

test("with no refresh token stored, a 401 signs out without calling refresh", async () => {
  const server = fakeServer();
  apiClient.defaults.adapter = server.adapter;
  refreshClient.defaults.adapter = server.adapter;

  await expect(apiClient.get("/auth/me")).rejects.toMatchObject({ response: { status: 401 } });

  expect(server.state.refreshCalls).toBe(0);
  expect(useSessionStore.getState().status).toBe(SESSION_STATUS.SIGNED_OUT);
});
