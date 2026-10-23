import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Live status, part 2 (2026-10-23): the day's timeline for one person —
// "9:40 checked in → 10:05 moving → 10:50 at Sharma site → 12:10 location
// off" — and the push to the MANAGER when someone is Location off or
// Disconnected too long during a shift.

let app;
let env;
let runLiveAlerts;
let User, Attendance, LocationPing, Notification, Customer, Service, Visit;
let admin, manager, emp, other;
let managerAgent, empAgent, otherAgent;

const MIN = 60000;
const DAY = "2026-10-23";
const at = (hhmm) => new Date(`${DAY}T${hhmm}:00+05:30`);
const SITE = { lat: 28.495, lng: 77.089 };

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ env } = await import("../../config/env.js"));
  ({ runLiveAlerts } = await import("./liveStatus.service.js"));
  ({ default: User } = await import("../user/user.model.js"));
  ({ default: Attendance } = await import("../attendance/attendance.model.js"));
  ({ default: LocationPing } = await import("./location.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Service } = await import("../service/service.model.js"));
  ({ default: Visit } = await import("../visit/visit.model.js"));

  admin = await createUserDirectly({ name: "Arjun Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  manager = await createUserDirectly({ name: "Sandeep Manager", email: "mgr@test.local", password: "Password123", role: "manager", permissions: { location: { view_team: true } } });
  emp = await createUserDirectly({ name: "Deepak Yadav", email: "emp@test.local", password: "Password123", role: "employee", managerId: manager._id, permissions: { location: { view: true } } });
  other = await createUserDirectly({ name: "Other Person", email: "other@test.local", password: "Password123", role: "employee", permissions: { location: { view: true } } });
  managerAgent = await loginAsAgent(app, "mgr@test.local", "Password123");
  empAgent = await loginAsAgent(app, "emp@test.local", "Password123");
  otherAgent = await loginAsAgent(app, "other@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  for (const name of ["attendances", "locationpings", "notifications", "employeelivestatuses", "locationstatusevents", "services", "visits", "customers"]) {
    await mongoose.connection.db.collection(name).deleteMany({}).catch(() => {});
  }
});

async function dayOfDeepak() {
  const attendance = await Attendance.create({
    employeeId: emp._id,
    date: at("09:40"),
    checkIn: { time: at("09:40"), coords: { lat: 28.40, lng: 77.0 } },
    status: "present",
  });
  const customer = await Customer.create({ companyName: "Sharma Residence", ownerId: admin._id, projectManagerId: admin._id });
  const service = await Service.create({ title: "Site visit — Sharma Residence", assignedToId: emp._id, createdById: admin._id, dueDate: at("00:00"), status: "todo" });
  await Visit.create({ serviceId: service._id, customerId: customer._id, site: SITE, radiusMeters: 200, createdById: admin._id });
  // A fix every 10–15 minutes, each received when captured (no late uploads).
  const pings = [
    ["09:42", 28.40, 77.0, 0],
    ["09:55", 28.40, 77.0, 0],
    ["10:05", 28.43, 77.03, 9],
    ["10:20", 28.47, 77.06, 10],
    ["10:35", 28.49, 77.08, 8],
    ["10:50", 28.4951, 77.0891, 0],
    ["11:05", 28.4950, 77.0890, 0],
    ["11:20", 28.4952, 77.0889, 0],
    ["11:35", 28.4950, 77.0890, 0],
    ["11:50", 28.4951, 77.0890, 0],
    ["12:00", 28.4952, 77.0889, 0],
  ];
  await mongoose.connection.db.collection("locationpings").insertMany(
    pings.map(([hhmm, lat, lng, speed], i) => ({ employeeId: emp._id, attendanceId: attendance._id, coords: { lat, lng, accuracy: 6 }, capturedAt: at(hhmm), createdAt: at(hhmm), speed, clientPingId: `p${i}` }))
  );
  await mongoose.connection.db.collection("locationstatusevents").insertOne({ employeeId: emp._id, type: "location_off", at: at("12:10"), reason: "gps_off", createdAt: new Date() });
  return attendance;
}

describe("GET /location/timeline — the day for one person", () => {
  it("reads like the brief: checked in → moving → at Sharma Residence → location off", async () => {
    await dayOfDeepak();
    const timeline = (await managerAgent.get(`/api/v1/location/timeline?employeeId=${emp._id}&date=${DAY}`).expect(200)).body.data;
    const steps = timeline.entries.map((entry) => [new Date(entry.at).toISOString(), entry.status, entry.label]);
    expect(steps).toEqual([
      [at("09:40").toISOString(), "checked_in", "Checked in"],
      [at("10:05").toISOString(), "moving", "Moving"],
      [at("10:50").toISOString(), "at_site", "At Sharma Residence"],
      [at("12:10").toISOString(), "location_off", "Location off"],
    ]);
  });

  it("marks a time when fixes were uploaded late as Offline, and a gap with no fixes as No signal", async () => {
    const attendance = await Attendance.create({ employeeId: emp._id, date: at("09:00"), checkIn: { time: at("09:00"), coords: { lat: 28.4, lng: 77.0 } }, status: "present" });
    await LocationPing.insertMany([
      { employeeId: emp._id, attendanceId: attendance._id, coords: { lat: 28.4, lng: 77.0 }, capturedAt: at("09:02"), clientPingId: "a" },
      // Captured 09:30, received 09:50 — the phone was offline and caught up.
      { employeeId: emp._id, attendanceId: attendance._id, coords: { lat: 28.4, lng: 77.0 }, capturedAt: at("09:30"), clientPingId: "b" },
      // Nothing captured between 09:30 and 11:00 — no signal at all.
      { employeeId: emp._id, attendanceId: attendance._id, coords: { lat: 28.4, lng: 77.0 }, capturedAt: at("11:00"), clientPingId: "c" },
    ]);
    await LocationPing.updateOne({ clientPingId: "a" }, { $set: { createdAt: at("09:02") } }, { timestamps: false });
    await LocationPing.updateOne({ clientPingId: "b" }, { $set: { createdAt: at("09:50") } }, { timestamps: false });
    await LocationPing.updateOne({ clientPingId: "c" }, { $set: { createdAt: at("11:00") } }, { timestamps: false });

    const timeline = (await empAgent.get(`/api/v1/location/timeline?date=${DAY}`).expect(200)).body.data;
    const statuses = timeline.entries.map((entry) => entry.status);
    expect(statuses).toContain("offline");
    expect(statuses).toContain("disconnected");
    expect(timeline.entries.find((e) => e.status === "offline").label).toMatch(/uploaded later/i);
  });

  it("a shift still open from the day before shows on today's timeline", async () => {
    const attendance = await Attendance.create({
      employeeId: emp._id,
      date: new Date("2026-10-22T13:00:00Z"),
      checkIn: { time: new Date("2026-10-22T13:00:00Z"), coords: { lat: 28.4, lng: 77.0 } },
      status: "present",
    });
    await mongoose.connection.db.collection("locationpings").insertMany([
      { employeeId: emp._id, attendanceId: attendance._id, coords: { lat: 28.4, lng: 77.0 }, capturedAt: at("09:00"), createdAt: at("09:00"), speed: 9, clientPingId: "y1" },
    ]);
    const timeline = (await empAgent.get(`/api/v1/location/timeline?date=${DAY}`).expect(200)).body.data;
    expect(timeline.entries[0]).toMatchObject({ status: "checked_in", label: "On shift since yesterday" });
    expect(timeline.entries.map((e) => e.status)).toContain("moving");
  });

  it("follows the live map's visibility — someone else's day is refused", async () => {
    await dayOfDeepak();
    await otherAgent.get(`/api/v1/location/timeline?employeeId=${emp._id}&date=${DAY}`).expect(403);
  });
});

describe("manager alerts", () => {
  it("tells the manager once when someone is Location off for LIVE_ALERT_AFTER_MINUTES during a shift", async () => {
    const now = new Date();
    await Attendance.create({ employeeId: emp._id, date: now, checkIn: { time: new Date(now - 60 * MIN), coords: { lat: 28.4, lng: 77.0 } }, status: "present" });
    await empAgent.post("/api/v1/location/status-events").send({ events: [{ type: "location_off", at: new Date(now - 20 * MIN).toISOString(), reason: "gps_off" }] }).expect(200);

    await runLiveAlerts(now);
    await runLiveAlerts(new Date(now.getTime() + 5 * MIN));
    const alerts = await Notification.find({ type: "staff_location_alert" }).lean();
    expect(alerts).toHaveLength(1);
    expect(String(alerts[0].userId)).toBe(String(manager._id));
    expect(alerts[0].message).toMatch(/Deepak Yadav.*location.*off/i);
  });

  it("not before the threshold, and Disconnected counts too", async () => {
    const now = new Date();
    await Attendance.create({ employeeId: emp._id, date: now, checkIn: { time: new Date(now - 40 * MIN), coords: { lat: 28.4, lng: 77.0 } }, status: "present" });
    const original = env.liveAlertAfterMinutes;
    env.liveAlertAfterMinutes = 60;
    await runLiveAlerts(now);
    expect(await Notification.countDocuments({ type: "staff_location_alert" })).toBe(0);
    env.liveAlertAfterMinutes = original;

    // Checked in 40 min ago, nothing since: disconnected since check-in (30 min threshold), 10 min past it.
    env.liveAlertAfterMinutes = 5;
    await runLiveAlerts(now);
    const alert = await Notification.findOne({ type: "staff_location_alert" }).lean();
    expect(alert.message).toMatch(/Deepak Yadav.*no signal/i);
    env.liveAlertAfterMinutes = original;
  });
});
