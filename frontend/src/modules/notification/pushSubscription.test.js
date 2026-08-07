import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as notificationApi from "./api/notificationApi";
import {
  LAST_SENT_KEY,
  disablePush,
  enablePush,
  getPermissionState,
  isPushSupported,
  registerServiceWorker,
  syncSubscription,
  urlBase64ToUint8Array,
} from "./pushSubscription";

/**
 * §6.7 (2026-08-07) — the client half of Web Push.
 *
 * jsdom has no ServiceWorker or PushManager, so those are stubbed onto the
 * globals here. That makes these tests about the DECISIONS — which state is
 * reported, what gets POSTed, whether a rotated subscription is re-sent — and
 * NOT about whether push actually works, which only a real browser can show.
 * The browser run is recorded in docs/project-status.md.
 */

vi.mock("./api/notificationApi", () => ({
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

const SUBSCRIPTION = {
  endpoint: "https://push.example/abc",
  toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function stubPushSupport({ permission = "default", existing = null } = {}) {
  const pushManager = {
    subscribe: vi.fn().mockResolvedValue(SUBSCRIPTION),
    getSubscription: vi.fn().mockResolvedValue(existing),
  };

  vi.stubGlobal("navigator", {
    ...navigator,
    serviceWorker: {
      register: vi.fn().mockResolvedValue({ scope: "/" }),
      ready: Promise.resolve({ pushManager }),
    },
  });
  vi.stubGlobal("PushManager", function PushManagerStub() {});
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission === "default" ? "granted" : permission),
  });

  return pushManager;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  notificationApi.subscribeToPush.mockResolvedValue({ data: {} });
  notificationApi.unsubscribeFromPush.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("support and permission reporting", () => {
  it("reports unsupported when the browser lacks PushManager", () => {
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: {} });
    vi.stubGlobal("PushManager", undefined);

    expect(isPushSupported()).toBe(false);
    expect(getPermissionState()).toBe("unsupported");
  });

  it("reports unsupported when there is no service worker at all", () => {
    vi.stubGlobal("navigator", {});

    expect(isPushSupported()).toBe(false);
  });

  it.each(["default", "granted", "denied"])("passes through the %s permission", (permission) => {
    stubPushSupport({ permission });

    expect(getPermissionState()).toBe(permission);
  });
});

describe("enablePush", () => {
  it("subscribes with the VAPID key and POSTs the subscription", async () => {
    const pushManager = stubPushSupport({ permission: "default" });

    const result = await enablePush();

    expect(result).toMatchObject({ ok: true, permission: "granted" });
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    );
    expect(notificationApi.subscribeToPush).toHaveBeenCalledWith(SUBSCRIPTION.toJSON());
  });

  it("remembers the endpoint it sent, so rotation can be detected later", async () => {
    stubPushSupport();

    await enablePush();

    expect(window.localStorage.getItem(LAST_SENT_KEY)).toBe(SUBSCRIPTION.endpoint);
  });

  it("reports denied WITHOUT subscribing — a denial is an answer, not an error", async () => {
    const pushManager = stubPushSupport({ permission: "denied" });

    const result = await enablePush();

    expect(result).toMatchObject({ ok: false, permission: "denied", reason: "denied" });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(notificationApi.subscribeToPush).not.toHaveBeenCalled();
  });

  it("reports unsupported rather than throwing", async () => {
    vi.stubGlobal("navigator", {});

    await expect(enablePush()).resolves.toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("reports not-configured, without prompting, when the VAPID key is absent", async () => {
    const pushManager = stubPushSupport();
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");

    const result = await enablePush();

    // Same shape as the backend returning 503 when its cleanup secret is
    // unset: refuse cleanly rather than half-working. Crucially it must not
    // burn the one permission prompt the user will ever reflexively answer.
    expect(result).toMatchObject({ ok: false, reason: "not-configured" });
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("does not POST anything when the browser subscribe call fails", async () => {
    const pushManager = stubPushSupport();
    pushManager.subscribe.mockRejectedValue(new Error("push service unavailable"));

    const result = await enablePush();

    expect(result).toMatchObject({ ok: false, reason: "subscribe-failed" });
    expect(notificationApi.subscribeToPush).not.toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("unsubscribes locally AND deactivates server-side", async () => {
    stubPushSupport({ permission: "granted", existing: SUBSCRIPTION });
    window.localStorage.setItem(LAST_SENT_KEY, SUBSCRIPTION.endpoint);

    const result = await disablePush();

    expect(result.ok).toBe(true);
    expect(SUBSCRIPTION.unsubscribe).toHaveBeenCalled();
    expect(notificationApi.unsubscribeFromPush).toHaveBeenCalledWith(SUBSCRIPTION.endpoint);
    expect(window.localStorage.getItem(LAST_SENT_KEY)).toBeNull();
  });

  it("still deactivates server-side when the local unsubscribe throws", async () => {
    stubPushSupport({ permission: "granted", existing: SUBSCRIPTION });
    SUBSCRIPTION.unsubscribe.mockRejectedValueOnce(new Error("nope"));

    await disablePush();

    // Better a stale browser subscription than a server that keeps pushing.
    expect(notificationApi.unsubscribeFromPush).toHaveBeenCalled();
  });

  it("is a no-op when there is nothing subscribed", async () => {
    stubPushSupport({ permission: "granted", existing: null });

    await expect(disablePush()).resolves.toMatchObject({ ok: true, reason: "not-subscribed" });
    expect(notificationApi.unsubscribeFromPush).not.toHaveBeenCalled();
  });
});

describe("syncSubscription — re-send a rotated subscription", () => {
  it("re-POSTs when the endpoint differs from what was last sent", async () => {
    stubPushSupport({ permission: "granted", existing: SUBSCRIPTION });
    window.localStorage.setItem(LAST_SENT_KEY, "https://push.example/OLD");

    const result = await syncSubscription();

    // A rotated subscription the server never hears about is silently dead:
    // pushes go to the old endpoint, 410, and get deactivated.
    expect(result).toMatchObject({ synced: true, reason: "rotated" });
    expect(notificationApi.subscribeToPush).toHaveBeenCalledWith(SUBSCRIPTION.toJSON());
    expect(window.localStorage.getItem(LAST_SENT_KEY)).toBe(SUBSCRIPTION.endpoint);
  });

  it("does nothing when the endpoint is unchanged", async () => {
    stubPushSupport({ permission: "granted", existing: SUBSCRIPTION });
    window.localStorage.setItem(LAST_SENT_KEY, SUBSCRIPTION.endpoint);

    await expect(syncSubscription()).resolves.toMatchObject({ synced: false, reason: "unchanged" });
    expect(notificationApi.subscribeToPush).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not subscribed", async () => {
    stubPushSupport({ permission: "default", existing: null });

    await expect(syncSubscription()).resolves.toMatchObject({ synced: false, reason: "no-subscription" });
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js and prompts for nothing", async () => {
    stubPushSupport();

    await registerServiceWorker();

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    // Asking for permission on load is what gets sites reflexively denied.
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("returns null instead of breaking startup when registration fails", async () => {
    stubPushSupport();
    navigator.serviceWorker.register.mockRejectedValue(new Error("no https"));

    await expect(registerServiceWorker()).resolves.toBeNull();
  });

  it("does nothing on an unsupported browser", async () => {
    vi.stubGlobal("navigator", {});

    await expect(registerServiceWorker()).resolves.toBeNull();
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key to the byte array subscribe() needs", () => {
    const result = urlBase64ToUint8Array("BPoN-_8=");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles unpadded base64url, which is how VAPID keys are published", () => {
    expect(() => urlBase64ToUint8Array("BKWphfvxobPJabc")).not.toThrow();
  });
});
