import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Attendance from "./attendance.model.js";
import User from "../user/user.model.js";
import Notification from "../notification/notification.model.js";

const FAKE_PHOTO_URL = "https://fake.cloudinary.test/photo.jpg";
const FAKE_PHOTO_PUBLIC_ID = "fake-public-id";
const FAKE_REPORT_URL = "https://fake.cloudinary.test/report.file";
// A photo is mandatory server-side on every check-in/check-out (see
// attendance.validation.js) — this is the throwaway base64 payload nearly
// every test in this file needs, since the goal of most tests here is
// something other than photo handling itself.
const TEST_PHOTO = "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==";

// No test ever makes a real Cloudinary API call — the credentials configured
// for the test suite (testDb.js) aren't for a real account. This mock proves
// the upload wiring itself (photo in → secure URL + public_id stored on the
// record) without a network dependency, keeping the suite fully self-
// contained. `{ secureUrl, publicId }` matches `uploadAttendancePhoto`'s real
// return shape (§7.4c, 2026-07-31 — added `publicId` for the photo-cleanup
// cron's later `cloudinary.uploader.destroy` call). `deleteCloudinaryAsset`
// is mocked too, even though this file's own tests never call it directly
// (that's `attendancePhotoCleanupCron.test.js`'s job) — needed since this
// mock replaces the whole module. `uploadReportFile` (added for the Phase 8
// report dispatcher, §7.11) is mocked too, since GET /attendance/report now
// goes through it — the mock itself is what lets tests assert against the
// actual generated buffer (real bytes it was called with) instead of a
// streamed response body.
vi.mock("../../services/cloudinary.service.js", () => ({
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: FAKE_PHOTO_URL, publicId: FAKE_PHOTO_PUBLIC_ID })),
  uploadReportFile: vi.fn(async () => FAKE_REPORT_URL),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

// Every check-out in this file now also triggers travelLog.service.js's
// auto travel-log generation (§7.6), which calls this service — mocked here
// too so nothing in this file ever makes a real Google Maps API call either.
vi.mock("../../services/googleMaps.service.js", () => ({
  getDistanceKm: vi.fn(async () => 5),
}));

let app;
let sales1Agent, sales2Agent, sales3Agent, managerAgent, adminAgent;
let sales1, sales2, sales3, admin, manager1Id;

function buildCoords(overrides = {}) {
  return { lat: 12.9716, lng: 77.5946, ...overrides };
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  admin = await createUserDirectly({
    name: "Admin",
    email: "admin@test.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  // Registered through the real /auth/register endpoint so these fixtures
  // get the actual role-based attendance permission defaults.
  const managerResponse = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager One",
    email: "manager1@test.local",
    password: "Password123",
    role: "manager",
  });
  managerAgent = await loginAsAgent(app, "manager1@test.local", "Password123");
  manager1Id = managerResponse.body.data._id;

  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1Id,
  });
  sales1 = sales1Response.body.data;
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  const sales2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales Two",
    email: "sales2@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1Id,
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
});

afterEach(async () => {
  await Attendance.deleteMany({});
  await Notification.deleteMany({});
  // Some tests grant manager1 extra per-user attendance permission overrides
  // (view_photos/view_location) — reset back to the manager role template's
  // own defaults so a later test's "default OFF" assumption never depends on
  // test execution order.
  await adminAgent.post(`/api/v1/users/${manager1Id}/permissions/reset`);
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /attendance/check-in", () => {
  it("creates an open attendance record for the authenticated employee", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
    expect(response.body.data.checkOut.time).toBeNull();
    // Own coords are never in the response (§7.4c hard self-view rule — see
    // the dedicated describe block below) — the real value is still stored,
    // checked directly on the persisted document.
    expect(response.body.data.checkIn.coords).toBeNull();
    const record = await Attendance.findById(response.body.data._id);
    expect({ lat: record.checkIn.coords.lat, lng: record.checkIn.coords.lng }).toEqual(buildCoords());
  });

  it("rejects a second check-in while one is already open", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(409);
  });

  it("rejects a check-in with missing coords", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({});

    expect(response.status).toBe(400);
  });

  it("always attributes the check-in to the authenticated user, ignoring any employeeId in the body", async () => {
    const response = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO, employeeId: String(sales2._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("lets a different employee check in independently while another employee has an open record", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales2Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(201);
  });

  it("rejects an admin's own check-in — admin accounts do not track attendance (§7.4c)", async () => {
    const response = await adminAgent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin accounts do not track attendance");
    expect(await Attendance.countDocuments({ employeeId: admin._id })).toBe(0);
  });
});

describe("POST /attendance/check-out", () => {
  it("closes the employee's open attendance record", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords({ lat: 13 }), photo: TEST_PHOTO });

    expect(response.status).toBe(200);
    expect(response.body.data.checkOut.time).not.toBeNull();
    // Own coords never in the response (§7.4c) — real value still stored.
    expect(response.body.data.checkOut.coords).toBeNull();
    const record = await Attendance.findById(response.body.data._id);
    expect(record.checkOut.coords.lat).toBe(13);
  });

  it("rejects a check-out when there's no open record", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(409);
  });

  it("rejects a second check-out once the record is already closed", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(409);
  });

  it("rejects a check-out with missing coords", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/check-out").send({});

    expect(response.status).toBe(400);
  });

  it("only ever closes the authenticated user's own open record, never someone else's", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales2Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(409);

    const sales1Record = await Attendance.findOne({ employeeId: sales1._id });
    expect(sales1Record.checkOut.time).toBeNull();
  });
});

describe("Break In / Break Out (§7.4c)", () => {
  it("rejects break-in with no open check-in", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    expect(response.status).toBe(409);
  });

  it("starts a break while checked in, requiring coords but no photo", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    expect(response.status).toBe(200);
    // Own coords never in the response (§7.4c) — checked on the record itself.
    expect(response.body.data.breakIn.coords).toBeNull();
    expect(response.body.data.breakIn.time).not.toBeNull();

    const record = await Attendance.findOne({ employeeId: sales1._id });
    expect(record.breakIn.time).not.toBeNull();
    expect(record.breakIn.coords.lat).toBe(buildCoords().lat);
  });

  it("rejects break-in with no coords at all", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/break-in").send({});

    expect(response.status).toBe(400);
  });

  it("rejects a second break-in while already on break", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    const response = await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You're already on break.");
  });

  it("rejects a break-in once the shift's one break has already been used", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });
    await sales1Agent.post("/api/v1/attendance/break-out").send({ coords: buildCoords() });

    const response = await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You've already used your one break for this shift.");
  });

  it("rejects break-out when not currently on break", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/break-out").send({ coords: buildCoords() });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You're not currently on break.");
  });

  it("ends a break when currently on break", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    const response = await sales1Agent.post("/api/v1/attendance/break-out").send({ coords: buildCoords() });

    expect(response.status).toBe(200);
    expect(response.body.data.breakOut.time).not.toBeNull();

    const record = await Attendance.findOne({ employeeId: sales1._id });
    expect(record.breakOut.time).not.toBeNull();
  });

  it("rejects checkout while still on break, with a clear message", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });

    const response = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You're still on break — end your break before checking out.");

    const record = await Attendance.findOne({ employeeId: sales1._id });
    expect(record.checkOut.time).toBeNull();
  });

  it("allows checkout once the break has been ended", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });
    await sales1Agent.post("/api/v1/attendance/break-out").send({ coords: buildCoords() });

    const response = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(response.status).toBe(200);
    expect(response.body.data.checkOut.time).not.toBeNull();
  });

  it("subtracts break duration from workingHours at checkout, in addition to any connectivity-gap subtraction", async () => {
    const checkInResponse = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const breakInTime = new Date(Date.now() - 20 * 60 * 1000);
    const breakOutTime = new Date(Date.now() - 5 * 60 * 1000); // a 15-minute break

    await Attendance.findByIdAndUpdate(checkInResponse.body.data._id, {
      breakIn: { time: breakInTime, coords: buildCoords() },
      breakOut: { time: breakOutTime, coords: buildCoords() },
    });

    const checkOutResponse = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(checkOutResponse.status).toBe(200);

    const record = await Attendance.findById(checkInResponse.body.data._id);
    const grossMs = record.checkOut.time - record.checkIn.time;
    const breakMs = breakOutTime - breakInTime;
    const expectedWorkingHours = Math.round((Math.max(0, grossMs - breakMs) / 3600000) * 100) / 100;

    expect(record.workingHours).toBe(expectedWorkingHours);
  });
});

describe("Attendance event notifications (§7.4c, 2026-07-31)", () => {
  it("notifies the employee, their manager, and every admin on check-in", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const attendanceId = response.body.data._id;

    const employeeNotification = await Notification.findOne({ userId: sales1._id, type: "attendance_check_in" });
    const managerNotification = await Notification.findOne({ userId: manager1Id, type: "attendance_check_in" });
    const adminNotification = await Notification.findOne({ userId: admin._id, type: "attendance_check_in" });

    expect(employeeNotification).not.toBeNull();
    expect(managerNotification).not.toBeNull();
    expect(adminNotification).not.toBeNull();
    expect(String(employeeNotification.relatedEntity.id)).toBe(String(attendanceId));
    expect(employeeNotification.relatedEntity.module).toBe("attendance");
  });

  it("notifies on break-in, break-out, and check-out too", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/break-in").send({ coords: buildCoords() });
    await sales1Agent.post("/api/v1/attendance/break-out").send({ coords: buildCoords() });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(await Notification.countDocuments({ userId: sales1._id, type: "attendance_break_in" })).toBe(1);
    expect(await Notification.countDocuments({ userId: sales1._id, type: "attendance_break_out" })).toBe(1);
    expect(await Notification.countDocuments({ userId: sales1._id, type: "attendance_check_out" })).toBe(1);
  });

  it("does not double-notify an unaffiliated employee's admin-who-is-not-their-manager more than once", async () => {
    // sales3 has no managerId at all — only the employee + every admin
    // should be notified, no manager notification since there is none.
    await sales3Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(await Notification.countDocuments({ userId: sales3._id, type: "attendance_check_in" })).toBe(1);
    expect(await Notification.countDocuments({ userId: admin._id, type: "attendance_check_in" })).toBe(1);
  });
});

describe("GET /attendance/me", () => {
  it("returns only the authenticated user's own attendance history", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales2Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.get("/api/v1/attendance/me");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(sales1._id));
  });

  it("rejects an invalid month format", async () => {
    const response = await sales1Agent.get("/api/v1/attendance/me?month=2026-7");

    expect(response.status).toBe(400);
  });

  it("filters history down to the given month", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const otherMonth = currentMonth === "2020-01" ? "2020-02" : "2020-01";

    const currentResponse = await sales1Agent.get(`/api/v1/attendance/me?month=${currentMonth}`);
    const otherResponse = await sales1Agent.get(`/api/v1/attendance/me?month=${otherMonth}`);

    expect(currentResponse.status).toBe(200);
    expect(currentResponse.body.data).toHaveLength(1);
    expect(otherResponse.body.data).toHaveLength(0);
  });

  it("never shows the employee their own photoUrl/coords, regardless of any permission they hold (§7.4c hard rule)", async () => {
    // Grant manager1 BOTH view_photos and view_location for OTHER people's
    // records — the hard rule must still strip their OWN, unaffected by this.
    await adminAgent.patch(`/api/v1/users/${manager1Id}/permissions`).send({
      permissions: { attendance: { view_team: true, view_photos: true, view_location: true } },
    });

    await managerAgent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await managerAgent.get("/api/v1/attendance/me");

    expect(response.status).toBe(200);
    expect(response.body.data[0].checkIn.photoUrl).toBeNull();
    expect(response.body.data[0].checkIn.coords).toBeNull();
  });
});

describe("Photo capture (check-in/check-out)", () => {
  it("uploads a base64 photo on check-in and stores the returned secure URL", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({
      coords: buildCoords(),
      photo: "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==",
    });

    expect(response.status).toBe(201);
    // Own photo never in the response either (§7.4c) — the upload itself
    // still genuinely happened, checked on the persisted document.
    expect(response.body.data.checkIn.photoUrl).toBeNull();
    const record = await Attendance.findById(response.body.data._id);
    expect(record.checkIn.photoUrl).toBe(FAKE_PHOTO_URL);
  });

  it("rejects a check-in with no photo at all — the photo requirement is enforced server-side, not just client-side", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords() });

    expect(response.status).toBe(400);
  });

  it("rejects a check-out with no photo at all", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords() });

    expect(response.status).toBe(400);
  });

  it("uploads a base64 photo on check-out too", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/check-out").send({
      coords: buildCoords(),
      photo: "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.checkOut.photoUrl).toBeNull();
    const record = await Attendance.findById(response.body.data._id);
    expect(record.checkOut.photoUrl).toBe(FAKE_PHOTO_URL);
  });

  it("accepts a multipart photo file alongside JSON-stringified coords", async () => {
    const response = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .field("coords", JSON.stringify(buildCoords()))
      .attach("photo", Buffer.from("fake-image-bytes"), "photo.jpg");

    expect(response.status).toBe(201);
    expect(response.body.data.checkIn.photoUrl).toBeNull();
    expect(response.body.data.checkIn.coords).toBeNull();
    const record = await Attendance.findById(response.body.data._id);
    expect(record.checkIn.photoUrl).toBe(FAKE_PHOTO_URL);
    expect({ lat: record.checkIn.coords.lat, lng: record.checkIn.coords.lng }).toEqual(buildCoords());
  });
});

describe("POST /attendance/heartbeat and connectivity-gap detection", () => {
  it("rejects a heartbeat with no open check-in", async () => {
    const response = await sales1Agent.post("/api/v1/attendance/heartbeat");

    expect(response.status).toBe(409);
  });

  it("does not record a gap when a heartbeat arrives within the threshold", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await sales1Agent.post("/api/v1/attendance/heartbeat");

    expect(response.status).toBe(200);
    expect(response.body.data.connectivityGaps).toHaveLength(0);
  });

  it("records a connectivity gap when a heartbeat arrives after the threshold has elapsed", async () => {
    const checkInResponse = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    const backdated = new Date(Date.now() - 20 * 60 * 1000);

    await Attendance.findByIdAndUpdate(checkInResponse.body.data._id, { lastHeartbeatAt: backdated });

    const heartbeatResponse = await sales1Agent.post("/api/v1/attendance/heartbeat");

    expect(heartbeatResponse.status).toBe(200);
    expect(heartbeatResponse.body.data.connectivityGaps).toHaveLength(1);
    expect(new Date(heartbeatResponse.body.data.connectivityGaps[0].start).getTime()).toBe(
      backdated.getTime()
    );
  });

  it("also detects a gap between the last heartbeat and checkout, not just between heartbeats", async () => {
    const checkInResponse = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    const backdated = new Date(Date.now() - 15 * 60 * 1000);

    await Attendance.findByIdAndUpdate(checkInResponse.body.data._id, { lastHeartbeatAt: backdated });

    const checkOutResponse = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(checkOutResponse.status).toBe(200);
    expect(checkOutResponse.body.data.connectivityGaps).toHaveLength(1);
  });

  it("subtracts connectivity-gap duration from workingHours at checkout", async () => {
    const checkInResponse = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    const backdated = new Date(Date.now() - 30 * 60 * 1000);

    await Attendance.findByIdAndUpdate(checkInResponse.body.data._id, { lastHeartbeatAt: backdated });

    const checkOutResponse = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(checkOutResponse.status).toBe(200);
    const gap = checkOutResponse.body.data.connectivityGaps[0];
    const gapMs = new Date(gap.end) - new Date(gap.start);
    const grossMs =
      new Date(checkOutResponse.body.data.checkOut.time) - new Date(checkInResponse.body.data.checkIn.time);
    const expectedWorkingHours = Math.round((Math.max(0, grossMs - gapMs) / 3600000) * 100) / 100;

    expect(checkOutResponse.body.data.workingHours).toBe(expectedWorkingHours);
  });

  it("computes workingHours with no subtraction when there was no gap", async () => {
    const checkInResponse = await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    const checkOutResponse = await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const grossMs =
      new Date(checkOutResponse.body.data.checkOut.time) - new Date(checkInResponse.body.data.checkIn.time);
    const expectedWorkingHours = Math.round((grossMs / 3600000) * 100) / 100;

    expect(checkOutResponse.body.data.connectivityGaps).toHaveLength(0);
    expect(checkOutResponse.body.data.workingHours).toBe(expectedWorkingHours);
  });
});

describe("GET /attendance/team", () => {
  it("a manager (attendance.view_team default) sees only their direct reports, not an unaffiliated sales associate", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales2Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales3Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await managerAgent.get("/api/v1/attendance/team");

    expect(response.status).toBe(200);
    const employeeIds = response.body.data.map((record) => record.employeeId).sort();
    expect(employeeIds).toEqual([String(sales1._id), String(sales2._id)].sort());
  });

  it("returns 403 for a role with no attendance.* grant at all", async () => {
    const response = await sales1Agent.get("/api/v1/attendance/team");

    expect(response.status).toBe(403);
  });

  it("filters team attendance down to the given month", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const otherMonth = currentMonth === "2020-01" ? "2020-02" : "2020-01";

    const currentResponse = await managerAgent.get(`/api/v1/attendance/team?month=${currentMonth}`);
    const otherResponse = await managerAgent.get(`/api/v1/attendance/team?month=${otherMonth}`);

    expect(currentResponse.body.data).toHaveLength(1);
    expect(otherResponse.body.data).toHaveLength(0);
  });

  it("strips photoUrl and coords for a manager with neither view_photos nor view_location (default template)", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await managerAgent.get("/api/v1/attendance/team");

    expect(response.status).toBe(200);
    expect(response.body.data[0].checkIn.photoUrl).toBeNull();
    expect(response.body.data[0].checkIn.coords).toBeNull();
  });

  it("shows photoUrl (but still hides coords) once a manager is granted attendance.view_photos", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await adminAgent.patch(`/api/v1/users/${manager1Id}/permissions`).send({
      permissions: { attendance: { view_team: true, view_photos: true } },
    });

    const response = await managerAgent.get("/api/v1/attendance/team");

    expect(response.body.data[0].checkIn.photoUrl).toBe(FAKE_PHOTO_URL);
    expect(response.body.data[0].checkIn.coords).toBeNull();
  });

  it("shows coords (but still hides photoUrl) once a manager is granted attendance.view_location", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await adminAgent.patch(`/api/v1/users/${manager1Id}/permissions`).send({
      permissions: { attendance: { view_team: true, view_location: true } },
    });

    const response = await managerAgent.get("/api/v1/attendance/team");

    expect(response.body.data[0].checkIn.coords).toEqual(buildCoords());
    expect(response.body.data[0].checkIn.photoUrl).toBeNull();
  });

  it("shows both once a manager is granted both view_photos and view_location", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await adminAgent.patch(`/api/v1/users/${manager1Id}/permissions`).send({
      permissions: { attendance: { view_team: true, view_photos: true, view_location: true } },
    });

    const response = await managerAgent.get("/api/v1/attendance/team");

    expect(response.body.data[0].checkIn.photoUrl).toBe(FAKE_PHOTO_URL);
    expect(response.body.data[0].checkIn.coords).toEqual(buildCoords());
  });

  it("an admin (attendance.view_all) always sees photoUrl and coords, with no grant needed", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await adminAgent.get("/api/v1/attendance/team");

    expect(response.body.data[0].checkIn.photoUrl).toBe(FAKE_PHOTO_URL);
    expect(response.body.data[0].checkIn.coords).toEqual(buildCoords());
  });
});

describe("GET /attendance/report", () => {
  // Migrated onto the unified §7.11 report dispatcher (Phase 8) — this
  // endpoint no longer streams the file itself, so these tests assert
  // against the real buffer the mocked `uploadReportFile` was called with
  // (proving a genuine, well-formed file was generated) and the
  // `{ downloadUrl }` the mocked upload resolves to, rather than a streamed
  // response body — the same general approach already used for mocking
  // Cloudinary elsewhere in this project.
  it("generates a valid, non-empty .xlsx report by default, scoped to the manager's team only, and returns a downloadUrl", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales2Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales3Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const { uploadReportFile } = await import("../../services/cloudinary.service.js");
    uploadReportFile.mockClear();

    const response = await managerAgent.get("/api/v1/attendance/report");

    expect(response.status).toBe(200);
    expect(response.body.data.downloadUrl).toBe(FAKE_REPORT_URL);
    expect(uploadReportFile).toHaveBeenCalledTimes(1);

    const [buffer, format] = uploadReportFile.mock.calls[0];
    expect(format).toBe("xlsx");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // .xlsx is a zip archive — its first two bytes are always the "PK" local
    // file header signature. Asserting this on the actual generated buffer
    // (not just trusting the format string) is what proves a real,
    // well-formed archive was built, not just an empty/garbage buffer.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    // Row 1 is the header, so data starts at row 2. Only sales1/sales2 (the
    // manager's direct reports) should appear — sales3 is deliberately
    // unaffiliated and must not leak into the report.
    const employeeNames = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        employeeNames.push(row.getCell(1).value);
      }
    });

    expect(employeeNames.sort()).toEqual(["Sales One", "Sales Two"].sort());
  });

  it("generates a valid, non-empty PDF report when format=pdf, and returns a downloadUrl", async () => {
    await sales1Agent.post("/api/v1/attendance/check-in").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const { uploadReportFile } = await import("../../services/cloudinary.service.js");
    uploadReportFile.mockClear();

    const response = await managerAgent.get("/api/v1/attendance/report?format=pdf");

    expect(response.status).toBe(200);
    expect(response.body.data.downloadUrl).toBe(FAKE_REPORT_URL);
    expect(uploadReportFile).toHaveBeenCalledTimes(1);

    const [buffer, format] = uploadReportFile.mock.calls[0];
    expect(format).toBe("pdf");
    // Every valid PDF file starts with this exact magic-number header.
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects an invalid format", async () => {
    const response = await managerAgent.get("/api/v1/attendance/report?format=csv");

    expect(response.status).toBe(400);
  });

  it("rejects from after to", async () => {
    const response = await managerAgent.get(
      "/api/v1/attendance/report?from=2026-02-01&to=2026-01-01"
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 for a role with no attendance.* grant at all", async () => {
    const response = await sales1Agent.get("/api/v1/attendance/report");

    expect(response.status).toBe(403);
  });
});

describe("PATCH /attendance/:id — admin manual correction", () => {
  it("lets admin edit status/checkIn.time/checkOut.time and recomputes workingHours", async () => {
    const checkInRes = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const recordId = checkInRes.body.data._id;
    const newCheckIn = "2026-06-01T09:00:00.000Z";
    const newCheckOut = "2026-06-01T17:00:00.000Z"; // exactly 8 hours later

    const response = await adminAgent.patch(`/api/v1/attendance/${recordId}`).send({
      status: "half_day",
      checkIn: { time: newCheckIn },
      checkOut: { time: newCheckOut },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("half_day");
    expect(new Date(response.body.data.checkIn.time).toISOString()).toBe(newCheckIn);
    expect(new Date(response.body.data.checkOut.time).toISOString()).toBe(newCheckOut);
    // No connectivityGaps recorded on this shift, so workingHours is exactly
    // the gross 8-hour duration between the new times.
    expect(response.body.data.workingHours).toBe(8);
    expect(response.body.data.isManuallyAdjusted).toBe(true);
    expect(response.body.data.adjustedBy).toBe(String(admin._id));
  });

  it("reverts workingHours to null when checkOut.time is cleared", async () => {
    const checkInRes = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales1Agent.post("/api/v1/attendance/check-out").send({ coords: buildCoords(), photo: TEST_PHOTO });

    const recordId = checkInRes.body.data._id;

    const response = await adminAgent.patch(`/api/v1/attendance/${recordId}`).send({
      checkOut: { time: null },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.checkOut.time).toBeNull();
    expect(response.body.data.workingHours).toBeNull();
  });

  it("only touching status still flags the record as manually adjusted", async () => {
    const checkInRes = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await adminAgent
      .patch(`/api/v1/attendance/${checkInRes.body.data._id}`)
      .send({ status: "on_leave" });

    expect(response.status).toBe(200);
    expect(response.body.data.isManuallyAdjusted).toBe(true);
    expect(response.body.data.adjustedBy).toBe(String(admin._id));
  });

  it("rejects a non-admin (manager included — no attendance.* tier covers this)", async () => {
    const checkInRes = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const managerResponse = await managerAgent
      .patch(`/api/v1/attendance/${checkInRes.body.data._id}`)
      .send({ status: "absent" });
    expect(managerResponse.status).toBe(403);

    const selfResponse = await sales1Agent
      .patch(`/api/v1/attendance/${checkInRes.body.data._id}`)
      .send({ status: "absent" });
    expect(selfResponse.status).toBe(403);
  });

  it("rejects an invalid status value", async () => {
    const checkInRes = await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const response = await adminAgent
      .patch(`/api/v1/attendance/${checkInRes.body.data._id}`)
      .send({ status: "on_vacation" });

    expect(response.status).toBe(400);
  });

  it("returns 404 for a non-existent record", async () => {
    const response = await adminAgent
      .patch("/api/v1/attendance/507f1f77bcf86cd799439011")
      .send({ status: "absent" });

    expect(response.status).toBe(404);
  });
});

describe("POST /attendance/manual — admin manual creation", () => {
  it("creates a record with no checkIn/checkOut for a day the employee never checked in, flagged as manually adjusted", async () => {
    const response = await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-05",
      status: "absent",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
    expect(response.body.data.status).toBe("absent");
    expect(response.body.data.checkIn.time).toBeNull();
    expect(response.body.data.checkOut.time).toBeNull();
    expect(response.body.data.workingHours).toBeNull();
    expect(response.body.data.isManuallyAdjusted).toBe(true);
    expect(response.body.data.adjustedBy).toBe(String(admin._id));
  });

  it("computes workingHours when both checkIn/checkOut times are provided", async () => {
    const response = await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-06",
      status: "present",
      checkIn: { time: "2026-06-06T09:00:00.000Z" },
      checkOut: { time: "2026-06-06T13:30:00.000Z" },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.workingHours).toBe(4.5);
  });

  it("defaults status to present when omitted", async () => {
    const response = await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-07",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("present");
  });

  it("rejects creating a second record for the same employee+date", async () => {
    await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-08",
      status: "present",
    });

    const response = await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-08",
      status: "absent",
    });

    expect(response.status).toBe(409);
  });

  it("rejects a non-admin", async () => {
    const managerResponse = await managerAgent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-09",
    });
    expect(managerResponse.status).toBe(403);

    const selfResponse = await sales1Agent.post("/api/v1/attendance/manual").send({
      employeeId: String(sales1._id),
      date: "2026-06-09",
    });
    expect(selfResponse.status).toBe(403);
  });

  it("rejects a missing employeeId or date", async () => {
    const missingEmployee = await adminAgent.post("/api/v1/attendance/manual").send({ date: "2026-06-10" });
    expect(missingEmployee.status).toBe(400);

    const missingDate = await adminAgent
      .post("/api/v1/attendance/manual")
      .send({ employeeId: String(sales1._id) });
    expect(missingDate.status).toBe(400);
  });

  it("returns 404 for a non-existent employeeId", async () => {
    const response = await adminAgent.post("/api/v1/attendance/manual").send({
      employeeId: "507f1f77bcf86cd799439011",
      date: "2026-06-11",
    });

    expect(response.status).toBe(404);
  });
});
