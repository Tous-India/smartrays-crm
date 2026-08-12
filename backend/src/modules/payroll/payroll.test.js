import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { bufferParser } from "../../../tests/helpers/binaryResponse.js";
import Payroll from "./payroll.model.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import TravelLog from "../transport/travelLog.model.js";
import PayrollAdjustment from "./payrollAdjustment.model.js";

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
  await PayrollAdjustment.deleteMany({});
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
    expect(payroll.unpaidDeductionDays).toBe(3); // 2 unpaid + 1 surcharge day
    expect(payroll.doubleDeductionDays).toBe(1);
    expect(payroll.workingHoursTotal).toBe(160); // 20 × 8 — reported, never priced
    expect(payroll.mileageReimbursement).toBe(250); // (10 + 15) × default rate 10

    // GROSS is the agreed monthly salary (§7.53), not `dailyRate × days
    // attended`. Under the old formula this employee grossed 21,000 and netted
    // 18,250 — because only 20 of June's 30 days had an Attendance record and
    // the other 10 were priced as if unworked, though nobody ever marked them
    // absent. Missing data read as unpaid. The full salary is now the starting
    // point and only RECORDED absence takes anything off it.
    expect(payroll.grossAmount).toBe(30000);
    // 3 days away (paid 25th, unpaid 26th, unapproved 27th): the paid day is
    // free, leaving 2 unpaid plus a 1-day surcharge for the unapproved one.
    expect(payroll.deduction).toBe(3000); // 3 × (30000/30)
    expect(payroll.netAmount).toBe(27250); // 30000 − 3000 + 250 mileage
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

/** draft -> review -> approved, the two explicit transitions a payslip needs. */
async function approvePeriodInTest(month = MONTH, year = YEAR) {
  await adminAgent.post(`/api/v1/payroll/period/submit?month=${month}&year=${year}`);
  await adminAgent.post(`/api/v1/payroll/period/approve?month=${month}&year=${year}`);
}

describe("GET /payroll/:id/payslip", () => {
  it("lets the employee download their own payslip as a PDF", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    const runResponse = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payrollId = runResponse.body.data._id;
    // A draft has no payslip (§7.54) — its figures are still moving. Approve
    // the period first, which is what makes them final.
    await approvePeriodInTest();

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
    await approvePeriodInTest();

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
    await approvePeriodInTest();

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

/**
 * §7.47 — the monthly leave-and-attendance report endpoint.
 *
 * NEW endpoint with no prior version. The gate assertions are the ones that
 * matter: this returns EVERY employee's base salary in one response.
 *
 * The employee case genuinely failed first, with a 200 and the whole company's
 * salaries in the body — the route was gated on `payroll.view`, which sounds
 * right but means "own payslip only" and sits in the default employee
 * template. It is now gated on `payroll.run`, this module's existing
 * see-everyone tier.
 */
/**
 * §7.53 — Payroll consumes the shared calculator.
 *
 * These fail against the previous code, which computed its own gross from
 * attendance days, counted a half day as a whole one, and applied no monthly
 * cap to paid leave. The point of them is that there is now ONE implementation.
 */
describe("Payroll and the leave report agree, because they share a calculator", () => {
  it("produces IDENTICAL figures to the report for the same employee and month", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    // Deliberately no TravelLog for this employee: mileage is a Payroll-only
    // reimbursement the report does not carry, so leaving it at zero is what
    // makes "identical" a real claim rather than an approximate one.
    await seedAttendance(sales1._id, [2, 3, 4, 5, 6]);
    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(10),
      endDate: juneDate(10),
      type: "paid",
      status: "approved",
      reason: "Test reason",
    });
    await Leave.create({
      employeeId: sales1._id,
      startDate: juneDate(11),
      endDate: juneDate(12),
      type: "unpaid",
      status: "approved",
      reason: "Test reason",
    });

    const run = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    expect(run.status).toBe(200);
    const payroll = run.body.data;

    const report = await adminAgent.get(
      `/api/v1/payroll/monthly-report?year=${YEAR}&month=${MONTH}`
    );
    const row = report.body.data.rows.find((r) => r.employeeId === String(sales1._id));

    expect(row).toBeDefined();
    // Every figure that becomes money, compared directly.
    expect(payroll.presentDays).toBe(row.presentDays);
    expect(payroll.paidLeaveDays).toBe(row.paidLeave);
    expect(payroll.unpaidDeductionDays).toBe(row.unpaidLeave + row.doubleDeductionDays);
    expect(payroll.doubleDeductionDays).toBe(row.doubleDeductionDays);
    expect(payroll.grossAmount).toBe(row.baseSalary);
    expect(payroll.deduction).toBe(row.deduction);
    expect(payroll.netAmount).toBe(row.netPayable);
  });

  it("applies the 1-paid-day cap and the 2x unapproved-absence rule", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    // Two approved paid days in one month — only one may ever be credited.
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(5), endDate: juneDate(5),
      type: "paid", status: "approved", reason: "Test reason",
    });
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(6), endDate: juneDate(6),
      type: "paid", status: "approved", reason: "Test reason",
    });
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(7), endDate: juneDate(7),
      type: "unapproved_absence", status: "approved", isDoubleDeduction: true,
      reason: "Test reason",
    });

    const run = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const payroll = run.body.data;

    expect(payroll.paidLeaveDays).toBe(1);
    // 3 days away, 1 free -> 2 unpaid, plus a 1-day surcharge for the
    // unapproved absence = 3 chargeable days.
    expect(payroll.unpaidDeductionDays).toBe(3);
    expect(payroll.deduction).toBe(3000);
  });

  it("counts a half day as 0.5, not as a whole day", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await Attendance.create({
      employeeId: sales1._id, date: juneDate(3), status: "half_day",
      checkIn: { time: juneDate(3) },
      checkOut: { time: new Date(juneDate(3).getTime() + 4 * 60 * 60 * 1000) },
      workingHours: 4,
    });

    const run = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );

    // `countDocuments` used to make this 1.
    expect(run.body.data.presentDays).toBe(0.5);
  });

  it("does NOT let workingHours affect any amount", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.patch(`/api/v1/users/${sales2._id}`).send({ baseSalary: 30000 });

    // Same days present, wildly different recorded hours — a shift where no
    // heartbeat landed computes to zero working hours, and pay must not follow
    // it down.
    await seedAttendance(sales1._id, [2, 3, 4], 8);
    await seedAttendance(sales2._id, [2, 3, 4], 0.01);

    const first = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}`
    );
    const second = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales2._id}&month=${MONTH}&year=${YEAR}`
    );

    expect(first.body.data.workingHoursTotal).not.toBe(second.body.data.workingHoursTotal);
    expect(first.body.data.grossAmount).toBe(second.body.data.grossAmount);
    expect(first.body.data.deduction).toBe(second.body.data.deduction);
    expect(first.body.data.netAmount).toBe(second.body.data.netAmount);
  });

  it("REFUSES to price an employee with no baseSalary rather than paying them 0", async () => {
    // `afterEach` clears records, not users — an earlier test in this block
    // gives sales2 a salary, so unset it explicitly rather than depending on
    // the order tests happen to run in.
    await adminAgent.patch(`/api/v1/users/${sales2._id}`).send({ baseSalary: null });

    // The calculator returns null amounts for an unset salary; Payroll must not
    // turn that into a stored zero, which would read as "earned nothing".
    const response = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales2._id}&month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(400);
    expect(await Payroll.countDocuments({ employeeId: sales2._id })).toBe(0);
  });
});


/**
 * §7.54 — the pay run. NEW behaviour: none of this existed, so these do not
 * "fail first" against a previous implementation; there was no state machine,
 * no approval and no adjustment to fail against. What they pin is the set of
 * properties that make a payslip trustworthy.
 */
describe("The pay run: draft -> review -> approved -> paid", () => {
  async function seedDraft(salary = 30000, days = [2, 3, 4]) {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: salary });
    await seedAttendance(sales1._id, days);
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
  }

  it("writes DRAFT records, and re-running regenerates them from current data", async () => {
    await seedDraft();

    const first = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    expect(first.status).toBe("draft");

    // Something changes after the draft was cut.
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(10), endDate: juneDate(10),
      type: "unpaid", status: "approved", reason: "Test reason",
    });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}&regenerate=true`);

    const second = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    expect(second.deduction).toBeGreaterThan(first.deduction);
    expect(second.status).toBe("draft");
  });

  it("APPROVING LOCKS THE PERIOD — editing attendance afterwards does not move the figures", async () => {
    // The single most important property in this module. A payslip that
    // changes after it was issued is not a payslip; if a July attendance
    // record is edited in September, July's pay must be exactly what it was.
    await seedDraft();
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    const approval = await adminAgent.post(
      `/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`
    );
    expect(approval.status).toBe(200);

    const approved = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    const frozen = {
      presentDays: approved.presentDays,
      deduction: approved.deduction,
      netAmount: approved.netAmount,
    };
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).not.toBeNull();
    expect(approved.approvedAt).not.toBeNull();

    // Now change the world underneath it: three more absences and a wiped
    // attendance record. Under a recomputing design every figure would move.
    await Attendance.deleteMany({ employeeId: sales1._id });
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(15), endDate: juneDate(17),
      type: "unpaid", status: "approved", reason: "Test reason",
    });

    // A re-run must refuse rather than quietly recompute.
    const rerun = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${sales1._id}&month=${MONTH}&year=${YEAR}&regenerate=true`
    );
    expect(rerun.status).toBe(409);

    const after = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    expect(after.presentDays).toBe(frozen.presentDays);
    expect(after.deduction).toBe(frozen.deduction);
    expect(after.netAmount).toBe(frozen.netAmount);
  });

  it("a bulk re-run SKIPS an approved period instead of erroring on it", async () => {
    await seedDraft();
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);

    const rerun = await adminAgent.post(
      `/api/v1/payroll/run?month=${MONTH}&year=${YEAR}&regenerate=true`
    );

    expect(rerun.status).toBe(200);
    expect(rerun.body.data.skipped.some((one) => one.reason === "already approved")).toBe(true);
  });

  it("refuses transitions taken out of order", async () => {
    await seedDraft();

    // draft cannot jump straight to approved.
    const early = await adminAgent.post(
      `/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`
    );
    expect(early.status).toBe(409);

    // ...nor can a draft be marked paid.
    const paidTooEarly = await adminAgent.post(
      `/api/v1/payroll/period/paid?month=${MONTH}&year=${YEAR}`
    );
    expect(paidTooEarly.status).toBe(409);
  });

  it("marks an approved period paid, with a date and an actor", async () => {
    await seedDraft();
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent
      .post(`/api/v1/payroll/period/paid?month=${MONTH}&year=${YEAR}`)
      .send({ paidAt: "2026-07-02" });

    expect(response.status).toBe(200);
    const paid = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
    expect(paid.paidBy).not.toBeNull();
  });
});

describe("Corrections are adjustments on the NEXT run, never edits to history", () => {
  async function approvedPeriod() {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await seedAttendance(sales1._id, [2, 3, 4]);
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);
  }

  it("carries a correction onto the following month with its reason and actor", async () => {
    await approvedPeriod();

    const raised = await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: -1500, reason: "Overpaid: roster mark was wrong" });

    expect(raised.status).toBe(201);
    // Raised against June, payable in July — history is untouched.
    expect(raised.body.data.month).toBe(MONTH + 1);
    expect(raised.body.data.sourceMonth).toBe(MONTH);

    const june = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });
    expect(june.adjustments).toHaveLength(0);
    expect(june.netAmount).toBe(30000);

    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH + 1}&year=${YEAR}`);
    const july = await Payroll.findOne({ employeeId: sales1._id, month: MONTH + 1, year: YEAR });

    expect(july.adjustments).toHaveLength(1);
    expect(july.adjustments[0].reason).toBe("Overpaid: roster mark was wrong");
    expect(july.adjustments[0].createdBy).not.toBeNull();
    expect(july.adjustmentTotal).toBe(-1500);
    expect(july.netAmount).toBe(30000 - 1500);
  });

  it("does not double-count an adjustment when the next month's draft is re-run", async () => {
    await approvedPeriod();
    await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: 500, reason: "Underpaid" });

    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH + 1}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH + 1}&year=${YEAR}&regenerate=true`);

    const july = await Payroll.findOne({ employeeId: sales1._id, month: MONTH + 1, year: YEAR });
    expect(july.adjustments).toHaveLength(1);
    expect(july.adjustmentTotal).toBe(500);
  });

  it("puts an adjustment on a DRAFT period onto THAT run, not the next one", async () => {
    // §7.57 — on an open run this is a bonus or an other-deduction being added
    // while the run is prepared, not a correction to history. It therefore
    // lands on this period and carries no source period.
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: 2500, reason: "Festival bonus" });

    expect(response.status).toBe(201);
    expect(response.body.data.month).toBe(MONTH);
    expect(response.body.data.sourceMonth).toBeNull();

    // It reaches the run on the next regeneration, without being lost.
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}&regenerate=true`);
    const record = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });

    expect(record.adjustmentTotal).toBe(2500);
    expect(record.netAmount).toBe(30000 + 2500);
  });

  it("keeps bonus and deduction lines apart by SIGN on the same run", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: 3000, reason: "Bonus" });
    await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: -500, reason: "Equipment recovery" });

    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}&regenerate=true`);
    const record = await Payroll.findOne({ employeeId: sales1._id, month: MONTH, year: YEAR });

    expect(record.adjustments).toHaveLength(2);
    expect(record.adjustmentTotal).toBe(2500);
    expect(record.netAmount).toBe(30000 + 2500);
  });

  it("requires both an amount and a reason", async () => {
    await approvedPeriod();

    const noReason = await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, amount: 100 });
    expect(noReason.status).toBe(400);

    const noAmount = await adminAgent
      .post(`/api/v1/payroll/period/adjustments?month=${MONTH}&year=${YEAR}`)
      .send({ employeeId: sales1._id, reason: "No amount" });
    expect(noAmount.status).toBe(400);
  });
});

describe("GET /payroll/periods — the /payroll page's run list (§7.57)", () => {
  it("returns every month of the year, including months with NO run", async () => {
    // A payroll that silently skipped March is exactly what a list of runs
    // exists to catch, so an empty month is a row rather than an omission.
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent.get(`/api/v1/payroll/periods?year=${YEAR}`);

    expect(response.status).toBe(200);
    expect(response.body.data.rows).toHaveLength(12);
    // Most recent first.
    expect(response.body.data.rows[0].month).toBe(12);
    expect(response.body.data.rows[11].month).toBe(1);

    // Counted against the records actually written rather than a hardcoded
    // number — `afterEach` clears Payroll but not the salaries earlier tests
    // set, so a bulk run legitimately covers more than one employee.
    const written = await Payroll.find({ month: MONTH, year: YEAR });
    const june = response.body.data.rows.find((row) => row.month === MONTH);

    expect(june.status).toBe("draft");
    expect(june.employeeCount).toBe(written.length);
    expect(june.grossTotal).toBe(written.reduce((total, one) => total + one.grossAmount, 0));
    expect(june.netTotal).toBe(written.reduce((total, one) => total + one.netAmount, 0));
    expect(june.generatedAt).not.toBeNull();

    const march = response.body.data.rows.find((row) => row.month === 3);
    expect(march.status).toBeNull();
    expect(march.employeeCount).toBe(0);
  });

  it("offers the years that have runs, plus the current year", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent.get(`/api/v1/payroll/periods?year=${YEAR}`);

    expect(response.body.data.years).toContain(YEAR);
    expect(response.body.data.years).toContain(new Date().getFullYear());
  });

  it("reports a period as its LEAST advanced record", async () => {
    // One unapproved employee means the period is not approved, however the
    // rest of it looks.
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);

    await Payroll.updateOne(
      { employeeId: sales1._id, month: MONTH, year: YEAR },
      { $set: { status: "draft" } }
    );

    const response = await adminAgent.get(`/api/v1/payroll/periods?year=${YEAR}`);
    const june = response.body.data.rows.find((row) => row.month === MONTH);

    expect(june.status).toBe("draft");
  });

  it("names who approved and when, once a period is approved", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent.get(`/api/v1/payroll/periods?year=${YEAR}`);
    const june = response.body.data.rows.find((row) => row.month === MONTH);

    expect(june.status).toBe("approved");
    expect(june.approvedBy).toBe("Admin");
    expect(june.approvedAt).not.toBeNull();
  });

  it("refuses an employee holding only payroll.view", async () => {
    const response = await employee1Agent.get(`/api/v1/payroll/periods?year=${YEAR}`);

    expect(response.status).toBe(403);
  });
});

describe("The review screen flags anomalies without blocking", () => {
  it("lists every active employee and flags the rows worth a second look", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.patch(`/api/v1/users/${sales2._id}`).send({ baseSalary: null });
    await seedAttendance(sales1._id, [2, 3, 4]);
    // A long unpaid absence — legitimate, but the same shape a bad roster mark
    // takes, so it is flagged rather than blocked.
    await Leave.create({
      employeeId: sales1._id, startDate: juneDate(10), endDate: juneDate(25),
      type: "unpaid", status: "approved", reason: "Test reason",
    });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent.get(
      `/api/v1/payroll/period/review?month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(200);
    const review = response.body.data;
    const codesFor = (id) =>
      review.rows.find((row) => row.employeeId === String(id))?.anomalies.map((a) => a.code) || [];

    expect(codesFor(sales1._id)).toContain("HIGH_DEDUCTION");
    // No salary, and therefore no record either — both stated separately.
    expect(codesFor(sales2._id)).toContain("NO_BASE_SALARY");
    expect(codesFor(sales2._id)).toContain("NO_RECORD");
    expect(review.totals.flagged).toBeGreaterThan(0);
  });

  it("flags an employee with no attendance at all for the month", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);

    const response = await adminAgent.get(
      `/api/v1/payroll/period/review?month=${MONTH}&year=${YEAR}`
    );
    const row = response.body.data.rows.find((r) => r.employeeId === String(sales1._id));

    expect(row.anomalies.map((a) => a.code)).toContain("NO_ATTENDANCE");
    // Flagged, NOT withheld — they are still paid their salary.
    expect(row.netAmount).toBe(30000);
  });
});

describe("payroll.view cannot reach any company-wide pay-run endpoint", () => {
  // `payroll.view` means own-payslip-only and sits in the DEFAULT employee
  // template, so gating any of these on it would hand every employee the whole
  // company's pay.
  it.each([
    ["get", "/period/review"],
    ["post", "/period/submit"],
    ["post", "/period/approve"],
    ["post", "/period/paid"],
    ["post", "/period/adjustments"],
  ])("refuses %s %s for an employee holding payroll.view", async (method, path) => {
    const response = await employee1Agent[method](
      `/api/v1/payroll${path}?month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(403);
  });
});

describe("The cron endpoint generates DRAFTS only, behind CRON_SECRET", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("503s when CRON_SECRET is unset — fail closed, never open", async () => {
    delete process.env.CRON_SECRET;

    const response = await request(app).get(
      `/api/v1/payroll/cron/run?month=${MONTH}&year=${YEAR}`
    );

    expect(response.status).toBe(503);
  });

  it("401s on a wrong or missing secret", async () => {
    process.env.CRON_SECRET = "right-secret";

    const missing = await request(app).get("/api/v1/payroll/cron/run");
    expect(missing.status).toBe(401);

    const wrong = await request(app)
      .get("/api/v1/payroll/cron/run")
      .set("Authorization", "Bearer wrong-secret");
    expect(wrong.status).toBe(401);
  });

  it("accepts GET as well as POST — Vercel Cron issues GET", async () => {
    process.env.CRON_SECRET = "right-secret";
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    const viaGet = await request(app)
      .get(`/api/v1/payroll/cron/run?month=${MONTH}&year=${YEAR}`)
      .set("Authorization", "Bearer right-secret");
    expect(viaGet.status).toBe(200);

    const viaPost = await request(app)
      .post(`/api/v1/payroll/cron/run?month=${MONTH}&year=${YEAR}`)
      .set("Authorization", "Bearer right-secret");
    expect(viaPost.status).toBe(200);
  });

  it("creates DRAFTS and never approves — a machine must not decide what people are paid", async () => {
    process.env.CRON_SECRET = "right-secret";
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    const response = await request(app)
      .get(`/api/v1/payroll/cron/run?month=${MONTH}&year=${YEAR}`)
      .set("Authorization", "Bearer right-secret");

    expect(response.body.data.status).toBe("draft");
    const records = await Payroll.find({ month: MONTH, year: YEAR });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.status === "draft")).toBe(true);
  });

  it("cannot move an already-approved period", async () => {
    process.env.CRON_SECRET = "right-secret";
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });
    await adminAgent.post(`/api/v1/payroll/run?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/submit?month=${MONTH}&year=${YEAR}`);
    await adminAgent.post(`/api/v1/payroll/period/approve?month=${MONTH}&year=${YEAR}`);

    await request(app)
      .get(`/api/v1/payroll/cron/run?month=${MONTH}&year=${YEAR}`)
      .set("Authorization", "Bearer right-secret");

    const records = await Payroll.find({ month: MONTH, year: YEAR });
    expect(records.every((record) => record.status === "approved")).toBe(true);
  });
});

describe("The payslip renders from STORED figures", () => {
  it("refuses to issue one for a draft — its numbers are still moving", async () => {
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    const run = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );

    const response = await employee1Agent.get(`/api/v1/payroll/${run.body.data._id}/payslip`);

    expect(response.status).toBe(409);
  });

  it("renders an approved payslip even after the underlying attendance is deleted", async () => {
    // Proof it reads the record, not the world.
    await adminAgent.patch(`/api/v1/users/${employee1._id}`).send({ baseSalary: 25000 });
    await seedAttendance(employee1._id, [2, 3, 4]);
    const run = await adminAgent.post(
      `/api/v1/payroll/run?employeeId=${employee1._id}&month=${MONTH}&year=${YEAR}`
    );
    await approvePeriodInTest();

    await Attendance.deleteMany({ employeeId: employee1._id });

    const response = await employee1Agent
      .get(`/api/v1/payroll/${run.body.data._id}/payslip`)
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("GET /payroll/monthly-report — access and shape", () => {
  it("REFUSES an employee, who HOLDS payroll.view — that grant is own-payslip-only", async () => {
    const response = await employee1Agent.get("/api/v1/payroll/monthly-report?year=2026&month=8");

    expect(response.status).toBe(403);
  });

  it("REFUSES a manager and a sales associate, who hold no payroll grant at all", async () => {
    const managerResponse = await managerAgent.get(
      "/api/v1/payroll/monthly-report?year=2026&month=8"
    );
    const salesResponse = await sales1Agent.get("/api/v1/payroll/monthly-report?year=2026&month=8");

    expect(managerResponse.status).toBe(403);
    expect(salesResponse.status).toBe(403);
  });

  it("leaks no salary figure in the refused response", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 30000 });

    const response = await employee1Agent.get("/api/v1/payroll/monthly-report?year=2026&month=8");

    expect(JSON.stringify(response.body)).not.toContain("30000");
  });

  it("allows an admin and returns one row per active employee", async () => {
    const response = await adminAgent.get("/api/v1/payroll/monthly-report?year=2026&month=8");

    expect(response.status).toBe(200);
    expect(response.body.data.year).toBe(2026);
    expect(response.body.data.month).toBe(8);
    expect(Array.isArray(response.body.data.rows)).toBe(true);
    expect(response.body.data.rows.length).toBeGreaterThan(0);
  });

  it("returns the calculator's own shape, not a second computation", async () => {
    const response = await adminAgent.get("/api/v1/payroll/monthly-report?year=2026&month=8");
    const row = response.body.data.rows[0];

    for (const key of [
      "employeeId",
      "name",
      "baseSalary",
      "calendarDays",
      // §7.49 — the annual balance columns.
      "leaveYear",
      "oldBalance",
      "monthCredit",
      "balance",
      "presentDays",
      "absentDays",
      "paidLeave",
      "unpaidLeave",
      "doubleDeductionDays",
      "deduction",
      "netPayable",
    ]) {
      expect(row).toHaveProperty(key);
    }

    expect(row.calendarDays).toBe(31);
  });

  it("rejects a month outside 1-12", async () => {
    const response = await adminAgent.get("/api/v1/payroll/monthly-report?year=2026&month=13");

    expect(response.status).toBe(400);
  });
});
