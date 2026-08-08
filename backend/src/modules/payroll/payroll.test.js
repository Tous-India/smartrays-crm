import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { bufferParser } from "../../../tests/helpers/binaryResponse.js";
import Payroll from "./payroll.model.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import TravelLog from "../transport/travelLog.model.js";

// A fixed month, unrelated to whatever "today" happens to be — June 2026 has
// 30 days, keeping the daysInMonth/dailyRate arithmetic simple everywhere
// below.
const MONTH = 6;
const YEAR = 2026;

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, employee1Agent;
let manager1, sales1, sales2, employee1;

function juneDate(day) {
  return new Date(YEAR, MONTH - 1, day);
}

async function seedAttendance(employeeId, days, workingHours = 8) {
  for (const day of days) {
    await Attendance.create({
      employeeId,
      date: juneDate(day),
      checkIn: { time: juneDate(day) },
      // checkOut derived from workingHours rather than reusing the check-in
      // instant: the model rejects a check-out at or before its check-in
      // (2026-08-08), and a fixture whose timestamps contradicted its own
      // workingHours was never a shape a real record could take anyway.
      checkOut: { time: new Date(juneDate(day).getTime() + workingHours * 60 * 60 * 1000) },
      status: "present",
      workingHours,
    });
  }
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  const { createUserDirectly } = await import("../../../tests/helpers/authHelpers.js");
  await createUserDirectly({
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
  await Payroll.deleteMany({});
  await Attendance.deleteMany({});
  await Leave.deleteMany({});
  await TravelLog.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /payroll/run — validation and access", () => {
  it("rejects a non-admin (manager included — Payroll has no team tier)", async () => {
    const response = await managerAgent.post(
      `/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(403);
  });

  it("rejects a missing/invalid month or year", async () => {
    const missingMonth = await adminAgent.post(`/api/v1/payroll/run?year=${YEAR}`);
    expect(missingMonth.status).toBe(400);

    const badMonth = await adminAgent.post(`/api/v1/payroll/run?month=13&year=${YEAR}`);
    expect(badMonth.status).toBe(400);
  });

  it("rejects running payroll for an employee with no baseSalary set", async () => {
    const response = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales2._id}&month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /payroll/run — single-employee computation (§7.7 formulas)", () => {
  it("computes daysInMonth/presentDays/paidLeaveDays/unpaidDeductionDays/workingHoursTotal/grossAmount/netAmount/mileageReimbursement/paidOn correctly", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    await seedAttendance(
      sales1._id,
      Array.from({ length: 20 }, (_, index) => index + 2)
    );

    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(25),
      endDate: juneDate(25),
      type: "paid",
      status: "approved",
      reason: "Test reason",
    });

    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(26),
      endDate: juneDate(26),
      type: "unpaid",
      status: "approved",
      reason: "Test reason",
    });

    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(27),
      endDate: juneDate(27),
      type: "unapproved_absence",
      status: "approved",
      isDoubleDeduction: true,
      reason: "Test reason",
    });

    // Pending leave in the same month must NOT count toward any total.
    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(28),
      endDate: juneDate(28),
      type: "unpaid",
      status: "pending",
      reason: "Test reason",
    });

    await TravelLog.create({
      employeeId: sales1._id,
      date: juneDate(3),
      distanceKm: 10,
      source: "manual",
      status: "approved",
    });
    await TravelLog.create({
      employeeId: sales1._id,
      date: juneDate(4),
      distanceKm: 15,
      source: "manual",
      status: "approved",
    });
    // Pending — must NOT be counted toward mileageReimbursement.
    await TravelLog.create({
      employeeId: sales1._id,
      date: juneDate(5),
      distanceKm: 100,
      source: "manual",
      status: "pending",
    });

    const response = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(200);
    const payroll = response.body.data;

    expect(payroll.daysInMonth).toBe(30);
    expect(payroll.presentDays).toBe(20);
    expect(payroll.paidLeaveDays).toBe(1);
    expect(payroll.unpaidDeductionDays).toBe(3); // 1 unpaid + (1 unapproved_absence × 2)
    expect(payroll.workingHoursTotal).toBe(160); // 20 × 8
    expect(payroll.mileageReimbursement).toBe(250); // (10 + 15) × default rate 10
    expect(payroll.grossAmount).toBe(21000); // (30000/30) × (20 + 1)
    expect(payroll.netAmount).toBe(18250); // 21000 − (3 × 1000) + 250
    // Compared via local date components, not a UTC toISOString() slice —
    // paidOn is constructed with `new Date(year, month, 1)` (local time), so
    // a UTC-string comparison would spuriously fail in any timezone ahead of
    // UTC (the local midnight rolls back a day once converted to UTC).
    const paidOn = new Date(payroll.paidOn);
    expect(paidOn.getFullYear()).toBe(2026);
    expect(paidOn.getMonth()).toBe(6); // July, 0-indexed
    expect(paidOn.getDate()).toBe(1);
  });

  it("counts a half-day (isHalfDay:true) paid leave as 0.5 toward paidLeaveDays, and a half-day unpaid leave as 0.5 toward unpaidDeductionDays", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(10),
      endDate: juneDate(10),
      type: "paid",
      status: "approved",
      isHalfDay: true,
      reason: "Test reason",
    });

    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(11),
      endDate: juneDate(11),
      type: "unpaid",
      status: "approved",
      isHalfDay: true,
      reason: "Test reason",
    });

    const response = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.paidLeaveDays).toBe(0.5);
    expect(response.body.data.unpaidDeductionDays).toBe(0.5);
  });

  it("rejects re-running an already-generated employee/month without regenerate", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    const first = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    expect(first.status).toBe(200);

    const second = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    expect(second.status).toBe(409);
  });

  it("recomputes in place when regenerate=true is passed", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    const first = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const firstId = first.body.data._id;

    await seedAttendance(sales1._id, [2, 3, 4]);

    const second = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}&regenerate=true`
    );

    expect(second.status).toBe(200);
    expect(second.body.data._id).toBe(firstId);
    expect(second.body.data.presentDays).toBe(3);
    expect(await Payroll.countDocuments({ employeeId: sales1._id, month: MONTH, year: YEAR })).toBe(1);
  });
});

describe("POST /payroll/run — bulk (no employeeId)", () => {
  it("generates payroll for every active employee with a baseSalary set, skipping the rest", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.patch(`/api/v1/users/${manager1._id}`).send({ baseSalary: 40000 });
    // sales2 deliberately left with no baseSalary set.

    const response = await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    expect(response.status).toBe(200);
    const generatedIds = response.body.data.generated.map((record) => String(record.employeeId));
    expect(generatedIds).toEqual(expect.arrayContaining([String(sales1._id), String(manager1._id)]));
    expect(generatedIds).not.toContain(String(sales2._id));

    const skippedIds = response.body.data.skipped.map((entry) => String(entry.employeeId));
    expect(skippedIds).toContain(String(sales2._id));
  });

  it("silently skips (does not error on) an employee already generated for that month on a second bulk run", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
    const second = await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    expect(second.status).toBe(200);
    const skippedIds = second.body.data.skipped.map((entry) => String(entry.employeeId));
    expect(skippedIds).toContain(String(sales1._id));
    expect(await Payroll.countDocuments({ employeeId: sales1._id, month: MONTH, year: YEAR })).toBe(1);
  });
});

describe("GET /payroll?scope=own|all", () => {
  it("scope=own (default) returns only the caller's own payroll records", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    await adminAgent.patch(`/api/v1/users/${manager1._id}`).send({ baseSalary: 40000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await employee1Agent.get("/api/v1/payroll");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(employee1._id));
  });

  it("scope=all is blocked for everyone except admin — manager included, since Payroll has no team tier", async () => {
    const managerResponse = await managerAgent.get("/api/v1/payroll?scope=all");
    expect(managerResponse.status).toBe(403);

    const employeeResponse = await employee1Agent.get("/api/v1/payroll?scope=all");
    expect(employeeResponse.status).toBe(403);

    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );

    const adminResponse = await adminAgent.get("/api/v1/payroll?scope=all");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(1);
  });

  it("an employee sees their own payroll via the default payroll.view grant", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await employee1Agent.get("/api/v1/payroll");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("a sales_associate with no override gets no payroll access at all — §5's matrix marks payroll.view/run as '–' for Sales Associate, same as Manager, not 'own payslip only' like Employee", async () => {
    const response = await sales1Agent.get("/api/v1/payroll");

    expect(response.status).toBe(403);
  });

  it("rejects an invalid scope value", async () => {
    const response = await employee1Agent.get("/api/v1/payroll?scope=team");

    expect(response.status).toBe(400);
  });
});

describe("GET /payroll/:id/payslip", () => {
  it("lets the employee download their own payslip as a PDF", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await employee1Agent
      .get(`/api/v1/payroll/${payrollId}/payslip`)
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("Phase 8 regression: still streams the PDF directly and does NOT return { downloadUrl } — this endpoint is a single-document artifact deliberately excluded from the report dispatcher migration (§7.11)", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await employee1Agent
      .get(`/api/v1/payroll/${payrollId}/payslip`)
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    // A migrated endpoint would respond `application/json` with a
    // `{ data: { downloadUrl } }` body instead — asserting the raw PDF bytes
    // directly proves that did NOT happen here.
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns 404 (not 403) for a sales_associate's own payslip — no payroll grant at all, collapsing 'no access' and 'out of scope' into the same signal as every other out-of-scope case here", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await sales1Agent.get(`/api/v1/payroll/${payrollId}/payslip`);

    expect(response.status).toBe(404);
  });

  it("lets an admin download anyone's payslip", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await adminAgent
      .get(`/api/v1/payroll/${payrollId}/payslip`)
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
  });

  it("returns 404 (not 403) for another employee's payslip — matches the Leads/Location/User out-of-scope precedent", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await sales2Agent.get(`/api/v1/payroll/${payrollId}/payslip`);

    expect(response.status).toBe(404);
  });

  it("returns 404 (not 403) for a manager — no payroll grant at all, even for their own direct report's payslip", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await managerAgent.get(`/api/v1/payroll/${payrollId}/payslip`);

    expect(response.status).toBe(404);
  });

  it("rejects an unsupported format", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;

    const response = await sales1Agent.get(`/api/v1/payroll/${payrollId}/payslip?format=xlsx`);

    expect(response.status).toBe(400);
  });
});
