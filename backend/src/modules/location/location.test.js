import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import LocationPing, { LOCATION_PING_TTL_SECONDS } from "./location.model.js";
import Attendance from "../attendance/attendance.model.js";

// Attendance check-in/check-out now require a photo server-side (§7.4) and
// the one real check-in/check-out call in this file (the end-to-end test
// below) needs to supply one — mocked the same way attendance.test.js does,
// so this file never makes a real Cloudinary network call either.
vi.mock("../../services/cloudinary.service.js", () => ({
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "https://fake.cloudinary.test/photo.jpg", publicId: "fake-public-id" })),
}));

// The same real check-out also now triggers travelLog.service.js's auto
// travel-log generation (§7.6), which calls this service — mocked too so
// this file never makes a real Google Maps API call either.
vi.mock("../../services/googleMaps.service.js", () => ({
  getDistanceKm: vi.fn(async () => 5),
}));

// Geofencing (added later, §6.5/§7.4) — wraps the REAL Haversine
// implementation in a vi.fn (via importOriginal) rather than replacing it
// with a fake constant, since the geofence tests below need genuine
// distance-based behavior (within/beyond the radius). This only exists so
// the "never blocks the ping" test can force a single call to throw via
// `mockImplementationOnce`, without touching every other test's real
// distance calculation.
vi.mock("../../services/geo.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, haversineDistanceMeters: vi.fn(actual.haversineDistanceMeters) };
});

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent, noPermAgent;
let manager1, sales1, sales2, sales3;

function buildPingPayload(overrides = {}) {
  return {
    coords: { lat: 12.9716, lng: 77.5946 },
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function createOpenAttendance(employeeId) {
  return Attendance.create({
    employeeId,
    date: new Date(),
    checkIn: { time: new Date(), coords: { lat: 12.9, lng: 77.6 } },
  });
}

async function createClosedAttendance(employeeId) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  return Attendance.create({
    employeeId,
    date: new Date(),
    checkIn: { time: oneHourAgo, coords: { lat: 12.9, lng: 77.6 } },
    checkOut: { time: new Date(), coords: { lat: 12.9, lng: 77.6 } },
  });
}

async function clearLocationData() {
  await LocationPing.deleteMany({});
  await Attendance.deleteMany({});
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  await createUserDirectly({
    name: "Admin",
    email: "admin@test.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  // Registered through the real /auth/register endpoint (not createUserDirectly)
  // and deliberately WITHOUT an explicit `permissions` field, so these fixtures
  // exercise the actual role-based location-permission defaults (§7.4b) instead
  // of bypassing that logic — manager1 should end up with location.view_team,
  // sales1/sales2/sales3 with location.view, purely from the role template's
  // defaults (user.service.js#createUser → permission.service.js).
  const managerResponse = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager One",
    email: "manager1@test.local",
    password: "Password123",
    role: "manager",
  });
  manager1 = managerResponse.body.data;
  managerAgent = await loginAsAgent(app, "manager1@test.local", "Password123");

  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1._id,
  });
  sales1 = sales1Response.body.data;
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  const sales2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales Two",
    email: "sales2@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1._id,
  });
  sales2 = sales2Response.body.data;
  sales2Agent = await loginAsAgent(app, "sales2@test.local", "Password123");

  // Deliberately NOT on manager1's team.
  const sales3Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales Three",
    email: "sales3@test.local",
    password: "Password123",
  role: "sales_associate",
  });
  sales3 = sales3Response.body.data;
  sales3Agent = await loginAsAgent(app, "sales3@test.local", "Password123");

  // Register normally (gets the employee role's template default,
  // location.view: true), then explicitly override to an empty grant via the
  // Permissions module (§7.12) — POST /auth/register no longer accepts a
  // manual `permissions` field now that a real admin-override endpoint
  // exists. Proves the "no permission at all" case is denied rather than
  // accidentally falling back to a default.
  const noPermResponse = await adminAgent.post("/api/v1/auth/register").send({
    name: "No Permission",
    email: "noperm@test.local",
    password: "Password123",
    role: "employee",
  });
  await adminAgent
    .patch(`/api/v1/users/${noPermResponse.body.data._id}/permissions`)
    .send({ permissions: { location: {} } });
  noPermAgent = await loginAsAgent(app, "noperm@test.local", "Password123");
});

afterEach(async () => {
  await clearLocationData();
});

afterAll(async () => {
  await stopTestDatabase();
});

// The scoping tests below already exercise these defaults indirectly (a
// manager without location.view_team would get 403 from authorizeAny, not a
// correctly-scoped result) — these assert the actual stored value directly,
// against the fixtures created via the real /auth/register endpoint above.
describe("Role-based permission defaults (createUser, §7.4b)", () => {
  it("grants a manager location.view_team by default", async () => {
    const response = await managerAgent.get("/api/v1/auth/me");

    expect(response.body.data.permissions.location).toEqual({ view_team: true });
  });

  it("grants a sales_associate location.view by default", async () => {
    const response = await sales1Agent.get("/api/v1/auth/me");

    expect(response.body.data.permissions.location).toEqual({ view: true });
  });

  it("respects an explicit permissions override instead of applying the default", async () => {
    const response = await noPermAgent.get("/api/v1/auth/me");

    expect(response.body.data.permissions.location).toEqual({});
  });
});

describe("POST /location/pings", () => {
  it("accepts a ping when the employee has an open attendance record", async () => {
    await createOpenAttendance(sales1._id);

    const response = await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("rejects a ping when the employee has never checked in", async () => {
    const response = await sales2Agent.post("/api/v1/location/pings").send(buildPingPayload());

    expect(response.status).toBe(409);
  });

  it("rejects a ping after the employee has already checked out", async () => {
    await createClosedAttendance(sales2._id);

    const response = await sales2Agent.post("/api/v1/location/pings").send(buildPingPayload());

    expect(response.status).toBe(409);
  });

  it("rejects a ping with missing coords", async () => {
    await createOpenAttendance(sales1._id);

    const response = await sales1Agent.post("/api/v1/location/pings").send({
      capturedAt: new Date().toISOString(),
    });

    expect(response.status).toBe(400);
  });

  it("always attributes the ping to the authenticated user, ignoring any employeeId in the body", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    const response = await sales1Agent.post("/api/v1/location/pings").send(
      buildPingPayload({ employeeId: String(sales2._id) })
    );

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
    expect(response.body.data.attendanceId).toBe(String(attendance._id));
  });
});

describe("Geofencing (§6.5/§7.4) — POST /location/pings flags a violation against checkIn.coords", () => {
  // createOpenAttendance's own base check-in point is { lat: 12.9, lng: 77.6 }.
  // A latitude offset of 0.001 is ~111m (within the default 500m radius); an
  // offset of 0.01 is ~1113m (well beyond it) — both comfortably clear of the
  // 500m boundary so these tests aren't sensitive to Haversine's small
  // curvature error.
  function nearbyCoords(latOffset) {
    return { lat: 12.9 + latOffset, lng: 77.6 };
  }

  it("records no geofence violation when a ping is within the radius", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    const response = await sales1Agent
      .post("/api/v1/location/pings")
      .send(buildPingPayload({ coords: nearbyCoords(0.001) }));

    expect(response.status).toBe(201);
    const updated = await Attendance.findById(attendance._id);
    expect(updated.geofenceViolations).toHaveLength(0);
  });

  it("opens a geofence violation window when a ping exceeds the radius", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    const response = await sales1Agent
      .post("/api/v1/location/pings")
      .send(buildPingPayload({ coords: nearbyCoords(0.01) }));

    expect(response.status).toBe(201);
    const updated = await Attendance.findById(attendance._id);
    expect(updated.geofenceViolations).toHaveLength(1);
    expect(updated.geofenceViolations[0].end).toBeNull();
    expect(updated.geofenceViolations[0].maxDistanceMeters).toBeGreaterThan(500);
  });

  it("keeps one open violation window (not a new one) across repeated still-outside pings, tracking the worst distance seen", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload({ coords: nearbyCoords(0.01) }));
    await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload({ coords: nearbyCoords(0.02) }));

    const updated = await Attendance.findById(attendance._id);
    expect(updated.geofenceViolations).toHaveLength(1);
    expect(updated.geofenceViolations[0].end).toBeNull();
    expect(updated.geofenceViolations[0].maxDistanceMeters).toBeGreaterThan(2000);
  });

  it("closes the violation window when a later ping returns within the radius", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload({ coords: nearbyCoords(0.01) }));
    const closingResponse = await sales1Agent
      .post("/api/v1/location/pings")
      .send(buildPingPayload({ coords: nearbyCoords(0.001) }));

    expect(closingResponse.status).toBe(201);
    const updated = await Attendance.findById(attendance._id);
    expect(updated.geofenceViolations).toHaveLength(1);
    expect(updated.geofenceViolations[0].end).not.toBeNull();
  });

  it("closes a still-open violation window at checkout, the same 'whichever comes first' pattern as connectivity gaps", async () => {
    const checkInResponse = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: { lat: 12.9, lng: 77.6 }, photo: "data:image/jpeg;base64,ZmFrZQ==" });

    await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload({ coords: nearbyCoords(0.01) }));

    const checkOutResponse = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: { lat: 12.9, lng: 77.6 }, photo: "data:image/jpeg;base64,ZmFrZQ==" });

    expect(checkOutResponse.status).toBe(200);
    expect(checkOutResponse.body.data.geofenceViolations).toHaveLength(1);
    expect(checkOutResponse.body.data.geofenceViolations[0].end).not.toBeNull();

    // Never blocked check-in's own attendanceId from resolving correctly.
    expect(checkOutResponse.body.data._id).toBe(checkInResponse.body.data._id);
  });

  it("never blocks the ping itself even if the geofence distance calculation throws", async () => {
    await createOpenAttendance(sales1._id);
    const { haversineDistanceMeters } = await import("../../services/geo.service.js");
    haversineDistanceMeters.mockImplementationOnce(() => {
      throw new Error("geofence calculation exploded");
    });

    const response = await sales1Agent
      .post("/api/v1/location/pings")
      .send(buildPingPayload({ coords: nearbyCoords(0.01) }));

    expect(response.status).toBe(201);
  });
});

describe("GET /location/live", () => {
  async function checkInAndPing(agent, employeeId) {
    await createOpenAttendance(employeeId);
    const response = await agent.post("/api/v1/location/pings").send(buildPingPayload());
    expect(response.status).toBe(201);
  }

  it("admin sees every checked-in employee", async () => {
    await checkInAndPing(sales1Agent, sales1._id);
    await checkInAndPing(sales2Agent, sales2._id);
    await checkInAndPing(sales3Agent, sales3._id);

    const response = await adminAgent.get("/api/v1/location/live");

    expect(response.status).toBe(200);
    const employeeIds = response.body.data.map((entry) => entry.employeeId).sort();
    expect(employeeIds).toEqual([String(sales1._id), String(sales2._id), String(sales3._id)].sort());
  });

  it("manager sees only their direct reports, not an unaffiliated sales associate", async () => {
    await checkInAndPing(sales1Agent, sales1._id);
    await checkInAndPing(sales2Agent, sales2._id);
    await checkInAndPing(sales3Agent, sales3._id);

    const response = await managerAgent.get("/api/v1/location/live");

    expect(response.status).toBe(200);
    const employeeIds = response.body.data.map((entry) => entry.employeeId).sort();
    expect(employeeIds).toEqual([String(sales1._id), String(sales2._id)].sort());
  });

  it("sales_associate sees only their own live location", async () => {
    await checkInAndPing(sales1Agent, sales1._id);
    await checkInAndPing(sales2Agent, sales2._id);

    const response = await sales1Agent.get("/api/v1/location/live");

    expect(response.status).toBe(200);
    expect(response.body.data.map((entry) => entry.employeeId)).toEqual([String(sales1._id)]);
  });

  it("excludes an employee who has already checked out", async () => {
    await checkInAndPing(sales1Agent, sales1._id);
    await createClosedAttendance(sales2._id);

    const response = await adminAgent.get("/api/v1/location/live");

    expect(response.body.data.map((entry) => entry.employeeId)).toEqual([String(sales1._id)]);
  });

  it("denies a user with no location permission granted at all", async () => {
    const response = await noPermAgent.get("/api/v1/location/live");

    expect(response.status).toBe(403);
  });
});

describe("GET /location/history", () => {
  it("returns only the requesting employee's own pings for the given day, in order", async () => {
    const attendance = await createOpenAttendance(sales1._id);

    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const yesterday = new Date(morning);
    yesterday.setDate(yesterday.getDate() - 1);

    await LocationPing.create({
      employeeId: sales1._id,
      attendanceId: attendance._id,
      coords: { lat: 1, lng: 1 },
      capturedAt: noon,
    });
    await LocationPing.create({
      employeeId: sales1._id,
      attendanceId: attendance._id,
      coords: { lat: 2, lng: 2 },
      capturedAt: morning,
    });
    // A different day — must not appear in "today"'s trail.
    await LocationPing.create({
      employeeId: sales1._id,
      attendanceId: attendance._id,
      coords: { lat: 3, lng: 3 },
      capturedAt: yesterday,
    });
    // A different employee, same day — must not leak into sales1's trail.
    const attendance2 = await createOpenAttendance(sales2._id);
    await LocationPing.create({
      employeeId: sales2._id,
      attendanceId: attendance2._id,
      coords: { lat: 9, lng: 9 },
      capturedAt: noon,
    });

    const response = await sales1Agent.get("/api/v1/location/history");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].coords.lat).toBe(2); // morning, sorted first
    expect(response.body.data[1].coords.lat).toBe(1); // noon, sorted second
  });

  it("lets a manager fetch a team member's history by employeeId", async () => {
    const attendance = await createOpenAttendance(sales1._id);
    await LocationPing.create({
      employeeId: sales1._id,
      attendanceId: attendance._id,
      coords: { lat: 5, lng: 5 },
      capturedAt: new Date(),
    });

    const response = await managerAgent.get(`/api/v1/location/history?employeeId=${sales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("returns 404 when a sales_associate requests another sales_associate's history", async () => {
    const attendance = await createOpenAttendance(sales2._id);
    await LocationPing.create({
      employeeId: sales2._id,
      attendanceId: attendance._id,
      coords: { lat: 5, lng: 5 },
      capturedAt: new Date(),
    });

    const response = await sales1Agent.get(`/api/v1/location/history?employeeId=${sales2._id}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 when a manager requests an unaffiliated sales associate's history", async () => {
    const attendance = await createOpenAttendance(sales3._id);
    await LocationPing.create({
      employeeId: sales3._id,
      attendanceId: attendance._id,
      coords: { lat: 5, lng: 5 },
      capturedAt: new Date(),
    });

    const response = await managerAgent.get(`/api/v1/location/history?employeeId=${sales3._id}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /location/config", () => {
  it("returns the configured ping interval", async () => {
    const response = await sales1Agent.get("/api/v1/location/config");

    expect(response.status).toBe(200);
    expect(response.body.data.pingIntervalMinutes).toBe(2);
  });
});

// The tests above all seed an "open shift" directly via createOpenAttendance()
// (a straight Mongoose write) so each one can isolate exactly the location
// scenario under test without an extra HTTP round trip. This describe block
// is the one place that proves the two modules actually connect end-to-end
// through their real HTTP endpoints, now that attendance.routes.js exists
// (§7.4) — a real check-in unblocks a real ping, and a real check-out blocks
// the next one, with no direct DB writes anywhere in the flow.
describe("End-to-end: real check-in/check-out via the attendance module unblocks/blocks pings", () => {
  it("a ping succeeds after a real POST /attendance/check-in, then is rejected after a real POST /attendance/check-out", async () => {
    const checkInResponse = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: { lat: 12.9, lng: 77.6 }, photo: "data:image/jpeg;base64,ZmFrZQ==" });

    expect(checkInResponse.status).toBe(201);

    const pingResponse = await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload());

    expect(pingResponse.status).toBe(201);
    expect(pingResponse.body.data.attendanceId).toBe(checkInResponse.body.data._id);

    const checkOutResponse = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: { lat: 12.9, lng: 77.6 }, photo: "data:image/jpeg;base64,ZmFrZQ==" });

    expect(checkOutResponse.status).toBe(200);

    const secondPingResponse = await sales1Agent.post("/api/v1/location/pings").send(buildPingPayload());

    expect(secondPingResponse.status).toBe(409);
  });
});

describe("LocationPing TTL index", () => {
  it("has a TTL index on createdAt with the documented expireAfterSeconds (45 days)", async () => {
    await LocationPing.init(); // ensure indexes are built before inspecting them

    const indexes = await LocationPing.collection.indexes();
    const ttlIndex = indexes.find((index) => index.expireAfterSeconds !== undefined);

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex.key).toEqual({ createdAt: 1 });
    expect(ttlIndex.expireAfterSeconds).toBe(LOCATION_PING_TTL_SECONDS);
    expect(LOCATION_PING_TTL_SECONDS).toBe(45 * 24 * 60 * 60);
  });
});
