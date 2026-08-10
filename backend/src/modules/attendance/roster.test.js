import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Attendance from "./attendance.model.js";
import Leave from "../leave/leave.model.js";
import User from "../user/user.model.js";

/**
 * Today's roster — manual marking for people who cannot check in (§7.4g,
 * 2026-08-09).
 *
 * NEW MODULE, no prior version: the roster endpoints (`/roster-status`), the
 * `designation` field and the leave→attendance write did not exist before this
 * task, so the tests that target them could not have been "failing against the
 * old code" in any meaningful sense — there was nothing to fail against. The
 * ones that CAN discriminate are called out where they appear: `present` being
 * markable, and `on_leave` still being refused.
 */

let app;
let adminAgent;
let admin;
let employee;

const TODAY = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Attendance.deleteMany({}), Leave.deleteMany({})]);

  admin = await createUserDirectly({
    name: "Admin",
    email: "admin@roster.local",
    password: "AdminPass123!",
    role: "admin",
  });
  employee = await createUserDirectly({
    name: "Ellie Employee",
    email: "ellie@roster.local",
    password: "Password123",
    role: "employee",
  });

  adminAgent = await loginAsAgent(app, "admin@roster.local", "AdminPass123!");
});

function markStatus(body) {
  return adminAgent.post("/api/v1/attendance/mark-status").send(body);
}

const todayKey = () => new Date().toISOString().slice(0, 10);

describe("marking present — the widened MARKABLE_STATUSES", () => {
  it("ACCEPTS present, for someone who worked but could not check in", async () => {
    // The discriminating test: `present` was rejected before this task.
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "present",
    reason: "Phone battery died on site",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("present");
  });

  it("still ACCEPTS half_day and absent", async () => {
    const half = await markStatus({ employeeId: String(employee._id), date: "2026-06-10", status: "half_day", reason: "No internet at site" });
    expect(half.status).toBe(201);

    const absent = await markStatus({ employeeId: String(employee._id), date: "2026-06-11", status: "absent", reason: "No internet at site" });
    expect(absent.status).toBe(201);
  });

  it("still REFUSES on_leave — the Leave module owns it", async () => {
    // Deliberately NOT widened: hand-setting this would create a leave state
    // with no leave record behind it.
    // A reason IS supplied, so the rejection can only be about the status —
    // otherwise this would pass for the wrong reason once §7.4h made the
    // reason required.
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "on_leave",
      reason: "Manager said they were on leave",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/status must be one of/i);
    expect(response.body.message).not.toMatch(/on_leave/);
  });
});

describe("a manual mark carries attribution and NO device evidence", () => {
  it("sets isManuallyAdjusted and adjustedBy", async () => {
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "present",
    reason: "Phone battery died on site",
    });

    expect(response.body.data.isManuallyAdjusted).toBe(true);
    expect(response.body.data.adjustedBy).toBe(String(admin._id));
  });

  it("writes NO photo and NO coordinates — the admin's camera and GPS locate the ADMIN", async () => {
    await markStatus({ employeeId: String(employee._id), date: todayKey(), status: "present", reason: "No internet at site" });

    const record = await Attendance.findOne({ employeeId: employee._id }).select(
      "+checkIn.photoPublicId +checkOut.photoPublicId"
    );

    expect(record.checkIn.time).toBeNull();
    // A mongoose nested path materialises as an empty object rather than
    // undefined — what matters is that no lat/lng and no photo were stored.
    expect(record.checkIn.coords?.lat).toBeUndefined();
    expect(record.checkIn.coords?.lng).toBeUndefined();
    expect(record.checkIn.photoUrl ?? null).toBeNull();
    expect(record.checkOut.time).toBeNull();
    expect(record.workingHours).toBeNull();
  });
});

describe("a real check-in can never be overwritten from the roster", () => {
  async function seedRealCheckIn() {
    return Attendance.create({
      employeeId: employee._id,
      date: TODAY(),
      status: "present",
      checkIn: { time: new Date(), coords: { lat: 28.61, lng: 77.2 }, photoUrl: "https://fake/in.jpg" },
    });
  }

  it("REFUSES a roster correction on a record with a real check-in", async () => {
    const record = await seedRealCheckIn();

    const response = await adminAgent
      .patch(`/api/v1/attendance/${record._id}/roster-status`)
      .send({ status: "absent", reason: "No internet at site" });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/real check-in/i);

    const unchanged = await Attendance.findById(record._id);
    expect(unchanged.status).toBe("present");
    expect(unchanged.checkIn.time).not.toBeNull();
    expect(unchanged.checkIn.photoUrl).toBe("https://fake/in.jpg");
  });

  it("the guard is in the SERVICE, so it holds regardless of what the UI sends", async () => {
    const record = await seedRealCheckIn();

    // Every markable status, not just the one the UI happens to offer.
    for (const status of ["absent", "half_day", "present"]) {
      // eslint-disable-next-line no-await-in-loop
      const response = await adminAgent
        .patch(`/api/v1/attendance/${record._id}/roster-status`)
        .send({ status, reason: "Correcting an earlier mistake" });

      expect(response.status).toBe(409);
    }

    const unchanged = await Attendance.findById(record._id);
    expect(unchanged.checkIn.photoUrl).toBe("https://fake/in.jpg");
  });

  it("ALLOWS correcting a previous MANUAL mark, Half Day to Full Day", async () => {
    const created = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "half_day",
    reason: "Phone battery died on site",
    });

    const response = await adminAgent
      .patch(`/api/v1/attendance/${created.body.data._id}/roster-status`)
      .send({ status: "present", reason: "No internet at site" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("present");
    expect(response.body.data.isManuallyAdjusted).toBe(true);
  });

  it("refuses on_leave through the correction path too", async () => {
    const created = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "half_day",
    reason: "Phone battery died on site",
    });

    const response = await adminAgent
      .patch(`/api/v1/attendance/${created.body.data._id}/roster-status`)
      .send({ status: "on_leave", reason: "Correcting" });

    expect(response.status).toBe(400);
  });
});

describe("approving leave writes the attendance record", () => {
  async function applyLeave({ isHalfDay = false, date = todayKey() } = {}) {
    const employeeAgent = await loginAsAgent(app, "ellie@roster.local", "Password123");

    const response = await employeeAgent.post("/api/v1/leave/request").send({
      startDate: date,
      endDate: date,
      type: "unpaid",
      reason: "Family commitment",
      isHalfDay,
    });

    return response.body.data._id;
  }

  it("FULL-day leave creates an on_leave record", async () => {
    const leaveId = await applyLeave({ isHalfDay: false });

    await adminAgent.patch(`/api/v1/leave/${leaveId}/approve`).send({}).expect(200);

    const record = await Attendance.findOne({ employeeId: employee._id });
    expect(record).toBeTruthy();
    expect(record.status).toBe("on_leave");
    // on_leave reaches the database ONLY through this path.
    expect(record.isManuallyAdjusted).toBe(true);
    expect(record.checkIn.time).toBeNull();
  });

  it("HALF-day leave creates a half_day record", async () => {
    const leaveId = await applyLeave({ isHalfDay: true });

    await adminAgent.patch(`/api/v1/leave/${leaveId}/approve`).send({}).expect(200);

    const record = await Attendance.findOne({ employeeId: employee._id });
    expect(record.status).toBe("half_day");
  });

  it("CONFLICT: leaves a real check-in completely untouched and reports it", async () => {
    const realRecord = await Attendance.create({
      employeeId: employee._id,
      date: TODAY(),
      status: "present",
      checkIn: { time: new Date(), coords: { lat: 1, lng: 2 }, photoUrl: "https://fake/in.jpg" },
    });

    const leaveId = await applyLeave();
    const response = await adminAgent.patch(`/api/v1/leave/${leaveId}/approve`).send({});

    // The approval still succeeds — it is a LEAVE decision, and blocking it
    // would strand the employee over a conflict they cannot resolve.
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");

    // ...and the conflict is surfaced rather than silently swallowed.
    expect(response.body.data.attendanceConflicts).toHaveLength(1);
    expect(response.body.data.attendanceConflicts[0].hasRealCheckIn).toBe(true);

    const untouched = await Attendance.findById(realRecord._id);
    expect(untouched.status).toBe("present");
    expect(untouched.checkIn.photoUrl).toBe("https://fake/in.jpg");
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(1);
  });

  it("reports a conflict for a previous MANUAL mark too, without overwriting it", async () => {
    await markStatus({ employeeId: String(employee._id), date: todayKey(), status: "absent", reason: "No internet at site" });

    const leaveId = await applyLeave();
    const response = await adminAgent.patch(`/api/v1/leave/${leaveId}/approve`).send({});

    expect(response.body.data.attendanceConflicts).toHaveLength(1);
    expect(response.body.data.attendanceConflicts[0].hasRealCheckIn).toBe(false);

    const record = await Attendance.findOne({ employeeId: employee._id });
    expect(record.status).toBe("absent");
  });
});

describe("designation is admin-only", () => {
  it("an admin can set it", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${employee._id}`)
      .send({ designation: "Field Technician" });

    expect(response.status).toBe(200);
    expect(response.body.data.designation).toBe("Field Technician");
  });

  it("a user CANNOT set their own — it is an HR attribute, not self-service", async () => {
    const employeeAgent = await loginAsAgent(app, "ellie@roster.local", "Password123");

    const response = await employeeAgent
      .patch(`/api/v1/users/${employee._id}`)
      .send({ designation: "Chief Executive Officer" });

    expect(response.status).toBe(403);

    const unchanged = await User.findById(employee._id);
    expect(unchanged.designation).toBe("");
  });
});

/**
 * A reason on every manual mark (§7.4h, 2026-08-09).
 *
 * NEW field, no prior version — but the REJECTIONS below do discriminate: the
 * same requests succeeded (201/200) before this, so every "no reason" case
 * here fails against the pre-change code.
 */
describe("a manual mark requires a reason", () => {
  it("REJECTS a mark with no reason at all", async () => {
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "present",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/reason is required/i);
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(0);
  });

  it("REJECTS a whitespace-only reason — server-side, not just in the UI", async () => {
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "present",
      reason: "   ",
    });

    expect(response.status).toBe(400);
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(0);
  });

  it("STORES and RETURNS the reason", async () => {
    const response = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "present",
      reason: "No internet at the site all morning",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.adjustmentReason).toBe("No internet at the site all morning");

    const stored = await Attendance.findById(response.body.data._id);
    expect(stored.adjustmentReason).toBe("No internet at the site all morning");
    expect(stored.adjustmentHistory).toHaveLength(1);
    expect(stored.adjustmentHistory[0].status).toBe("present");
  });

  it("REJECTS a correction with no reason of its own", async () => {
    const created = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "half_day",
      reason: "Left early, phone dead",
    });

    const response = await adminAgent
      .patch(`/api/v1/attendance/${created.body.data._id}/roster-status`)
      .send({ status: "present" });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/reason is required/i);

    const unchanged = await Attendance.findById(created.body.data._id);
    expect(unchanged.status).toBe("half_day");
  });

  it("a correction captures its OWN reason and KEEPS the previous claim", async () => {
    // Changing Half Day to Full Day asserts something different about the day.
    // Both claims are kept: that someone first said half and then said full IS
    // the audit trail.
    const created = await markStatus({
      employeeId: String(employee._id),
      date: todayKey(),
      status: "half_day",
      reason: "Left early, phone dead",
    });

    await adminAgent
      .patch(`/api/v1/attendance/${created.body.data._id}/roster-status`)
      .send({ status: "present", reason: "Timesheet shows they worked the full day" })
      .expect(200);

    const stored = await Attendance.findById(created.body.data._id);
    expect(stored.status).toBe("present");
    expect(stored.adjustmentReason).toBe("Timesheet shows they worked the full day");
    expect(stored.adjustmentHistory).toHaveLength(2);
    expect(stored.adjustmentHistory[0].reason).toBe("Left early, phone dead");
    expect(stored.adjustmentHistory[1].reason).toBe("Timesheet shows they worked the full day");
  });
});
