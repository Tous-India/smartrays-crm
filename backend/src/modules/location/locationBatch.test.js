import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import LocationPing, { LOCATION_PING_TTL_SECONDS } from "./location.model.js";
import Attendance from "../attendance/attendance.model.js";

/**
 * Batched location pings + accuracy (mobile-backend-plan.md §3).
 *
 * The single-ping form is exercised by location.test.js, untouched; this file
 * covers the batch form beside it, the client id that makes retries safe, the
 * §3.4 faithful shift rule, `coords.accuracy` on pings and on check-in/
 * check-out, and the accuracy-aware geofence. Every request goes through
 * HTTP, so the whole file runs — and fails — against the pre-change code.
 */

vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn((publicId) => (publicId ? "https://signed.test/" + publicId : null)),
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "https://fake.cloudinary.test/photo.jpg", publicId: "fake-public-id" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

vi.mock("../../services/googleMaps.service.js", () => ({
  getDrivingDistanceKm: vi.fn(async () => 1),
}));

let app;
let employeeAgent;
let employee;

const CENTER = { lat: 12.9, lng: 77.6 };
const TEST_PHOTO = "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==";
const HOUR = 60 * 60 * 1000;

/** CENTER moved `meters` due north — 1° of latitude is ~111,320 m. */
function north(meters) {
  return { lat: CENTER.lat + meters / 111320, lng: CENTER.lng };
}

function iso(msAgo) {
  return new Date(Date.now() - msAgo).toISOString();
}

function ping(overrides = {}) {
  return {
    clientPingId: overrides.clientPingId || `id-${Math.random().toString(36).slice(2)}`,
    coords: overrides.coords || north(10),
    capturedAt: overrides.capturedAt || iso(60 * 1000),
  };
}

async function openShift(startedMsAgo = HOUR) {
  return Attendance.create({
    employeeId: employee._id,
    date: new Date(),
    checkIn: { time: new Date(Date.now() - startedMsAgo), coords: CENTER },
    lastHeartbeatAt: new Date(Date.now() - startedMsAgo),
  });
}

async function closedShift({ startedMsAgo, endedMsAgo }) {
  return Attendance.create({
    employeeId: employee._id,
    date: new Date(),
    checkIn: { time: new Date(Date.now() - startedMsAgo), coords: CENTER },
    checkOut: { time: new Date(Date.now() - endedMsAgo), coords: CENTER },
    lastHeartbeatAt: new Date(Date.now() - endedMsAgo),
  });
}

function postBatch(pings) {
  return employeeAgent.post("/api/v1/location/pings").send({ pings });
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  employee = await createUserDirectly({
    name: "Employee",
    email: "employee@test.local",
    password: "Password123",
    role: "employee",
    permissions: { location: { view: true } },
  });
  employeeAgent = await loginAsAgent(app, "employee@test.local", "Password123");
});

afterEach(async () => {
  await LocationPing.deleteMany({});
  await Attendance.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /location/pings — batch form { pings: [...] }", () => {
  it("inserts N pings, attributes each to the shift, and reports every one accepted", async () => {
    const shift = await openShift();
    const batch = [ping(), ping(), ping()];

    const response = await postBatch(batch);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ accepted: 3, duplicates: 0, rejected: [] });
    expect(response.body.data.results).toEqual(batch.map((one, index) => ({ index, clientPingId: one.clientPingId, status: "accepted" })));

    const stored = await LocationPing.find({}).sort({ capturedAt: 1 });
    expect(stored).toHaveLength(3);
    expect(stored.map((one) => one.clientPingId).sort()).toEqual(batch.map((one) => one.clientPingId).sort());
    expect(stored.every((one) => String(one.attendanceId) === String(shift._id))).toBe(true);
    expect(stored.every((one) => String(one.employeeId) === String(employee._id))).toBe(true);
  });

  it("a RETRIED batch inserts nothing and reports every ping as a duplicate", async () => {
    await openShift();
    const batch = [ping(), ping()];

    await postBatch(batch).expect(200);
    const retry = await postBatch(batch).expect(200);

    expect(retry.body.data).toMatchObject({ accepted: 0, duplicates: 2, rejected: [] });
    expect(retry.body.data.results.every((one) => one.status === "duplicate")).toBe(true);
    expect(await LocationPing.countDocuments()).toBe(2);
  });

  it("a duplicate INSIDE one batch is reported as such; the rest still land", async () => {
    await openShift();
    const first = ping({ clientPingId: "same" });
    const again = ping({ clientPingId: "same" });
    const other = ping();

    const response = await postBatch([first, again, other]).expect(200);

    expect(response.body.data.accepted).toBe(2);
    expect(response.body.data.duplicates).toBe(1);
    expect(await LocationPing.countDocuments()).toBe(2);
  });

  it("a ping captured outside ANY shift is rejected by index with a reason; the others are accepted", async () => {
    await openShift(HOUR);
    const beforeShift = ping({ capturedAt: iso(2 * HOUR) });
    const inShift = ping();

    const response = await postBatch([beforeShift, inShift]).expect(200);

    expect(response.body.data.accepted).toBe(1);
    expect(response.body.data.rejected).toEqual([
      { index: 0, clientPingId: beforeShift.clientPingId, reason: "no shift at capturedAt" },
    ]);
    expect(await LocationPing.countDocuments()).toBe(1);
  });

  it("§3.4 — a late upload into a shift that has SINCE CLOSED is accepted and attached to that shift", async () => {
    const shift = await closedShift({ startedMsAgo: 3 * HOUR, endedMsAgo: HOUR });
    const duringShift = ping({ capturedAt: iso(2 * HOUR) });
    const afterCheckout = ping({ capturedAt: iso(30 * 60 * 1000) });

    const response = await postBatch([duringShift, afterCheckout]).expect(200);

    expect(response.body.data.accepted).toBe(1);
    expect(response.body.data.rejected).toEqual([
      { index: 1, clientPingId: afterCheckout.clientPingId, reason: "no shift at capturedAt" },
    ]);

    const stored = await LocationPing.findOne({ clientPingId: duringShift.clientPingId });
    expect(String(stored.attendanceId)).toBe(String(shift._id));
  });

  it("the single form keeps its LITERAL rule — no open shift at upload time is still a 409, even inside a closed shift's window", async () => {
    await closedShift({ startedMsAgo: 3 * HOUR, endedMsAgo: HOUR });

    const response = await employeeAgent
      .post("/api/v1/location/pings")
      .send({ coords: north(10), capturedAt: iso(2 * HOUR) });

    expect(response.status).toBe(409);
  });

  it("rejects a capturedAt in the future or older than the retention window", async () => {
    await openShift(48 * 24 * HOUR);
    const future = ping({ capturedAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const ancient = ping({ capturedAt: iso((LOCATION_PING_TTL_SECONDS + 3600) * 1000) });

    const response = await postBatch([future, ancient]).expect(200);

    expect(response.body.data.accepted).toBe(0);
    expect(response.body.data.rejected.map((one) => one.reason)).toEqual(["capturedAt is in the future", "capturedAt is older than the retention window"]);
  });

  it("does NOT bump lastHeartbeatAt — a batch says the device reached us now, not then", async () => {
    const shift = await openShift(HOUR);
    const before = (await Attendance.findById(shift._id)).lastHeartbeatAt;

    await postBatch([ping()]).expect(200);

    const after = (await Attendance.findById(shift._id)).lastHeartbeatAt;
    expect(after.getTime()).toBe(before.getTime());
  });

  it("caps a batch at 500, refuses an empty one, and names a malformed element", async () => {
    await openShift();

    await postBatch([]).expect(400);
    await postBatch(Array.from({ length: 501 }, () => ping())).expect(400);

    const missingId = await postBatch([{ coords: north(1), capturedAt: iso(1000) }]).expect(400);
    expect(missingId.body.message).toMatch(/pings\[0\].*clientPingId/);

    const badLat = await postBatch([ping(), ping({ coords: { lat: 91, lng: 77.6 } })]).expect(400);
    expect(badLat.body.message).toMatch(/pings\[1\]/);

    const badAccuracy = await postBatch([ping({ coords: { lat: 12.9, lng: 77.6, accuracy: -1 } })]).expect(400);
    expect(badAccuracy.body.message).toMatch(/accuracy/);

    expect(await LocationPing.countDocuments()).toBe(0);
  });

  it("stores coords.accuracy when sent and leaves it absent when not — on the batch AND the single form", async () => {
    await openShift();

    await postBatch([ping({ clientPingId: "with", coords: { ...north(5), accuracy: 12.5 } }), ping({ clientPingId: "without" })]).expect(200);
    await employeeAgent.post("/api/v1/location/pings").send({ coords: { ...north(5), accuracy: 8 }, capturedAt: iso(1000) }).expect(201);

    expect((await LocationPing.findOne({ clientPingId: "with" })).coords.accuracy).toBe(12.5);
    expect((await LocationPing.findOne({ clientPingId: "without" })).coords.accuracy).toBeUndefined();
    expect((await LocationPing.findOne({ clientPingId: { $exists: false } })).coords.accuracy).toBe(8);
  });

  it("the client-id index is invisible to pings WITHOUT one — two web pings from one employee both insert", async () => {
    await openShift();

    await employeeAgent.post("/api/v1/location/pings").send({ coords: north(1), capturedAt: iso(2000) }).expect(201);
    await employeeAgent.post("/api/v1/location/pings").send({ coords: north(2), capturedAt: iso(1000) }).expect(201);

    expect(await LocationPing.countDocuments({ clientPingId: { $exists: false } })).toBe(2);

    const indexes = await LocationPing.collection.indexes();
    const clientIndex = indexes.find((index) => index.key.clientPingId === 1 && index.key.employeeId === 1);
    expect(clientIndex).toBeDefined();
    expect(clientIndex.unique).toBe(true);
  });

  it("the same clientPingId may be used by two DIFFERENT employees", async () => {
    await openShift();
    const other = await createUserDirectly({ name: "Other", email: "other@test.local", password: "Password123", role: "employee" });
    const otherAgent = await loginAsAgent(app, "other@test.local", "Password123");
    await Attendance.create({ employeeId: other._id, date: new Date(), checkIn: { time: new Date(Date.now() - HOUR), coords: CENTER } });

    await postBatch([ping({ clientPingId: "shared" })]).expect(200);
    const response = await otherAgent.post("/api/v1/location/pings").send({ pings: [ping({ clientPingId: "shared" })] }).expect(200);

    expect(response.body.data.accepted).toBe(1);
    expect(await LocationPing.countDocuments({ clientPingId: "shared" })).toBe(2);
  });
});

describe("geofence with accuracy (mobile-backend-plan.md §3.6)", () => {
  it("a batch ping outside the radius with NO accuracy opens a violation, timestamped at capturedAt", async () => {
    const shift = await openShift();
    const capturedAt = iso(10 * 60 * 1000);

    await postBatch([ping({ coords: north(600), capturedAt })]).expect(200);

    const updated = await Attendance.findById(shift._id);
    expect(updated.geofenceViolations).toHaveLength(1);
    expect(updated.geofenceViolations[0].start.toISOString()).toBe(capturedAt);
    expect(updated.geofenceViolations[0].maxDistanceMeters).toBeGreaterThan(500);
  });

  it("distance − accuracy > radius: a 60 m-accurate fix 520 m out is NOT a breach; a 5 m one is", async () => {
    const shift = await openShift();

    await postBatch([ping({ coords: { ...north(520), accuracy: 60 } })]).expect(200);
    expect((await Attendance.findById(shift._id)).geofenceViolations).toHaveLength(0);

    await postBatch([ping({ coords: { ...north(520), accuracy: 5 } })]).expect(200);
    expect((await Attendance.findById(shift._id)).geofenceViolations).toHaveLength(1);
  });

  it("a fix less precise than GEOFENCE_MAX_ACCURACY_METERS is not evaluated at all", async () => {
    const shift = await openShift();

    await postBatch([ping({ coords: { ...north(5000), accuracy: 150 } })]).expect(200);

    expect((await Attendance.findById(shift._id)).geofenceViolations).toHaveLength(0);
  });

  it("a batch is applied in capturedAt order, and a late batch into a closed shift leaves no violation open", async () => {
    const shift = await closedShift({ startedMsAgo: 3 * HOUR, endedMsAgo: HOUR });
    const outside = ping({ coords: north(700), capturedAt: iso(2.5 * HOUR) });
    const back = ping({ coords: north(10), capturedAt: iso(2 * HOUR) });
    const outAgain = ping({ coords: north(800), capturedAt: iso(1.5 * HOUR) });

    // Sent out of order on purpose.
    await postBatch([outAgain, outside, back]).expect(200);

    const updated = await Attendance.findById(shift._id);
    expect(updated.geofenceViolations).toHaveLength(2);
    expect(updated.geofenceViolations[0].start.toISOString()).toBe(outside.capturedAt);
    expect(updated.geofenceViolations[0].end.toISOString()).toBe(back.capturedAt);
    expect(updated.geofenceViolations[1].start.toISOString()).toBe(outAgain.capturedAt);
    // Closed at the shift's own check-out, never left open on a finished shift.
    expect(updated.geofenceViolations[1].end.toISOString()).toBe(updated.checkOut.time.toISOString());
  });
});

describe("coords.accuracy on check-in and check-out (mobile-backend-plan.md §3.6)", () => {
  it("persists accuracy sent with a check-in and a check-out, and leaves it absent when not sent", async () => {
    await employeeAgent
      .post("/api/v1/attendance/check-in")
      .send({ coords: { ...CENTER, accuracy: 7 }, photo: TEST_PHOTO })
      .expect(201);

    const open = await Attendance.findOne({ employeeId: employee._id });
    expect(open.checkIn.coords.accuracy).toBe(7);

    await employeeAgent.post("/api/v1/attendance/check-out").send({ coords: CENTER, photo: TEST_PHOTO }).expect(200);

    const closed = await Attendance.findById(open._id);
    expect(closed.checkOut.coords.accuracy).toBeUndefined();
  });

  it("rejects a negative accuracy on check-in", async () => {
    await employeeAgent
      .post("/api/v1/attendance/check-in")
      .send({ coords: { ...CENTER, accuracy: -3 }, photo: TEST_PHOTO })
      .expect(400);
  });

  it("history pings and endpoints carry accuracy inside coords when it was stored", async () => {
    await employeeAgent
      .post("/api/v1/attendance/check-in")
      .send({ coords: { ...CENTER, accuracy: 9 }, photo: TEST_PHOTO })
      .expect(201);
    // The shift began at the check-in a moment ago, so the fix is captured now.
    await postBatch([ping({ coords: { ...north(5), accuracy: 12 }, capturedAt: iso(0) })]).expect(200);

    const response = await employeeAgent.get("/api/v1/location/history").expect(200);

    expect(response.body.data.pings).toHaveLength(1);
    expect(response.body.data.pings[0].coords).toMatchObject({ accuracy: 12 });
    const checkIn = response.body.data.endpoints.find((one) => one.kind === "checkIn");
    expect(checkIn.coords).toMatchObject({ lat: CENTER.lat, lng: CENTER.lng, accuracy: 9 });
  });
});
