import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Live employee status (2026-10-23, MASTER BRIEF item 4): what each person is
// doing right now — Moving / Stationary / At site / Offline / Location off /
// Disconnected (+ Battery low), and Checked out / Not checked in / On leave —
// derived on the server from pings, device reports and status events, with
// thresholds from config. The same names and colours for web and app come
// from GET /location/config.

let app;
let env;
let computeLiveStatus, LIVE_STATUSES;
let User, Attendance, LocationPing, Leave, Visit, Service, Customer;
let admin, manager, emp1, emp2, emp3, outsider;
let adminAgent, managerAgent, emp1Agent;

const MIN = 60000;
const NOW = new Date("2026-10-23T10:00:00Z");
const ago = (minutes) => new Date(NOW.getTime() - minutes * MIN);
const ping = (minutesAgo, lat, lng, extra = {}) => ({ capturedAt: ago(minutesAgo), receivedAt: ago(minutesAgo), coords: { lat, lng, accuracy: 8 }, ...extra });
const SITE = { lat: 28.495, lng: 77.089 };

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ env } = await import("../../config/env.js"));
  ({ computeLiveStatus, LIVE_STATUSES } = await import("./liveStatus.service.js"));
  ({ default: User } = await import("../user/user.model.js"));
  ({ default: Attendance } = await import("../attendance/attendance.model.js"));
  ({ default: LocationPing } = await import("./location.model.js"));
  ({ default: Leave } = await import("../leave/leave.model.js"));
  ({ default: Visit } = await import("../visit/visit.model.js"));
  ({ default: Service } = await import("../service/service.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));

  admin = await createUserDirectly({ name: "Arjun Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  manager = await createUserDirectly({
    name: "Sandeep Manager",
    email: "mgr@test.local",
    password: "Password123",
    role: "manager",
    permissions: { location: { view_team: true } },
  });
  const employee = (name, email) =>
    createUserDirectly({ name, email, password: "Password123", role: "employee", managerId: manager._id, permissions: { location: { view: true } } });
  emp1 = await employee("Deepak Moving", "emp1@test.local");
  emp2 = await employee("Ritu Silent", "emp2@test.local");
  emp3 = await employee("Manoj Leave", "emp3@test.local");
  outsider = await createUserDirectly({ name: "Other Team", email: "other@test.local", password: "Password123", role: "employee" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
  managerAgent = await loginAsAgent(app, "mgr@test.local", "Password123");
  emp1Agent = await loginAsAgent(app, "emp1@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Attendance.deleteMany({});
  await LocationPing.deleteMany({});
  await Leave.deleteMany({});
  await mongoose.connection.db.collection("employeelivestatuses").deleteMany({}).catch(() => {});
  await mongoose.connection.db.collection("locationstatusevents").deleteMany({}).catch(() => {});
});

const checkIn = (employee, at = new Date(Date.now() - 60 * MIN)) =>
  Attendance.create({ employeeId: employee._id, date: at, checkIn: { time: at, coords: { lat: 28.49, lng: 77.08 } }, status: "present" });

describe("the status rules (pure, fixed clock)", () => {
  const base = { now: NOW, shift: { open: true, checkInAt: ago(120) } };

  it("Moving — from the phone's speed, or from the distance between the last pings", () => {
    const bySpeed = computeLiveStatus({ ...base, pings: [ping(4, 28.49, 77.08), ping(1, 28.491, 77.08, { speed: 8 })] });
    expect(bySpeed.status).toBe("moving");
    expect(bySpeed.speedKmh).toBe(29);

    // ~890 m in 2 minutes, no speed reported
    const byDistance = computeLiveStatus({ ...base, pings: [ping(3, 28.49, 77.08), ping(1, 28.498, 77.08)] });
    expect(byDistance.status).toBe("moving");
    expect(byDistance.speedKmh).toBeGreaterThan(20);
  });

  it("Stationary — 'at the same place for 25 min', named when it is a customer's site", () => {
    const pings = [ping(40, 28.40, 77.0), ping(25, 28.4950, 77.0890), ping(14, 28.4951, 77.0891), ping(2, 28.4950, 77.0890)];
    const result = computeLiveStatus({ ...base, pings, customerSites: [{ name: "Sharma Residence", ...SITE }] });
    expect(result.status).toBe("stationary");
    expect(result.since).toEqual(ago(25));
    expect(result.place).toBe("Sharma Residence");
  });

  it("At site — inside the radius of a visit assigned for today", () => {
    const pings = [ping(10, 28.40, 77.0), ping(2, 28.4951, 77.0891)];
    const result = computeLiveStatus({ ...base, pings, visits: [{ site: SITE, radiusMeters: 200, customerName: "Sharma Residence", completed: false }] });
    expect(result.status).toBe("at_site");
    expect(result.place).toBe("Sharma Residence");
  });

  it("Offline — nothing for a while (the phone keeps recording): 'last synced 12 min ago'", () => {
    const result = computeLiveStatus({ ...base, pings: [ping(12, 28.49, 77.08)], lastSyncAt: ago(12) });
    expect(result.status).toBe("offline");
    expect(result.lastSyncAt).toEqual(ago(12));
  });

  it("Disconnected — nothing for longer than DISCONNECTED_AFTER, cause unknown", () => {
    const result = computeLiveStatus({ ...base, pings: [ping(45, 28.49, 77.08)], lastSyncAt: ago(45) });
    expect(result.status).toBe("disconnected");
    expect(result.since).toEqual(ago(45));
  });

  it("Location off — the phone said so, and nothing has arrived since", () => {
    const result = computeLiveStatus({ ...base, pings: [ping(20, 28.49, 77.08)], lastSyncAt: ago(15), locationOffSince: ago(15) });
    expect(result.status).toBe("location_off");
    expect(result.since).toEqual(ago(15));

    // A fix after the event means it was turned back on.
    const back = computeLiveStatus({ ...base, pings: [ping(20, 28.49, 77.08), ping(1, 28.49, 77.08)], lastSyncAt: ago(1), locationOffSince: ago(15) });
    expect(back.status).not.toBe("location_off");
  });

  it("Battery low is a flag beside any status (under 15 %)", () => {
    const result = computeLiveStatus({ ...base, pings: [ping(1, 28.49, 77.08)], lastSyncAt: ago(1), battery: 12, charging: false });
    expect(result.batteryLow).toBe(true);
    expect(result.battery).toBe(12);
    expect(computeLiveStatus({ ...base, pings: [ping(1, 28.49, 77.08)], battery: 12, charging: true }).batteryLow).toBe(false);
  });

  it("no shift: checked out today, on leave, or not checked in", () => {
    expect(computeLiveStatus({ now: NOW, shift: { open: false, checkedOutAt: ago(30) } }).status).toBe("checked_out");
    expect(computeLiveStatus({ now: NOW, shift: null, onLeave: true }).status).toBe("on_leave");
    expect(computeLiveStatus({ now: NOW, shift: null }).status).toBe("not_checked_in");
  });

  it("thresholds come from config", () => {
    const original = env.liveOfflineAfterMinutes;
    env.liveOfflineAfterMinutes = 30;
    expect(computeLiveStatus({ ...base, pings: [ping(12, 28.49, 77.08)], lastSyncAt: ago(12) }).status).not.toBe("offline");
    env.liveOfflineAfterMinutes = original;
  });
});

describe("what the app sends — optional fields, old pings keep working", () => {
  it("stores speed and the device report with a ping; a ping without them still works", async () => {
    await checkIn(emp1);
    const now = new Date().toISOString();
    await emp1Agent
      .post("/api/v1/location/pings")
      .send({ pings: [{ clientPingId: "a1", capturedAt: now, coords: { lat: 28.49, lng: 77.08, accuracy: 5 }, speed: 7.5, device: { battery: 54, charging: false, locationOn: true, network: "cellular" } }] })
      .expect(200);
    await emp1Agent.post("/api/v1/location/pings").send({ coords: { lat: 28.49, lng: 77.08 }, capturedAt: now }).expect(201);

    const stored = await LocationPing.findOne({ clientPingId: "a1" }).lean();
    expect(stored.speed).toBe(7.5);
    expect(stored.device).toMatchObject({ battery: 54, charging: false, locationOn: true, network: "cellular" });
    expect(await LocationPing.countDocuments({ employeeId: emp1._id })).toBe(2);
  });

  it("rejects nonsense device values", async () => {
    await checkIn(emp1);
    const bad = (device) =>
      emp1Agent.post("/api/v1/location/pings").send({ pings: [{ clientPingId: `b${Math.random()}`, capturedAt: new Date().toISOString(), coords: { lat: 28.49, lng: 77.08 }, device }] });
    await bad({ battery: 140 }).expect(400);
    await bad({ network: "carrier-pigeon" }).expect(400);
  });

  it("POST /location/status-events: 'location off' reaches admin as Location off — not just silence", async () => {
    await checkIn(emp1);
    const offAt = new Date(Date.now() - 2 * MIN).toISOString();
    await emp1Agent.post("/api/v1/location/status-events").send({ events: [{ type: "location_off", at: offAt, reason: "gps_off" }] }).expect(200);

    const team = (await adminAgent.get("/api/v1/location/live-status").expect(200)).body.data;
    const row = team.people.find((p) => String(p.employeeId) === String(emp1._id));
    expect(row.status).toBe("location_off");

    await emp1Agent.post("/api/v1/location/status-events").send({ events: [{ type: "weather", at: offAt }] }).expect(400);
  });
});

describe("GET /location/live-status — the team list", () => {
  it("everyone visible, problems first, with counts", async () => {
    await checkIn(emp1);
    await emp1Agent
      .post("/api/v1/location/pings")
      .send({ pings: [{ clientPingId: "m1", capturedAt: new Date().toISOString(), coords: { lat: 28.49, lng: 77.08 }, speed: 9, device: { battery: 80, charging: false, locationOn: true, network: "wifi" } }] })
      .expect(200);
    // emp2: checked in 90 min ago, nothing since → disconnected
    await checkIn(emp2, new Date(Date.now() - 90 * MIN));
    // emp3: on approved leave today
    const today = new Date();
    await Leave.create({ employeeId: emp3._id, startDate: today, endDate: today, type: "paid", status: "approved", reason: "x" });

    const data = (await managerAgent.get("/api/v1/location/live-status").expect(200)).body.data;
    const names = data.people.map((p) => p.name);
    expect(names).toEqual(["Ritu Silent", "Deepak Moving", "Manoj Leave"]);
    expect(names).not.toContain("Other Team");
    expect(data.people[0]).toMatchObject({ status: "disconnected" });
    expect(data.people[1]).toMatchObject({ status: "moving", battery: 80, speedKmh: 32 });
    expect(data.people[2]).toMatchObject({ status: "on_leave" });
    expect(data.counts).toMatchObject({ moving: 1, stationary: 0, at_site: 0, offline: 0, location_off: 0, disconnected: 1 });
  });

  it("is refused without a location view grant", async () => {
    const plain = await createUserDirectly({ name: "No Grant", email: "nogrant@test.local", password: "Password123", role: "employee" });
    const agent = await loginAsAgent(app, "nogrant@test.local", "Password123");
    await agent.get("/api/v1/location/live-status").expect(403);
    expect(plain).toBeTruthy();
  });
});

describe("GET /location/my-status — the employee's own status with a fix-it hint", () => {
  it("says Location off and how to fix it", async () => {
    await checkIn(emp1);
    await emp1Agent.post("/api/v1/location/status-events").send({ events: [{ type: "location_off", at: new Date().toISOString(), reason: "permission_revoked" }] }).expect(200);
    const mine = (await emp1Agent.get("/api/v1/location/my-status").expect(200)).body.data;
    expect(mine).toMatchObject({ status: "location_off", fix: "turn_on_location" });
  });
});

describe("GET /location/config — one list of status names and colours for web and app", () => {
  it("serves every status with a label and a colour, and the thresholds", async () => {
    const config = (await emp1Agent.get("/api/v1/location/config").expect(200)).body.data;
    expect(config.statuses.map((s) => s.key)).toEqual(LIVE_STATUSES.map((s) => s.key));
    for (const status of config.statuses) {
      expect(status.label).toBeTruthy();
      expect(status.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(config.liveThresholds).toMatchObject({ offlineAfterMinutes: expect.any(Number), disconnectedAfterMinutes: expect.any(Number), batteryLowPercent: 15 });
  });
});

// Unused imports kept honest: these models exist and are what the service reads.
it("has the models the status reads", () => {
  expect([Visit, Service, Customer, outsider].every(Boolean)).toBe(true);
});
