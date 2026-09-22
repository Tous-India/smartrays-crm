import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

vi.mock("../../services/webPush.service.js", () => ({ sendPush: vi.fn(async () => {}) }));
vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn(() => null),
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "https://fake/x.jpg", publicId: "fake-id" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));
vi.mock("../../services/googleMaps.service.js", () => ({ getDistanceKm: vi.fn(async () => 5) }));

const CLEANUP_TOKEN = "test-cleanup-secret";
process.env.ATTENDANCE_CLEANUP_TOKEN = CLEANUP_TOKEN;

let app, Attendance, ShiftReminder, Notification, remindOpenShiftIfDue;

/**
 * The forgotten check-out (§7.74): one reminder per long-open shift, via
 * the heartbeat and via the cron backstop; the attendance record itself is
 * never written to by any of it.
 */
beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ default: Attendance } = await import("./attendance.model.js"));
  ({ default: ShiftReminder } = await import("./shiftReminder.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ remindOpenShiftIfDue } = await import("./attendance.service.js"));
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearAllCollections();
  vi.clearAllMocks();
});

const HOUR = 60 * 60 * 1000;

async function openShift(employee, hoursAgo) {
  const checkIn = new Date(Date.now() - hoursAgo * HOUR);
  const date = new Date(checkIn);
  date.setHours(0, 0, 0, 0);

  return Attendance.create({ employeeId: employee._id, date, status: "present", checkIn: { time: checkIn, coords: { lat: 1, lng: 2 } } });
}

async function employee(email = "emp@example.com") {
  return createUserDirectly({ name: "Emp", email, password: "password123", role: "employee" });
}

describe("remindOpenShiftIfDue", () => {
  it("does nothing for a shift open less than the threshold", async () => {
    const user = await employee();
    const record = await openShift(user, 3);

    expect(await remindOpenShiftIfDue(record)).toBeNull();
    expect(await ShiftReminder.countDocuments()).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("sends exactly one reminder for a shift open past the threshold, and leaves the record untouched", async () => {
    const user = await employee();
    const record = await openShift(user, 11);
    const before = (await Attendance.findById(record._id)).toObject();

    const first = await remindOpenShiftIfDue(record);
    const second = await remindOpenShiftIfDue(record);

    expect(first).toMatchObject({ employeeId: user._id, openForHours: 11 });
    expect(second).toBeNull();
    expect(await ShiftReminder.countDocuments({ attendanceId: record._id })).toBe(1);
    const notifications = await Notification.find({ userId: user._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "shift_open_reminder", message: "Your shift has been open for 11 hours. Forgot to check out?" });
    expect(String(notifications[0].relatedEntity.id)).toBe(String(record._id));
    const after = (await Attendance.findById(record._id)).toObject();
    expect(after.checkOut).toEqual(before.checkOut);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("ignores a closed shift", async () => {
    const user = await employee();
    const record = await openShift(user, 30);
    record.checkOut = { time: new Date() };
    await record.save();

    expect(await remindOpenShiftIfDue(record)).toBeNull();
  });
});

describe("POST /attendance/heartbeat", () => {
  it("reminds through the heartbeat once the shift is long enough, and only once", async () => {
    const user = await employee();
    await openShift(user, 10.5);
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    expect((await agent.post("/api/v1/attendance/heartbeat")).status).toBe(200);
    expect((await agent.post("/api/v1/attendance/heartbeat")).status).toBe(200);

    expect(await Notification.countDocuments({ userId: user._id, type: "shift_open_reminder" })).toBe(1);
  });

  it("a fresh shift's heartbeat sends nothing", async () => {
    const user = await employee();
    await openShift(user, 1);
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    expect((await agent.post("/api/v1/attendance/heartbeat")).status).toBe(200);
    expect(await Notification.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe("GET/POST /attendance/open-shift-reminders — the cron backstop", () => {
  it("refuses without the machine credential", async () => {
    const response = await request(app).post("/api/v1/attendance/open-shift-reminders");

    expect(response.status).toBe(401);
  });

  it("reminds every overdue open shift once, skipping fresh, closed and already-reminded ones", async () => {
    const a = await employee("a@example.com");
    const b = await employee("b@example.com");
    const c = await employee("c@example.com");
    const overdue = await openShift(a, 14);
    await openShift(b, 2);
    const closed = await openShift(c, 20);
    closed.checkOut = { time: new Date() };
    await closed.save();

    const first = await request(app).post("/api/v1/attendance/open-shift-reminders").set("x-webhook-token", CLEANUP_TOKEN);
    const second = await request(app).get(`/api/v1/attendance/open-shift-reminders?token=${CLEANUP_TOKEN}`);

    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ scanned: 1, sent: 1 });
    expect(second.body.data).toEqual({ scanned: 1, sent: 0 });
    expect(await ShiftReminder.countDocuments()).toBe(1);
    expect(String((await ShiftReminder.findOne())?.attendanceId)).toBe(String(overdue._id));
  });
});

describe("GET /location/config", () => {
  it("carries the two forgotten-check-out figures for the app", async () => {
    await employee();
    const agent = await loginAsAgent(app, "emp@example.com", "password123");

    const response = await agent.get("/api/v1/location/config");

    expect(response.body.data).toMatchObject({ shiftReminderAfterHours: 10, trackingStopAfterHours: 12 });
  });
});
