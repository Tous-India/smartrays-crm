import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import TravelLog from "./travelLog.model.js";
import Attendance from "../attendance/attendance.model.js";

const FAKE_DISTANCE_KM = 12.5;
const TEST_PHOTO = "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==";
const FAKE_REPORT_URL = "https://fake.cloudinary.test/report.file";

// No test ever makes a real Google Maps or Cloudinary API call — both are
// mocked at the module boundary, the same pattern attendance.test.js already
// established. `uploadReportFile` (added for the Phase 8 report dispatcher,
// §7.11) is mocked too, since GET /travel-logs/report now goes through it.
vi.mock("../../services/googleMaps.service.js", () => ({
  getDistanceKm: vi.fn(async () => FAKE_DISTANCE_KM),
}));
vi.mock("../../services/cloudinary.service.js", () => ({
  uploadAttendancePhoto: vi.fn(async () => "https://fake.cloudinary.test/photo.jpg"),
  uploadReportFile: vi.fn(async () => FAKE_REPORT_URL),
}));

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent;
let admin, manager1, sales1, sales2, sales3;

function buildCoords(overrides = {}) {
  return { lat: 12.9716, lng: 77.5946, ...overrides };
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
  admin = (await adminAgent.get("/api/v1/auth/me")).body.data;

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
});

afterEach(async () => {
  await TravelLog.deleteMany({});
  await Attendance.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("Auto-generation on Attendance checkout", () => {
  it("creates a source:auto TravelLog from checkIn/checkOut coords when an employee checks out", async () => {
    await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const checkOutResponse = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords({ lat: 13 }), photo: TEST_PHOTO });

    expect(checkOutResponse.status).toBe(200);

    const travelLog = await TravelLog.findOne({ employeeId: sales1._id });
    expect(travelLog).not.toBeNull();
    expect(travelLog.source).toBe("auto");
    expect(travelLog.originCoords.lat).toBe(buildCoords().lat);
    expect(travelLog.destinationCoords.lat).toBe(13);
    expect(travelLog.distanceKm).toBe(FAKE_DISTANCE_KM);
  });

  it("skips auto-generation (does not throw) when coords are missing, called directly", async () => {
    const { generateAutoTravelLog } = await import("./travelLog.service.js");

    const result = await generateAutoTravelLog({
      employeeId: sales1._id,
      date: new Date(),
      originCoords: null,
      destinationCoords: buildCoords(),
    });

    expect(result).toBeNull();
    expect(await TravelLog.countDocuments({ employeeId: sales1._id })).toBe(0);
  });

  it("never fails checkout even if the Google Maps call fails", async () => {
    const { getDistanceKm } = await import("../../services/googleMaps.service.js");
    getDistanceKm.mockRejectedValueOnce(new Error("Google Maps is down"));

    await sales1Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    const checkOutResponse = await sales1Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });

    expect(checkOutResponse.status).toBe(200);
    expect(await TravelLog.countDocuments({ employeeId: sales1._id })).toBe(0);
  });
});

describe("POST /travel-logs (manual entry)", () => {
  it("uses a caller-supplied distanceKm as-is, without calling Google Maps", async () => {
    const { getDistanceKm } = await import("../../services/googleMaps.service.js");
    getDistanceKm.mockClear();

    const response = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 42 });

    expect(response.status).toBe(201);
    expect(response.body.data.distanceKm).toBe(42);
    expect(response.body.data.source).toBe("manual");
    expect(getDistanceKm).not.toHaveBeenCalled();
  });

  it("computes distanceKm via Google Maps when only coords are given", async () => {
    const response = await sales1Agent.post("/api/v1/travel-logs").send({
      originCoords: buildCoords(),
      destinationCoords: buildCoords({ lat: 13 }),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.distanceKm).toBe(FAKE_DISTANCE_KM);
  });

  it("rejects an entry with neither distanceKm nor both coords", async () => {
    const response = await sales1Agent.post("/api/v1/travel-logs").send({});

    expect(response.status).toBe(400);
  });

  it("lets a caller log their own travel with no employeeId given at all", async () => {
    const response = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 10 });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("blocks a plain sales_associate from logging travel for a peer — rejected outright, not silently redirected to self", async () => {
    const response = await sales1Agent
      .post("/api/v1/travel-logs")
      .send({ distanceKm: 10, employeeId: String(sales2._id) });

    expect(response.status).toBe(403);
  });

  it("lets a manager log travel on behalf of their own direct report", async () => {
    const response = await managerAgent
      .post("/api/v1/travel-logs")
      .send({ distanceKm: 10, employeeId: String(sales1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("blocks a manager from logging travel for a non-report", async () => {
    const response = await managerAgent
      .post("/api/v1/travel-logs")
      .send({ distanceKm: 10, employeeId: String(sales3._id) });

    expect(response.status).toBe(403);
  });

  it("lets an admin log travel on behalf of anyone", async () => {
    const response = await adminAgent
      .post("/api/v1/travel-logs")
      .send({ distanceKm: 10, employeeId: String(sales3._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales3._id));
  });
});

describe("GET /travel-logs?scope=own|team|all", () => {
  it("scope=own (default) returns only the caller's own logs", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales2Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const response = await sales1Agent.get("/api/v1/travel-logs");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(sales1._id));
  });

  it("scope=team lets a manager see their direct reports' logs, not an unaffiliated sales associate's", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales2Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales3Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const response = await managerAgent.get("/api/v1/travel-logs?scope=team");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("scope=team narrows further with ?employeeId= to one specific report", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales2Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const response = await managerAgent.get(`/api/v1/travel-logs?scope=team&employeeId=${sales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(sales1._id));
  });

  it("scope=team is blocked for a sales_associate (no view_team grant)", async () => {
    const response = await sales1Agent.get("/api/v1/travel-logs?scope=team");

    expect(response.status).toBe(403);
  });

  it("scope=all is blocked for a manager but allowed for admin", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const managerResponse = await managerAgent.get("/api/v1/travel-logs?scope=all");
    expect(managerResponse.status).toBe(403);

    const adminResponse = await adminAgent.get("/api/v1/travel-logs?scope=all");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(1);
  });

  it("admin sees all, manager sees only their team, employee sees only their own — side by side", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales2Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales3Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const adminResponse = await adminAgent.get("/api/v1/travel-logs?scope=all");
    const managerResponse = await managerAgent.get("/api/v1/travel-logs?scope=team");
    const employeeResponse = await sales1Agent.get("/api/v1/travel-logs");

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.map((log) => log.employeeId).sort()).toEqual(
      [String(sales1._id), String(sales2._id), String(sales3._id)].sort()
    );

    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.data.map((log) => log.employeeId).sort()).toEqual(
      [String(sales1._id), String(sales2._id)].sort()
    );

    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.data.map((log) => log.employeeId)).toEqual([String(sales1._id)]);
  });

  it("rejects an invalid scope value", async () => {
    const response = await sales1Agent.get("/api/v1/travel-logs?scope=everyone");

    expect(response.status).toBe(400);
  });
});

describe("PATCH /travel-logs/:id/approve|reject", () => {
  it("defaults every new travel log to status:pending, regardless of source", async () => {
    const manualResponse = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    expect(manualResponse.body.data.status).toBe("pending");

    await sales2Agent
      .post("/api/v1/attendance/check-in")
      .send({ coords: buildCoords(), photo: TEST_PHOTO });
    await sales2Agent
      .post("/api/v1/attendance/check-out")
      .send({ coords: buildCoords({ lat: 13 }), photo: TEST_PHOTO });

    const autoLog = await TravelLog.findOne({ employeeId: sales2._id });
    expect(autoLog.status).toBe("pending");
  });

  it("lets the employee's manager approve a pending travel log", async () => {
    const createResponse = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    const travelLogId = createResponse.body.data._id;

    const response = await managerAgent.patch(`/api/v1/travel-logs/${travelLogId}/approve`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(response.body.data.approvedBy).toBe(String(manager1._id));
    expect(response.body.data.approvedAt).not.toBeNull();
  });

  it("lets an admin reject a pending travel log", async () => {
    const createResponse = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    const travelLogId = createResponse.body.data._id;

    const response = await adminAgent.patch(`/api/v1/travel-logs/${travelLogId}/reject`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("rejected");
    expect(response.body.data.approvedBy).toBe(String(admin._id));
  });

  it("blocks a manager from approving a travel log for a non-report", async () => {
    const createResponse = await sales3Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    const travelLogId = createResponse.body.data._id;

    const response = await managerAgent.patch(`/api/v1/travel-logs/${travelLogId}/approve`);

    expect(response.status).toBe(403);
  });

  it("blocks a plain sales_associate (not a manager or admin) from approving anyone's travel log", async () => {
    const createResponse = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    const travelLogId = createResponse.body.data._id;

    const response = await sales2Agent.patch(`/api/v1/travel-logs/${travelLogId}/approve`);

    expect(response.status).toBe(403);
  });

  it("rejects approving a travel log that's already been approved/rejected", async () => {
    const createResponse = await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    const travelLogId = createResponse.body.data._id;

    await managerAgent.patch(`/api/v1/travel-logs/${travelLogId}/approve`);
    const secondResponse = await managerAgent.patch(`/api/v1/travel-logs/${travelLogId}/approve`);

    expect(secondResponse.status).toBe(409);
  });

  it("returns 404 for a non-existent travel log id", async () => {
    const response = await adminAgent.patch(
      "/api/v1/travel-logs/507f1f77bcf86cd799439011/approve"
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /travel-logs/report", () => {
  // Migrated onto the unified §7.11 report dispatcher (Phase 8) — no longer
  // streams the file itself; these tests assert against the real buffer the
  // mocked `uploadReportFile` was called with, and the `{ downloadUrl }` the
  // mocked upload resolves to, rather than a streamed response body.
  it("generates a valid, non-empty .xlsx report by default, scoped to the manager's team only, and returns a downloadUrl", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales2Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });
    await sales3Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const { uploadReportFile } = await import("../../services/cloudinary.service.js");
    uploadReportFile.mockClear();

    const response = await managerAgent.get("/api/v1/travel-logs/report");

    expect(response.status).toBe(200);
    expect(response.body.data.downloadUrl).toBe(FAKE_REPORT_URL);
    expect(uploadReportFile).toHaveBeenCalledTimes(1);

    const [buffer, format] = uploadReportFile.mock.calls[0];
    expect(format).toBe("xlsx");
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const employeeNames = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        employeeNames.push(row.getCell(1).value);
      }
    });

    expect(employeeNames.sort()).toEqual(["Sales One", "Sales Two"].sort());
  });

  it("generates a valid, non-empty PDF report when format=pdf, and returns a downloadUrl", async () => {
    await sales1Agent.post("/api/v1/travel-logs").send({ distanceKm: 5 });

    const { uploadReportFile } = await import("../../services/cloudinary.service.js");
    uploadReportFile.mockClear();

    const response = await managerAgent.get("/api/v1/travel-logs/report?format=pdf");

    expect(response.status).toBe(200);
    expect(response.body.data.downloadUrl).toBe(FAKE_REPORT_URL);
    expect(uploadReportFile).toHaveBeenCalledTimes(1);

    const [buffer, format] = uploadReportFile.mock.calls[0];
    expect(format).toBe("pdf");
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns 403 for a role with no travelLogs.* view_team/view_all grant", async () => {
    const response = await sales1Agent.get("/api/v1/travel-logs/report");

    expect(response.status).toBe(403);
  });
});
