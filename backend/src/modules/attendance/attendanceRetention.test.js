import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Attendance from "./attendance.model.js";
import AttendanceRetentionLog from "./attendanceRetentionLog.model.js";
import Payroll from "../payroll/payroll.model.js";
import { runAttendanceRetention } from "./attendance.service.js";
import { deleteCloudinaryAsset } from "../../services/cloudinary.service.js";

vi.mock("../../services/cloudinary.service.js", () => ({
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "https://fake/x.jpg", publicId: "fake-id" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));
vi.mock("../../services/googleMaps.service.js", () => ({
  getDistanceKm: vi.fn(async () => 5),
}));

const CLEANUP_TOKEN = "test-cleanup-secret";
// Set BEFORE the module graph is imported below — `config/env.js` reads
// process.env once at import time, so assigning this inside beforeAll would
// be too late and every request would 503 ("not configured").
process.env.ATTENDANCE_CLEANUP_TOKEN = CLEANUP_TOKEN;

let app;
let employee;
let adminAgent;

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * End of the seeded shift. The model rejects a check-out at or before its
 * check-in (2026-08-08), and these fixtures previously reused the same instant
 * for both — a shape no real record can have, since check-in and check-out are
 * two separate `now` stamps. Nothing in this file asserts on the timestamps;
 * they only ever needed to be a plausible shift.
 */
function shiftEnd(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

async function seedRecord(date, overrides = {}) {
  return Attendance.create({
    employeeId: employee._id,
    date,
    status: "present",
    checkIn: { time: date, photoUrl: "https://fake/in.jpg", photoPublicId: "public-in" },
    checkOut: { time: shiftEnd(date), photoUrl: "https://fake/out.jpg", photoPublicId: "public-out" },
    ...overrides,
  });
}

/** Payroll must exist for a record's month before it can be deleted. */
async function seedPayrollFor(date) {
  return Payroll.create({
    employeeId: employee._id,
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    daysInMonth: 30,
    presentDays: 20,
    paidLeaveDays: 0,
    unpaidDeductionDays: 0,
    workingHoursTotal: 160,
    grossAmount: 1000,
    netAmount: 1000,
    generatedAt: new Date(),
    paidOn: new Date(),
  });
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  await createUserDirectly({
    name: "Admin",
    email: "admin@retention.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@retention.local", "AdminPass123!");

  employee = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Retention Employee",
      email: "employee@retention.local",
      password: "Password123",
      role: "employee",
    })
  ).body.data;
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  vi.clearAllMocks();
  deleteCloudinaryAsset.mockResolvedValue({ result: "ok" });
  await Attendance.deleteMany({});
  await AttendanceRetentionLog.deleteMany({});
  await Payroll.deleteMany({});
});

describe("Attendance retention — what gets deleted", () => {
  it("deletes a record older than the threshold, along with BOTH its Cloudinary photos", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(0);
    expect(deleteCloudinaryAsset).toHaveBeenCalledWith("public-in");
    expect(deleteCloudinaryAsset).toHaveBeenCalledWith("public-out");
  });

  it("leaves a record INSIDE the threshold completely untouched", async () => {
    const recent = daysAgo(10);
    await seedRecord(recent);
    await seedPayrollFor(recent);

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(0);
    expect(summary.examinedCount).toBe(0);
    expect(await Attendance.countDocuments()).toBe(1);
    expect(deleteCloudinaryAsset).not.toHaveBeenCalled();
  });

  it("handles a record with no photoPublicId — nothing to delete, no crash", async () => {
    const old = daysAgo(60);
    await seedRecord(old, {
      checkIn: { time: old, photoUrl: null, photoPublicId: null },
      checkOut: { time: shiftEnd(old), photoUrl: null, photoPublicId: null },
    });
    await seedPayrollFor(old);

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(1);
    expect(deleteCloudinaryAsset).not.toHaveBeenCalled();
  });
});

describe("Attendance retention — payroll safety guard", () => {
  it("does NOT delete attendance for a month with no Payroll yet", async () => {
    await seedRecord(daysAgo(60));

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(0);
    expect(summary.skippedNoPayrollCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(1);
    // Nothing was touched in Cloudinary either — the guard runs first.
    expect(deleteCloudinaryAsset).not.toHaveBeenCalled();
  });

  it("deletes only the months that DO have payroll, skipping the ones that don't", async () => {
    const withPayroll = daysAgo(60);
    const withoutPayroll = daysAgo(400);
    await seedRecord(withPayroll);
    await seedRecord(withoutPayroll);
    await seedPayrollFor(withPayroll);

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(1);
    expect(summary.skippedNoPayrollCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(1);
  });
});

describe("Attendance retention — Cloudinary failure must not orphan assets", () => {
  it("LEAVES the DB record in place when photo deletion fails, so the next run can retry", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);
    deleteCloudinaryAsset.mockRejectedValue(new Error("Cloudinary unavailable"));

    const summary = await runAttendanceRetention();

    expect(summary.failedCount).toBe(1);
    expect(summary.deletedCount).toBe(0);
    // The record survives — deleting it first would strand the asset with no
    // stored publicId to ever find it again.
    expect(await Attendance.countDocuments()).toBe(1);
  });

  it("a later successful run cleans up what the failed run left behind", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);

    deleteCloudinaryAsset.mockRejectedValue(new Error("down"));
    await runAttendanceRetention();
    expect(await Attendance.countDocuments()).toBe(1);

    deleteCloudinaryAsset.mockResolvedValue({ result: "ok" });
    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("one record's failure does not stop the rest of the batch", async () => {
    const old = daysAgo(60);
    await seedRecord(old, { checkIn: { time: old, photoPublicId: "bad" }, checkOut: { time: shiftEnd(old) } });
    await seedRecord(old, { checkIn: { time: old, photoPublicId: "good" }, checkOut: { time: shiftEnd(old) } });
    await seedPayrollFor(old);

    deleteCloudinaryAsset.mockImplementation(async (publicId) => {
      if (publicId === "bad") throw new Error("nope");
      return { result: "ok" };
    });

    const summary = await runAttendanceRetention();

    expect(summary.deletedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(1);
  });
});

describe("Attendance retention — batching and idempotency", () => {
  it("stops at the batch limit and leaves the rest for the next invocation", async () => {
    const old = daysAgo(60);
    for (let index = 0; index < 5; index += 1) {
      await seedRecord(old);
    }
    await seedPayrollFor(old);

    const summary = await runAttendanceRetention({ batchLimit: 2 });

    expect(summary.examinedCount).toBe(2);
    expect(summary.deletedCount).toBe(2);
    expect(await Attendance.countDocuments()).toBe(3);
  });

  it("is idempotent — repeated runs converge and a run over nothing is a clean no-op", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);

    await runAttendanceRetention();
    const second = await runAttendanceRetention();

    expect(second.deletedCount).toBe(0);
    expect(second.examinedCount).toBe(0);
    expect(second.failedCount).toBe(0);
    expect(await Attendance.countDocuments()).toBe(0);
  });
});

describe("Attendance retention — audit log", () => {
  it("writes one accurate summary per run", async () => {
    const deletable = daysAgo(60);
    const guarded = daysAgo(400);
    await seedRecord(deletable);
    await seedRecord(guarded);
    await seedPayrollFor(deletable);

    await runAttendanceRetention({ batchLimit: 50 });

    const logs = await AttendanceRetentionLog.find();
    expect(logs).toHaveLength(1);
    expect(logs[0].deletedCount).toBe(1);
    expect(logs[0].skippedNoPayrollCount).toBe(1);
    expect(logs[0].failedCount).toBe(0);
    expect(logs[0].examinedCount).toBe(2);
    expect(logs[0].retentionDays).toBe(45);
    expect(logs[0].batchLimit).toBe(50);
    expect(logs[0].deletedFrom).toBeTruthy();
    expect(logs[0].deletedTo).toBeTruthy();
  });

  it("writes a summary even when a run deletes nothing, so every run is accounted for", async () => {
    await runAttendanceRetention();

    const logs = await AttendanceRetentionLog.find();
    expect(logs).toHaveLength(1);
    expect(logs[0].deletedCount).toBe(0);
    expect(logs[0].deletedFrom).toBeNull();
  });

  it("records no personal data — only counts, the window and the cutoff", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);

    await runAttendanceRetention();

    const entry = (await AttendanceRetentionLog.findOne()).toObject();
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(String(employee._id));
    expect(serialized).not.toContain("public-in");
    expect(serialized).not.toContain("fake");
  });
});

describe("POST /attendance/cleanup — machine-only access", () => {
  it("rejects a request with no token", async () => {
    const response = await adminAgent.post("/api/v1/attendance/cleanup").send({});

    expect(response.status).toBe(401);
  });

  it("rejects a request with the WRONG token, even from a logged-in admin", async () => {
    const response = await adminAgent
      .post("/api/v1/attendance/cleanup")
      .set("x-webhook-token", "not-the-secret")
      .send({});

    expect(response.status).toBe(401);
  });

  it("accepts the correct shared secret and runs the job", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedPayrollFor(old);

    const response = await adminAgent
      .post("/api/v1/attendance/cleanup")
      .set("x-webhook-token", CLEANUP_TOKEN)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("also accepts GET — Vercel Cron only ever issues GET and cannot set custom headers", async () => {
    const response = await adminAgent.get(`/api/v1/attendance/cleanup?token=${CLEANUP_TOKEN}`);

    expect(response.status).toBe(200);
  });

  it("honours an explicit batchLimit from the caller", async () => {
    const old = daysAgo(60);
    await seedRecord(old);
    await seedRecord(old);
    await seedPayrollFor(old);

    const response = await adminAgent
      .post("/api/v1/attendance/cleanup")
      .set("x-webhook-token", CLEANUP_TOKEN)
      .send({ batchLimit: 1 });

    expect(response.body.data.examinedCount).toBe(1);
    expect(await Attendance.countDocuments()).toBe(1);
  });
});
