import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { bufferParser } from "../../../tests/helpers/binaryResponse.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import Payroll from "../payroll/payroll.model.js";
import TravelLog from "../transport/travelLog.model.js";
import Lead from "../lead/lead.model.js";
import Customer from "../customer/customer.model.js";

const REPORT_CONTENT_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// The report dispatcher no longer talks to Cloudinary at all (2026-08-04,
// §7.11 architecture change) — every module's report is now generated and
// streamed directly as the HTTP response, never uploaded anywhere first.
// `cloudinary.service.js` is still mocked here (same as
// attendance.test.js/travelLog.test.js) purely so the app can boot without a
// real network dependency (attendance photo routes still use it) — every
// test below explicitly asserts NONE of its functions were called, which is
// what actually proves the removal, not just the absence of a
// `{ downloadUrl }` in the response.
vi.mock("../../services/cloudinary.service.js", () => ({
  uploadAttendancePhoto: vi.fn(),
  deleteCloudinaryAsset: vi.fn(),
  uploadTicketAttachment: vi.fn(),
}));

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent, employee1Agent;
let admin, manager1, sales1, sales2, sales3, employee1;

function juneDate(day) {
  return new Date(2026, 5, day);
}

async function expectNoCloudinaryCalls() {
  const { uploadAttendancePhoto, deleteCloudinaryAsset, uploadTicketAttachment } = await import(
    "../../services/cloudinary.service.js"
  );

  expect(uploadAttendancePhoto).not.toHaveBeenCalled();
  expect(deleteCloudinaryAsset).not.toHaveBeenCalled();
  expect(uploadTicketAttachment).not.toHaveBeenCalled();
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  const { createUserDirectly } = await import("../../../tests/helpers/authHelpers.js");
  admin = await createUserDirectly({
    name: "Admin",
    email: "admin@test.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

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

  const employee1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee One",
    email: "employee1@test.local",
    password: "Password123",
    role: "employee",
  });
  employee1 = employee1Response.body.data;
  employee1Agent = await loginAsAgent(app, "employee1@test.local", "Password123");
});

afterEach(async () => {
  await Attendance.deleteMany({});
  await Leave.deleteMany({});
  await Payroll.deleteMany({});
  await TravelLog.deleteMany({});
  await Lead.deleteMany({});
  await Customer.deleteMany({});
  vi.clearAllMocks();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /reports/generate — validation", () => {
  it("rejects a missing/invalid module", async () => {
    const response = await adminAgent.post("/api/v1/reports/generate").send({});

    expect(response.status).toBe(400);
  });

  it("rejects an unsupported module value", async () => {
    const response = await adminAgent.post("/api/v1/reports/generate").send({ module: "tickets" });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid format", async () => {
    const response = await adminAgent
      .post("/api/v1/reports/generate")
      .send({ module: "leads", format: "csv" });

    expect(response.status).toBe(400);
  });

  it("rejects filters that isn't an object", async () => {
    const response = await adminAgent
      .post("/api/v1/reports/generate")
      .send({ module: "leads", filters: "not-an-object" });

    expect(response.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const request = (await import("supertest")).default;
    const response = await request(app).post("/api/v1/reports/generate").send({ module: "leads" });

    expect(response.status).toBe(401);
  });
});

describe("module: attendance", () => {
  it("gives a manager exactly their team's data — the same set GET /attendance/team already returns — streamed directly, no Cloudinary involved", async () => {
    await Attendance.create({
      employeeId: sales1._id,
      date: juneDate(1),
      checkIn: { time: juneDate(1) },
      status: "present",
      workingHours: 8,
    });
    await Attendance.create({
      employeeId: sales2._id,
      date: juneDate(1),
      checkIn: { time: juneDate(1) },
      status: "present",
      workingHours: 8,
    });
    await Attendance.create({
      employeeId: sales3._id,
      date: juneDate(1),
      checkIn: { time: juneDate(1) },
      status: "present",
      workingHours: 8,
    });

    const teamResponse = await managerAgent.get("/api/v1/attendance/team");
    const teamEmployeeIds = teamResponse.body.data.map((record) => record.employeeId).sort();

    const reportResponse = await managerAgent
      .post("/api/v1/reports/generate")
      .send({ module: "attendance", format: "xlsx" })
      .buffer(true)
      .parse(bufferParser);

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.headers["content-type"]).toBe(REPORT_CONTENT_TYPES.xlsx);
    expect(reportResponse.headers["content-disposition"]).toContain("attachment");
    expect(reportResponse.headers["content-disposition"]).toContain("attendance-report.xlsx");
    await expectNoCloudinaryCalls();

    const buffer = reportResponse.body;
    // xlsx files are zip archives — real xlsx bytes start with the "PK"
    // local-file-header signature, same check attendance.test.js's own
    // (now-migrated) /attendance/report test makes on this buffer.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const reportedNames = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        reportedNames.push(row.getCell(1).value);
      }
    });

    // GET /attendance/team returned exactly sales1/sales2 (not sales3) —
    // the dispatcher's attendance report must match that same set exactly.
    expect(teamEmployeeIds).toEqual([String(sales1._id), String(sales2._id)].sort());
    expect(reportedNames.sort()).toEqual(["Sales One", "Sales Two"].sort());
  });

  it("blocks a sales_associate (no attendance.* grant at all)", async () => {
    const response = await sales1Agent.post("/api/v1/reports/generate").send({ module: "attendance" });

    expect(response.status).toBe(403);
  });
});

describe("module: transport", () => {
  it("gives a manager exactly their team's data, same as GET /travel-logs?scope=team — streamed directly, no Cloudinary involved", async () => {
    await TravelLog.create({ employeeId: sales1._id, date: juneDate(1), distanceKm: 10, source: "manual" });
    await TravelLog.create({ employeeId: sales2._id, date: juneDate(1), distanceKm: 20, source: "manual" });
    await TravelLog.create({ employeeId: sales3._id, date: juneDate(1), distanceKm: 30, source: "manual" });

    const response = await managerAgent
      .post("/api/v1/reports/generate")
      .send({ module: "transport" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe(REPORT_CONTENT_TYPES.xlsx);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const reportedNames = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        reportedNames.push(row.getCell(1).value);
      }
    });

    expect(reportedNames.sort()).toEqual(["Sales One", "Sales Two"].sort());
  });

  it("blocks a sales_associate (no travelLogs.* view_team/view_all grant)", async () => {
    const response = await sales1Agent.post("/api/v1/reports/generate").send({ module: "transport" });

    expect(response.status).toBe(403);
  });
});

describe("module: leave", () => {
  it("lets an employee generate a report of their own leave data — streamed directly, no Cloudinary involved", async () => {
    await Leave.create({
      employeeId: employee1._id,
      startDate: juneDate(1),
      endDate: juneDate(1),
      type: "paid",
      status: "approved",
      reason: "Test reason",
    });

    const response = await employee1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "leave" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe(REPORT_CONTENT_TYPES.xlsx);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const dataRow = workbook.worksheets[0].getRow(2);

    expect(dataRow.getCell(1).value).toBe("Employee One");
  });

  it("still 403s a scope the caller doesn't hold, via the reused listLeaves check (sales_associate requesting scope=team)", async () => {
    const response = await sales1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "leave", filters: { scope: "team" } });

    expect(response.status).toBe(403);
  });

  it("rejects an invalid scope filter, reusing leave.validation.js's validateScopeQuery", async () => {
    const response = await employee1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "leave", filters: { scope: "bogus" } });

    expect(response.status).toBe(400);
  });
});

describe("module: payroll", () => {
  it("lets an employee generate a report of their own payroll history — streamed directly, no Cloudinary involved", async () => {
    await Payroll.create({
      employeeId: employee1._id,
      month: 6,
      year: 2026,
      daysInMonth: 30,
      presentDays: 20,
      paidLeaveDays: 1,
      unpaidDeductionDays: 0,
      workingHoursTotal: 160,
      grossAmount: 21000,
      netAmount: 21000,
      mileageReimbursement: 0,
      generatedAt: juneDate(30),
      paidOn: new Date(2026, 6, 1),
    });

    const response = await employee1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "payroll" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    const dataRow = worksheet.getRow(2);

    expect(dataRow.getCell(1).value).toBe("Employee One");
    expect(dataRow.getCell(5).value).toBe(21000);
  });

  it("blocks a manager entirely — Payroll has no manager grant at all", async () => {
    const response = await managerAgent.post("/api/v1/reports/generate").send({ module: "payroll" });

    expect(response.status).toBe(403);
  });

  it("rejects a scope value Payroll doesn't support, reusing payroll.validation.js's validateListQuery", async () => {
    const response = await employee1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "payroll", filters: { scope: "team" } });

    expect(response.status).toBe(400);
  });
});

describe("module: leads", () => {
  it("scopes to a sales_associate's own leads only, matching listLeads' own ownership rule — streamed directly, no Cloudinary involved", async () => {
    await Lead.create({
      name: "Own Lead",
      companyName: "Acme",
      ownerId: sales1._id,
      source: "Website",
      clientType: "residential",
    });
    await Lead.create({
      name: "Other Lead",
      companyName: "Beta",
      ownerId: sales3._id,
      source: "Website",
      clientType: "residential",
    });

    const response = await sales1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "leads" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const names = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        names.push(row.getCell(1).value);
      }
    });

    expect(names).toEqual(["Own Lead"]);
  });

  it("blocks an employee (no leads grant by default)", async () => {
    const response = await employee1Agent.post("/api/v1/reports/generate").send({ module: "leads" });

    expect(response.status).toBe(403);
  });

  it("rejects a status filter value outside Lead's own LEAD_STATUSES enum", async () => {
    const response = await sales1Agent
      .post("/api/v1/reports/generate")
      .send({ module: "leads", filters: { status: "bogus-status" } });

    expect(response.status).toBe(400);
  });
});

describe("module: customers", () => {
  it("gives a manager their team's customers only, matching listCustomers' own ownership rule — streamed directly, no Cloudinary involved", async () => {
    await Customer.create({ companyName: "Team Customer", ownerId: sales1._id, projectManagerId: admin._id });
    await Customer.create({ companyName: "Other Customer", ownerId: sales3._id, projectManagerId: admin._id });

    const response = await managerAgent
      .post("/api/v1/reports/generate")
      .send({ module: "customers" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe(REPORT_CONTENT_TYPES.xlsx);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const companies = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        companies.push(row.getCell(1).value);
      }
    });

    expect(companies).toEqual(["Team Customer"]);
  });

  it("blocks an employee (no customers grant by default)", async () => {
    const response = await employee1Agent.post("/api/v1/reports/generate").send({ module: "customers" });

    expect(response.status).toBe(403);
  });

  it("generates a PDF when format=pdf is requested — streamed directly, no Cloudinary involved", async () => {
    await Customer.create({ companyName: "PDF Co", ownerId: admin._id, projectManagerId: admin._id });

    const response = await adminAgent
      .post("/api/v1/reports/generate")
      .send({ module: "customers", format: "pdf" })
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe(REPORT_CONTENT_TYPES.pdf);
    await expectNoCloudinaryCalls();

    const buffer = response.body;
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects a status filter value outside Customer's own CUSTOMER_STATUSES enum", async () => {
    const response = await managerAgent
      .post("/api/v1/reports/generate")
      .send({ module: "customers", filters: { status: "bogus-status" } });

    expect(response.status).toBe(400);
  });
});

describe("POST /reports/generate — per-module filter validation reuses each module's own validator", () => {
  it("rejects an invalid attendance date range, reusing attendance.validation.js's validateReportQuery", async () => {
    const response = await managerAgent
      .post("/api/v1/reports/generate")
      .send({ module: "attendance", filters: { from: "not-a-date" } });

    expect(response.status).toBe(400);
  });

  it("rejects from > to for a transport report, reusing travelLog.validation.js's validateReportQuery", async () => {
    const response = await managerAgent.post("/api/v1/reports/generate").send({
      module: "transport",
      filters: { from: "2026-06-30", to: "2026-06-01" },
    });

    expect(response.status).toBe(400);
  });
});
