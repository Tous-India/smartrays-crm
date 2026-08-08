import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiClient, { registerUnauthorizedHandler } from "./apiClient";

/**
 * The 401 interceptor (2026-08-08).
 *
 * A 401 means two different things: "your session is dead" and "the secret you
 * just typed was wrong". This interceptor used to treat every 401 as the first
 * — with a single hard-coded exemption for `/auth/login` — so a mistyped
 * password on 2FA-disable signed the user out, and the modal unmounted before
 * the server's message could render.
 *
 * The exemption list is gone. The backend marks genuine session expiry with
 * `errors: [{ code: "SESSION_EXPIRED" }]` and the redirect happens ONLY on
 * that, so a new credential-checking endpoint is safe by default rather than
 * needing to be remembered here.
 *
 * The axios ADAPTER is swapped rather than pulling in a mocking library, so
 * the real interceptor chain is what runs.
 */

const SESSION_EXPIRED = { message: "Please log in again.", errors: [{ code: "SESSION_EXPIRED" }] };

const realAdapter = apiClient.defaults.adapter;
const realLocation = window.location;
let assignedHref;

function respondWith(status, data) {
  apiClient.defaults.adapter = async (config) => {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.isAxiosError = true;
    error.response = { status, data, config, headers: {}, statusText: "" };
    throw error;
  };
}

beforeEach(() => {
  assignedHref = null;

  // jsdom refuses a real navigation, and the attempt itself is what we assert.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      pathname: "/settings/account",
      set href(value) {
        assignedHref = value;
      },
      get href() {
        return assignedHref;
      },
    },
  });
});

afterEach(() => {
  apiClient.defaults.adapter = realAdapter;
  registerUnauthorizedHandler(null);
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
  vi.restoreAllMocks();
});

describe("a MARKED 401 — the session really is dead", () => {
  it("clears the session and redirects to /login", async () => {
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    respondWith(401, SESSION_EXPIRED);

    await expect(apiClient.get("/auth/me")).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalled();
    expect(assignedHref).toBe("/login");
  });

  it("redirects even from a credential-checking endpoint, if the session died mid-request", async () => {
    // The classification is the SERVER's, never the URL's. A session that dies
    // while the disable modal is open must still sign the user out.
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    respondWith(401, SESSION_EXPIRED);

    await expect(apiClient.post("/auth/2fa/disable", {})).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalled();
    expect(assignedHref).toBe("/login");
  });

  it("does not redirect when already sitting on /login", async () => {
    window.location.pathname = "/login";
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    respondWith(401, SESSION_EXPIRED);

    await expect(apiClient.get("/auth/me")).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });
});

describe("an UNMARKED 401 — the credential typed in was wrong", () => {
  it("does NOT redirect on a wrong password at 2FA-disable, and propagates the server's message", async () => {
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    respondWith(401, { message: "Your password is incorrect", errors: [] });

    await expect(apiClient.post("/auth/2fa/disable", {})).rejects.toMatchObject({
      response: { status: 401, data: { message: "Your password is incorrect" } },
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on a wrong 2FA code, and keeps its distinct message", async () => {
    respondWith(401, { message: "That code isn't valid.", errors: [] });

    await expect(apiClient.post("/auth/2fa/disable", {})).rejects.toMatchObject({
      response: { data: { message: "That code isn't valid." } },
    });

    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on a wrong current password at change-password", async () => {
    respondWith(401, { message: "Your current password is incorrect", errors: [] });

    await expect(apiClient.post("/auth/change-password", {})).rejects.toBeTruthy();

    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on the admin-reset re-authentication failure", async () => {
    respondWith(401, { message: "Your password is incorrect", errors: [] });

    await expect(apiClient.post("/auth/2fa/admin-reset", {})).rejects.toBeTruthy();

    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect a failed login — no longer via a URL special case", async () => {
    // This used to be the ONE hard-coded exemption. It now falls out of the
    // rule for free, because a wrong password simply isn't marked.
    respondWith(401, { message: "Invalid email or password", errors: [] });

    await expect(apiClient.post("/auth/login", {})).rejects.toBeTruthy();

    expect(assignedHref).toBeNull();
  });

  it("tolerates a 401 body with no errors array at all", async () => {
    respondWith(401, { message: "no errors key" });

    await expect(apiClient.get("/anything")).rejects.toBeTruthy();

    expect(assignedHref).toBeNull();
  });

  it("ignores an unrelated error code in the same array", async () => {
    respondWith(401, { message: "something else", errors: [{ code: "SOMETHING_ELSE" }] });

    await expect(apiClient.get("/anything")).rejects.toBeTruthy();

    expect(assignedHref).toBeNull();
  });
});

describe("non-401 responses are untouched", () => {
  it("leaves a 403 alone, even carrying the marker", async () => {
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    respondWith(403, SESSION_EXPIRED);

    await expect(apiClient.get("/auth/me")).rejects.toBeTruthy();

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });
});
