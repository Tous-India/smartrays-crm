import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

vi.mock("../../services/webPush.service.js", () => ({
  sendPush: vi.fn(async () => {}),
}));

// The FCM boundary: enabled unless a test says otherwise, sends succeed
// unless a test says otherwise. `isDeadTokenError` is the real one.
const fcmState = { enabled: true };
vi.mock("../../services/fcm.service.js", async () => {
  const actual = await vi.importActual("../../services/fcm.service.js");
  return {
    ...actual,
    isFcmEnabled: vi.fn(() => fcmState.enabled),
    sendFcm: vi.fn(async () => "projects/x/messages/1"),
  };
});

let app, DeviceToken, PushSubscription, RefreshToken, createNotification, sendPush, sendFcm;

/**
 * FCM beside Web Push (mobile-backend-plan.md §2): one dispatcher, two
 * transports; the web branch untouched; a dead token deactivated the way a
 * gone subscription is; registration idempotent; logout silences the device.
 */
beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ default: DeviceToken } = await import("./deviceToken.model.js"));
  ({ default: PushSubscription } = await import("./pushSubscription.model.js"));
  ({ default: RefreshToken } = await import("../auth/refreshToken.model.js"));
  ({ createNotification } = await import("./notification.service.js"));
  ({ sendPush } = await import("../../services/webPush.service.js"));
  ({ sendFcm } = await import("../../services/fcm.service.js"));
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearAllCollections();
  vi.clearAllMocks();
  fcmState.enabled = true;
});

async function employee() {
  return createUserDirectly({ name: "Emp", email: "emp@example.com", password: "password123", role: "employee" });
}

describe("POST /notifications/devices", () => {
  it("registers the caller's FCM token with its device id and app version", async () => {
    const user = await employee();
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    const response = await agent.post("/api/v1/notifications/devices").send({ token: "fcm-token-1", platform: "android", deviceId: "dev-1", appVersion: "0.0.1" });

    expect(response.status).toBe(201);
    const rows = await DeviceToken.find({ userId: user._id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ token: "fcm-token-1", transport: "fcm", platform: "android", deviceId: "dev-1", appVersion: "0.0.1", isActive: true });
  });

  it("re-registering the same token re-activates and re-associates it instead of duplicating", async () => {
    const first = await employee();
    await createUserDirectly({ name: "Other", email: "other@example.com", password: "password123", role: "employee" });
    await DeviceToken.create({ userId: first._id, token: "shared-phone", isActive: false });
    const agent = await loginAsAgent(app, "other@example.com", "password123");

    const response = await agent.post("/api/v1/notifications/devices").send({ token: "shared-phone" });

    expect(response.status).toBe(201);
    const rows = await DeviceToken.find({ token: "shared-phone" });
    expect(rows).toHaveLength(1);
    expect(rows[0].isActive).toBe(true);
    expect(String(rows[0].userId)).not.toBe(String(first._id));
  });

  it("rejects a missing token and an unknown platform", async () => {
    await employee();
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    expect((await agent.post("/api/v1/notifications/devices").send({})).status).toBe(400);
    expect((await agent.post("/api/v1/notifications/devices").send({ token: "t", platform: "windows" })).status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).post("/api/v1/notifications/devices").send({ token: "t" });

    expect(response.status).toBe(401);
  });
});

describe("DELETE /notifications/devices/:token", () => {
  it("deactivates the caller's token and is a no-op for someone else's", async () => {
    const user = await employee();
    const other = await createUserDirectly({ name: "Other", email: "other@example.com", password: "password123", role: "employee" });
    await DeviceToken.create({ userId: user._id, token: "mine" });
    await DeviceToken.create({ userId: other._id, token: "theirs" });
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    expect((await agent.delete("/api/v1/notifications/devices/mine")).status).toBe(200);
    expect((await agent.delete("/api/v1/notifications/devices/theirs")).status).toBe(200);

    expect((await DeviceToken.findOne({ token: "mine" })).isActive).toBe(false);
    expect((await DeviceToken.findOne({ token: "theirs" })).isActive).toBe(true);
  });
});

describe("createNotification dispatch", () => {
  it("sends Web Push to every active subscription AND FCM to every active device, with title, channel and data", async () => {
    const user = await employee();
    await PushSubscription.create({ userId: user._id, endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } });
    await DeviceToken.create({ userId: user._id, token: "fcm-1" });
    await DeviceToken.create({ userId: user._id, token: "fcm-2" });
    await DeviceToken.create({ userId: user._id, token: "fcm-dead", isActive: false });

    const notification = await createNotification(user._id, "service_assigned", "Vinay assigned you: Install router", { module: "services", id: user._id });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendFcm).toHaveBeenCalledTimes(2);
    expect(sendFcm).toHaveBeenCalledWith({
      token: "fcm-1",
      title: "New service assigned",
      body: "Vinay assigned you: Install router",
      data: { notificationId: String(notification._id), type: "service_assigned", module: "services", id: String(user._id) },
      channelId: "smartrays_work",
    });
  });

  it("deactivates a device whose token FCM reports gone, keeps one that merely failed, never throws", async () => {
    const user = await employee();
    await DeviceToken.create({ userId: user._id, token: "gone" });
    await DeviceToken.create({ userId: user._id, token: "flaky" });
    sendFcm.mockImplementation(async ({ token }) => {
      if (token === "gone") {
        throw Object.assign(new Error("Requested entity was not found."), { code: "messaging/registration-token-not-registered" });
      }
      throw new Error("socket hang up");
    });

    const notification = await createNotification(user._id, "leave_approved", "Approved");

    expect(notification).toBeTruthy();
    expect((await DeviceToken.findOne({ token: "gone" })).isActive).toBe(false);
    expect((await DeviceToken.findOne({ token: "flaky" })).isActive).toBe(true);
  });

  it("with FCM disabled, app devices are skipped and Web Push runs exactly as before", async () => {
    fcmState.enabled = false;
    const user = await employee();
    await PushSubscription.create({ userId: user._id, endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } });
    await DeviceToken.create({ userId: user._id, token: "fcm-1" });

    await createNotification(user._id, "leave_declined", "Declined");

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendFcm).not.toHaveBeenCalled();
  });
});

describe("POST /auth/mobile/logout", () => {
  it("deactivates the device's push registrations along with its refresh token", async () => {
    const user = await employee();
    const login = await request(app).post("/api/v1/auth/mobile/login").send({ email: "emp@example.com", password: "password123", deviceId: "phone-1", deviceLabel: "Pixel" });
    expect(login.status).toBe(200);
    await DeviceToken.create({ userId: user._id, token: "fcm-phone-1", deviceId: "phone-1" });
    await DeviceToken.create({ userId: user._id, token: "fcm-phone-2", deviceId: "phone-2" });

    const logout = await request(app)
      .post("/api/v1/auth/mobile/logout")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ refreshToken: login.body.data.refreshToken });

    expect(logout.status).toBe(200);
    expect((await DeviceToken.findOne({ token: "fcm-phone-1" })).isActive).toBe(false);
    expect((await DeviceToken.findOne({ token: "fcm-phone-2" })).isActive).toBe(true);
    expect((await RefreshToken.findOne({ userId: user._id, deviceId: "phone-1" })).revokedAt).toBeTruthy();
  });
});
