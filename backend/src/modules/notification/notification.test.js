import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

// No test here ever sends a real push — mocked at the module boundary, same
// pattern as Cloudinary/Google Maps mocking elsewhere in this codebase.
vi.mock("../../services/webPush.service.js", () => ({
  sendPush: vi.fn(async () => {}),
}));

let app, Notification, PushSubscription, User, createNotification, sendPush;
let user1Agent, user2Agent, user1, user2;

const SAMPLE_SUBSCRIPTION = {
  endpoint: "https://fcm.example.test/subscription-one",
  keys: { p256dh: "fake-p256dh", auth: "fake-auth" },
};

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  ({ default: Notification } = await import("./notification.model.js"));
  ({ default: PushSubscription } = await import("./pushSubscription.model.js"));
  ({ default: User } = await import("../user/user.model.js"));
  ({ createNotification } = await import("./notification.service.js"));
  ({ sendPush } = await import("../../services/webPush.service.js"));

  user1 = await createUserDirectly({
    name: "User One",
    email: "notifuser1@test.local",
    password: "Password123",
    role: "employee",
  });
  user1Agent = await loginAsAgent(app, "notifuser1@test.local", "Password123");

  user2 = await createUserDirectly({
    name: "User Two",
    email: "notifuser2@test.local",
    password: "Password123",
    role: "employee",
  });
  user2Agent = await loginAsAgent(app, "notifuser2@test.local", "Password123");
});

afterEach(async () => {
  vi.clearAllMocks();
  await Notification.deleteMany({});
  await PushSubscription.deleteMany({});
  await User.updateMany({}, { pushSubscriptions: [] });
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /notifications/subscribe", () => {
  it("creates a PushSubscription and links it to the user", async () => {
    const response = await user1Agent.post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION);

    expect(response.status).toBe(201);

    const subscription = await PushSubscription.findOne({ endpoint: SAMPLE_SUBSCRIPTION.endpoint });
    expect(subscription).not.toBeNull();
    expect(String(subscription.userId)).toBe(String(user1._id));
    expect(subscription.isActive).toBe(true);

    const updatedUser = await User.findById(user1._id);
    expect(updatedUser.pushSubscriptions.map(String)).toContain(String(subscription._id));
  });

  it("re-subscribing the same endpoint re-associates rather than erroring on a duplicate key", async () => {
    await user1Agent.post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION).expect(201);

    const response = await user2Agent.post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION);
    expect(response.status).toBe(201);

    const subscription = await PushSubscription.findOne({ endpoint: SAMPLE_SUBSCRIPTION.endpoint });
    expect(String(subscription.userId)).toBe(String(user2._id));
    expect(await PushSubscription.countDocuments({ endpoint: SAMPLE_SUBSCRIPTION.endpoint })).toBe(1);
  });

  it("rejects a missing endpoint/keys", async () => {
    const response = await user1Agent.post("/api/v1/notifications/subscribe").send({});

    expect(response.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const request = (await import("supertest")).default;
    const response = await request(app).post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION);

    expect(response.status).toBe(401);
  });
});

describe("POST /notifications/unsubscribe", () => {
  it("deactivates the subscription and unlinks it from the user", async () => {
    await user1Agent.post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION);

    const response = await user1Agent
      .post("/api/v1/notifications/unsubscribe")
      .send({ endpoint: SAMPLE_SUBSCRIPTION.endpoint });

    expect(response.status).toBe(200);

    const subscription = await PushSubscription.findOne({ endpoint: SAMPLE_SUBSCRIPTION.endpoint });
    expect(subscription.isActive).toBe(false);

    const updatedUser = await User.findById(user1._id);
    expect(updatedUser.pushSubscriptions.map(String)).not.toContain(String(subscription._id));
  });

  it("is a silent no-op for an endpoint belonging to a different user", async () => {
    await user1Agent.post("/api/v1/notifications/subscribe").send(SAMPLE_SUBSCRIPTION);

    const response = await user2Agent
      .post("/api/v1/notifications/unsubscribe")
      .send({ endpoint: SAMPLE_SUBSCRIPTION.endpoint });

    expect(response.status).toBe(200);
    expect((await PushSubscription.findOne({ endpoint: SAMPLE_SUBSCRIPTION.endpoint })).isActive).toBe(true);
  });
});

describe("GET /notifications and mark-read endpoints", () => {
  it("lists only the caller's own notifications, newest first", async () => {
    await Notification.create({ userId: user1._id, type: "lead_assigned", message: "For user1 A" });
    await Notification.create({ userId: user2._id, type: "lead_assigned", message: "For user2" });
    await Notification.create({ userId: user1._id, type: "ticket_assigned", message: "For user1 B" });

    const response = await user1Agent.get("/api/v1/notifications");

    expect(response.status).toBe(200);
    expect(response.body.data.map((notification) => notification.message)).toEqual([
      "For user1 B",
      "For user1 A",
    ]);
  });

  it("filters to unread only when unreadOnly=true", async () => {
    await Notification.create({
      userId: user1._id,
      type: "lead_assigned",
      message: "Already read",
      isRead: true,
    });
    await Notification.create({ userId: user1._id, type: "lead_assigned", message: "Still unread" });

    const response = await user1Agent.get("/api/v1/notifications?unreadOnly=true");

    expect(response.body.data.map((notification) => notification.message)).toEqual(["Still unread"]);
  });

  it("marks one notification as read, scoped to the caller", async () => {
    const notification = await Notification.create({
      userId: user1._id,
      type: "lead_assigned",
      message: "Mine",
    });

    const response = await user1Agent.patch(`/api/v1/notifications/${notification._id}/read`);

    expect(response.status).toBe(200);
    expect((await Notification.findById(notification._id)).isRead).toBe(true);
  });

  it("404s marking someone else's notification as read", async () => {
    const notification = await Notification.create({
      userId: user2._id,
      type: "lead_assigned",
      message: "Not mine",
    });

    const response = await user1Agent.patch(`/api/v1/notifications/${notification._id}/read`);

    expect(response.status).toBe(404);
    expect((await Notification.findById(notification._id)).isRead).toBe(false);
  });

  it("marks every one of the caller's unread notifications as read in bulk", async () => {
    await Notification.create({ userId: user1._id, type: "lead_assigned", message: "A" });
    await Notification.create({ userId: user1._id, type: "lead_assigned", message: "B" });
    const otherUsersNotification = await Notification.create({
      userId: user2._id,
      type: "lead_assigned",
      message: "Not mine",
    });

    const response = await user1Agent.patch("/api/v1/notifications/read-all");

    expect(response.status).toBe(200);
    expect(await Notification.countDocuments({ userId: user1._id, isRead: false })).toBe(0);
    // Bulk mark-read is scoped to the caller — doesn't touch anyone else's.
    expect((await Notification.findById(otherUsersNotification._id)).isRead).toBe(false);
  });
});

describe("GET /notifications?type= (§7.29, 2026-07-31 — sidebar badge filtering)", () => {
  it("filters to a single type", async () => {
    await Notification.create({ userId: user1._id, type: "lead_created", message: "Lead created" });
    await Notification.create({ userId: user1._id, type: "leave_requested", message: "Leave requested" });

    const response = await user1Agent.get("/api/v1/notifications?type=lead_created");

    expect(response.body.data.map((notification) => notification.message)).toEqual(["Lead created"]);
  });

  it("filters to a comma-separated list of types", async () => {
    await Notification.create({ userId: user1._id, type: "leave_requested", message: "Requested" });
    await Notification.create({ userId: user1._id, type: "leave_approved", message: "Approved" });
    await Notification.create({ userId: user1._id, type: "leave_declined", message: "Declined" });
    await Notification.create({ userId: user1._id, type: "lead_created", message: "Not a leave one" });

    const response = await user1Agent.get(
      "/api/v1/notifications?type=leave_requested,leave_approved,leave_declined"
    );

    expect(response.body.data.map((notification) => notification.message).sort()).toEqual([
      "Approved",
      "Declined",
      "Requested",
    ]);
  });

  it("combines type and unreadOnly filters — used by the sidebar badge count", async () => {
    await Notification.create({
      userId: user1._id,
      type: "lead_created",
      message: "Already read",
      isRead: true,
    });
    await Notification.create({ userId: user1._id, type: "lead_created", message: "Still unread" });
    await Notification.create({ userId: user1._id, type: "leave_requested", message: "Unread but wrong type" });

    const response = await user1Agent.get("/api/v1/notifications?unreadOnly=true&type=lead_created,lead_assigned");

    expect(response.body.data.map((notification) => notification.message)).toEqual(["Still unread"]);
  });

  it("with no type param at all, behaves exactly as before (no type filter)", async () => {
    await Notification.create({ userId: user1._id, type: "lead_created", message: "A" });
    await Notification.create({ userId: user1._id, type: "leave_requested", message: "B" });

    const response = await user1Agent.get("/api/v1/notifications");

    expect(response.body.data).toHaveLength(2);
  });
});

describe("PATCH /notifications/read-all?type= (§7.29 — nav-click mark-as-read)", () => {
  it("marks only the given type(s) as read, leaving other unread notifications untouched", async () => {
    const leadNotification = await Notification.create({
      userId: user1._id,
      type: "lead_created",
      message: "Lead",
    });
    const leaveNotification = await Notification.create({
      userId: user1._id,
      type: "leave_requested",
      message: "Leave",
    });

    const response = await user1Agent.patch("/api/v1/notifications/read-all?type=lead_created,lead_assigned");

    expect(response.status).toBe(200);
    expect((await Notification.findById(leadNotification._id)).isRead).toBe(true);
    expect((await Notification.findById(leaveNotification._id)).isRead).toBe(false);
  });

  it("stays scoped to the caller even with a type filter applied", async () => {
    const otherUsersNotification = await Notification.create({
      userId: user2._id,
      type: "lead_created",
      message: "Not mine",
    });

    await user1Agent.patch("/api/v1/notifications/read-all?type=lead_created");

    expect((await Notification.findById(otherUsersNotification._id)).isRead).toBe(false);
  });
});

describe("createNotification push delivery", () => {
  it("attempts a push to every active subscription for the user", async () => {
    await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/one",
      keys: { p256dh: "a", auth: "b" },
    });
    await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/two",
      keys: { p256dh: "c", auth: "d" },
    });

    await createNotification(user1._id, "lead_assigned", "You have a new lead");

    expect(sendPush).toHaveBeenCalledTimes(2);
  });

  it("skips inactive subscriptions", async () => {
    await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/inactive",
      keys: { p256dh: "a", auth: "b" },
      isActive: false,
    });

    await createNotification(user1._id, "lead_assigned", "Should not push");

    expect(sendPush).not.toHaveBeenCalled();
  });

  it("still creates the notification record even when every push attempt fails", async () => {
    sendPush.mockRejectedValueOnce(new Error("network error"));
    await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/failing",
      keys: { p256dh: "a", auth: "b" },
    });

    const notification = await createNotification(user1._id, "lead_assigned", "Still saved");

    expect(notification).not.toBeNull();
    expect(await Notification.findById(notification._id)).not.toBeNull();
  });

  it("deactivates a subscription when the push service reports it's gone (404/410)", async () => {
    const goneError = new Error("subscription gone");
    goneError.statusCode = 410;
    sendPush.mockRejectedValueOnce(goneError);

    const subscription = await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/gone",
      keys: { p256dh: "a", auth: "b" },
    });

    await createNotification(user1._id, "lead_assigned", "Triggers a 410");

    expect((await PushSubscription.findById(subscription._id)).isActive).toBe(false);
  });

  it("does not deactivate a subscription on a transient (non-404/410) push failure", async () => {
    const transientError = new Error("temporarily unavailable");
    transientError.statusCode = 503;
    sendPush.mockRejectedValueOnce(transientError);

    const subscription = await PushSubscription.create({
      userId: user1._id,
      endpoint: "https://fcm.example.test/transient",
      keys: { p256dh: "a", auth: "b" },
    });

    await createNotification(user1._id, "lead_assigned", "Transient failure");

    expect((await PushSubscription.findById(subscription._id)).isActive).toBe(true);
  });

  it("stores relatedEntity when provided", async () => {
    const fakeLeadId = user1._id; // any valid ObjectId works for this assertion

    const notification = await createNotification(user1._id, "lead_assigned", "With related entity", {
      module: "leads",
      id: fakeLeadId,
    });

    expect(notification.relatedEntity.module).toBe("leads");
    expect(String(notification.relatedEntity.id)).toBe(String(fakeLeadId));
  });
});
