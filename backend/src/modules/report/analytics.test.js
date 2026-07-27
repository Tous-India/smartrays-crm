import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Lead from "../lead/lead.model.js";
import Customer from "../customer/customer.model.js";
import Contract from "../customer/contract.model.js";
import AMC from "../amc/amc.model.js";
import Payment from "../payment/payment.model.js";
import Attendance from "../attendance/attendance.model.js";
import Payroll from "../payroll/payroll.model.js";

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent, employee1Agent;
let admin, manager1, sales1, sales2, sales3, employee1;

function sortBy(array, key) {
  return [...array].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
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

  // Deliberately NOT on manager1's team — proves manager/admin scoping
  // actually excludes an unaffiliated sales_associate, not just "everyone".
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
  await Lead.deleteMany({});
  await Customer.deleteMany({});
  await Contract.deleteMany({});
  await AMC.deleteMany({});
  await Payment.deleteMany({});
  await Attendance.deleteMany({});
  await Payroll.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("GET /reports/analytics/leads-pipeline", () => {
  it("admin sees every lead org-wide, grouped by status", async () => {
    await Lead.create({ name: "A", ownerId: sales1._id, clientType: "residential", status: "new" });
    await Lead.create({ name: "B", ownerId: sales3._id, clientType: "residential", status: "won" });

    const response = await adminAgent.get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(200);
    expect(sortBy(response.body.data, "status")).toEqual([
      { status: "new", count: 1 },
      { status: "won", count: 1 },
    ]);
  });

  it("a manager sees only their team's leads (sales1+sales2), not sales3's", async () => {
    await Lead.create({ name: "A", ownerId: sales1._id, clientType: "residential", status: "new" });
    await Lead.create({ name: "B", ownerId: sales2._id, clientType: "residential", status: "new" });
    await Lead.create({ name: "C", ownerId: sales3._id, clientType: "residential", status: "new" });

    const response = await managerAgent.get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ status: "new", count: 2 }]);
  });

  it("a sales_associate sees only their own leads", async () => {
    await Lead.create({ name: "A", ownerId: sales1._id, clientType: "residential", status: "won" });
    await Lead.create({ name: "B", ownerId: sales3._id, clientType: "residential", status: "won" });

    const response = await sales1Agent.get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ status: "won", count: 1 }]);
  });

  it("returns an empty array, not an error, when there are no leads at all", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("blocks a role with no leads.view grant", async () => {
    const response = await employee1Agent.get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(403);
  });
});

describe("GET /reports/analytics/leads-conversion", () => {
  it("computes totalLeads/wonLeads/conversionRate per createdAt month", async () => {
    await Lead.create({
      name: "A",
      ownerId: admin._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(Date.UTC(2026, 5, 10)),
    });
    await Lead.create({
      name: "B",
      ownerId: admin._id,
      clientType: "residential",
      status: "new",
      createdAt: new Date(Date.UTC(2026, 5, 15)),
    });
    await Lead.create({
      name: "C",
      ownerId: admin._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(Date.UTC(2026, 6, 1)),
    });

    const response = await adminAgent.get("/api/v1/reports/analytics/leads-conversion");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { month: "2026-06", totalLeads: 2, wonLeads: 1, conversionRate: 50 },
      { month: "2026-07", totalLeads: 1, wonLeads: 1, conversionRate: 100 },
    ]);
  });

  it("filters by from/to, excluding leads created outside the range", async () => {
    await Lead.create({
      name: "InRange",
      ownerId: admin._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(2026, 5, 10),
    });
    await Lead.create({
      name: "OutOfRange",
      ownerId: admin._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(2026, 6, 10),
    });

    const response = await adminAgent.get(
      "/api/v1/reports/analytics/leads-conversion?from=2026-06-01&to=2026-06-30",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", totalLeads: 1, wonLeads: 1, conversionRate: 100 }]);
  });

  it("a manager only sees their team's leads reflected in the trend", async () => {
    await Lead.create({
      name: "Team",
      ownerId: sales1._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(2026, 5, 10),
    });
    await Lead.create({
      name: "NotTeam",
      ownerId: sales3._id,
      clientType: "residential",
      status: "won",
      createdAt: new Date(2026, 5, 12),
    });

    const response = await managerAgent.get("/api/v1/reports/analytics/leads-conversion");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", totalLeads: 1, wonLeads: 1, conversionRate: 100 }]);
  });

  it("returns an empty array when there are no leads in range", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/leads-conversion");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /reports/analytics/leads-by-source and /leads-by-client-type", () => {
  it("groups by source, own-only for a sales_associate", async () => {
    await Lead.create({ name: "A", ownerId: sales1._id, clientType: "residential", source: "Website" });
    await Lead.create({ name: "B", ownerId: sales1._id, clientType: "residential", source: "Referral" });
    await Lead.create({ name: "C", ownerId: sales3._id, clientType: "residential", source: "Website" });

    const response = await sales1Agent.get("/api/v1/reports/analytics/leads-by-source");

    expect(response.status).toBe(200);
    expect(sortBy(response.body.data, "source")).toEqual([
      { source: "Referral", count: 1 },
      { source: "Website", count: 1 },
    ]);
  });

  it("groups by clientType, org-wide for admin", async () => {
    await Lead.create({ name: "A", ownerId: sales1._id, clientType: "residential" });
    await Lead.create({ name: "B", ownerId: sales3._id, clientType: "commercial" });

    const response = await adminAgent.get("/api/v1/reports/analytics/leads-by-client-type");

    expect(response.status).toBe(200);
    expect(sortBy(response.body.data, "clientType")).toEqual([
      { clientType: "commercial", count: 1 },
      { clientType: "residential", count: 1 },
    ]);
  });

  it("blocks a role with no leads.view grant on both endpoints", async () => {
    expect((await employee1Agent.get("/api/v1/reports/analytics/leads-by-source")).status).toBe(403);
    expect((await employee1Agent.get("/api/v1/reports/analytics/leads-by-client-type")).status).toBe(403);
  });

  it("returns an empty array for both when there are no leads", async () => {
    expect((await adminAgent.get("/api/v1/reports/analytics/leads-by-source")).body.data).toEqual([]);
    expect((await adminAgent.get("/api/v1/reports/analytics/leads-by-client-type")).body.data).toEqual([]);
  });
});

describe("GET /reports/analytics/customers-growth", () => {
  it("groups new customers by signedUpAt month, date-range filtered", async () => {
    await Customer.create({
      companyName: "June Co",
      ownerId: admin._id,
      projectManagerId: admin._id,
      signedUpAt: new Date(2026, 5, 5),
    });
    await Customer.create({
      companyName: "July Co",
      ownerId: admin._id,
      projectManagerId: admin._id,
      signedUpAt: new Date(2026, 6, 5),
    });

    const response = await adminAgent.get(
      "/api/v1/reports/analytics/customers-growth?from=2026-06-01&to=2026-06-30",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", newCustomers: 1 }]);
  });

  it("a manager sees only their team's customers", async () => {
    await Customer.create({
      companyName: "Team Co",
      ownerId: sales1._id,
      projectManagerId: admin._id,
      signedUpAt: new Date(2026, 5, 5),
    });
    await Customer.create({
      companyName: "Not Team Co",
      ownerId: sales3._id,
      projectManagerId: admin._id,
      signedUpAt: new Date(2026, 5, 6),
    });

    const response = await managerAgent.get("/api/v1/reports/analytics/customers-growth");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", newCustomers: 1 }]);
  });

  it("returns an empty array when there are no customers", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/customers-growth");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("blocks a role with no customers.view grant", async () => {
    const response = await employee1Agent.get("/api/v1/reports/analytics/customers-growth");

    expect(response.status).toBe(403);
  });
});

describe("GET /reports/analytics/customers-status-split", () => {
  it("splits active vs inactive, scoped to a sales_associate's own customers", async () => {
    await Customer.create({
      companyName: "Own Active",
      ownerId: sales1._id,
      projectManagerId: admin._id,
      customerStatus: "active",
    });
    await Customer.create({
      companyName: "Own Inactive",
      ownerId: sales1._id,
      projectManagerId: admin._id,
      customerStatus: "inactive",
    });
    await Customer.create({
      companyName: "Not Own",
      ownerId: sales3._id,
      projectManagerId: admin._id,
      customerStatus: "active",
    });

    const response = await sales1Agent.get("/api/v1/reports/analytics/customers-status-split");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ active: 1, inactive: 1 });
  });

  it("returns {active:0, inactive:0}, not an error, when there are no customers", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/customers-status-split");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ active: 0, inactive: 0 });
  });
});

describe("GET /reports/analytics/customers-contract-value", () => {
  it("sums contract amounts and counts, grouped by type, scoped via the underlying customer's ownership", async () => {
    const ownCustomer = await Customer.create({
      companyName: "Own Co",
      ownerId: sales1._id,
      projectManagerId: admin._id,
    });
    const otherCustomer = await Customer.create({
      companyName: "Other Co",
      ownerId: sales3._id,
      projectManagerId: admin._id,
    });
    await Contract.create({ customerId: ownCustomer._id, type: "monthly", amount: 5000 });
    await Contract.create({ customerId: ownCustomer._id, type: "monthly", amount: 3000 });
    await Contract.create({ customerId: otherCustomer._id, type: "onetime", amount: 20000 });

    const response = await sales1Agent.get("/api/v1/reports/analytics/customers-contract-value");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ type: "monthly", totalValue: 8000, count: 2 }]);
  });

  it("admin sees contract value across every customer", async () => {
    const customer = await Customer.create({
      companyName: "Any Co",
      ownerId: sales1._id,
      projectManagerId: admin._id,
    });
    await Contract.create({ customerId: customer._id, type: "yearly", amount: 50000 });

    const response = await adminAgent.get("/api/v1/reports/analytics/customers-contract-value");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ type: "yearly", totalValue: 50000, count: 1 }]);
  });

  it("treats a null contract amount as 0 rather than breaking the sum", async () => {
    const customer = await Customer.create({
      companyName: "No Amount Co",
      ownerId: admin._id,
      projectManagerId: admin._id,
    });
    await Contract.create({ customerId: customer._id, type: "onetime" });

    const response = await adminAgent.get("/api/v1/reports/analytics/customers-contract-value");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ type: "onetime", totalValue: 0, count: 1 }]);
  });

  it("returns an empty array when there are no contracts", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/customers-contract-value");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /reports/analytics/payments-trend", () => {
  it("sums payment amounts by month, date-range filtered, admin-only", async () => {
    await Payment.create({
      manualClientName: "A",
      date: new Date(Date.UTC(2026, 5, 5)),
      amount: 1000,
      recordedBy: admin._id,
    });
    await Payment.create({
      manualClientName: "B",
      date: new Date(Date.UTC(2026, 5, 20)),
      amount: 500,
      recordedBy: admin._id,
    });
    await Payment.create({
      manualClientName: "C",
      date: new Date(Date.UTC(2026, 6, 1)),
      amount: 700,
      recordedBy: admin._id,
    });

    const response = await adminAgent.get(
      "/api/v1/reports/analytics/payments-trend?from=2026-06-01&to=2026-06-30",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", totalAmount: 1500 }]);
  });

  it("blocks a manager — Payments has no manager tier at all", async () => {
    const response = await managerAgent.get("/api/v1/reports/analytics/payments-trend");

    expect(response.status).toBe(403);
  });

  it("returns an empty array when there are no payments", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/payments-trend");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /reports/analytics/amc-renewals-upcoming", () => {
  it("lists AMC records renewing within the day window, scoped to a sales_associate's own customers", async () => {
    const ownCustomer = await Customer.create({
      companyName: "Own Co",
      ownerId: sales1._id,
      projectManagerId: admin._id,
    });
    const otherCustomer = await Customer.create({
      companyName: "Other Co",
      ownerId: sales3._id,
      projectManagerId: admin._id,
    });

    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 10);
    const farOut = new Date(now);
    farOut.setDate(farOut.getDate() + 90);

    await AMC.create({
      customerId: ownCustomer._id,
      amount: 12000,
      startDate: now,
      renewalDate: soon,
      createdFromFlow: "existing_customer",
    });
    await AMC.create({
      customerId: ownCustomer._id,
      amount: 5000,
      startDate: now,
      renewalDate: farOut,
      createdFromFlow: "existing_customer",
    });
    await AMC.create({
      customerId: otherCustomer._id,
      amount: 8000,
      startDate: now,
      renewalDate: soon,
      createdFromFlow: "existing_customer",
    });

    const response = await sales1Agent.get("/api/v1/reports/analytics/amc-renewals-upcoming?days=30");

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(1);
    expect(response.body.data.renewals[0].customerName).toBe("Own Co");
    expect(response.body.data.renewals[0].amount).toBe(12000);
  });

  it("defaults to a 30-day window when days is omitted", async () => {
    const customer = await Customer.create({
      companyName: "Any Co",
      ownerId: admin._id,
      projectManagerId: admin._id,
    });
    const now = new Date();
    const in60Days = new Date(now);
    in60Days.setDate(in60Days.getDate() + 60);

    await AMC.create({
      customerId: customer._id,
      startDate: now,
      renewalDate: in60Days,
      createdFromFlow: "existing_customer",
    });

    const response = await adminAgent.get("/api/v1/reports/analytics/amc-renewals-upcoming");

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(0);
  });

  it("returns {count: 0, renewals: []}, not an error, when nothing is upcoming", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/amc-renewals-upcoming");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 0, renewals: [] });
  });

  it("blocks a role with no amc.view grant", async () => {
    const response = await employee1Agent.get("/api/v1/reports/analytics/amc-renewals-upcoming");

    expect(response.status).toBe(403);
  });
});

describe("GET /reports/analytics/attendance-trend", () => {
  it("computes attendanceRate per month, admin (view_all) sees every employee", async () => {
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 5, 1)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 1)) },
      status: "present",
    });
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 5, 2)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 2)) },
      status: "absent",
    });
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 5, 3)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 3)) },
      status: "half_day",
    });

    const response = await adminAgent.get("/api/v1/reports/analytics/attendance-trend");

    expect(response.status).toBe(200);
    // 1 present + 0.5 half_day out of 3 total = 50%
    expect(response.body.data).toEqual([{ month: "2026-06", attendanceRate: 50 }]);
  });

  it("a manager (view_team) only sees their direct reports' attendance", async () => {
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 5, 1)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 1)) },
      status: "present",
    });
    await Attendance.create({
      employeeId: sales3._id,
      date: new Date(Date.UTC(2026, 5, 1)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 1)) },
      status: "absent",
    });

    const response = await managerAgent.get("/api/v1/reports/analytics/attendance-trend");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", attendanceRate: 100 }]);
  });

  it("filters by from/to", async () => {
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 5, 1)),
      checkIn: { time: new Date(Date.UTC(2026, 5, 1)) },
      status: "present",
    });
    await Attendance.create({
      employeeId: sales1._id,
      date: new Date(Date.UTC(2026, 6, 1)),
      checkIn: { time: new Date(Date.UTC(2026, 6, 1)) },
      status: "absent",
    });

    const response = await adminAgent.get(
      "/api/v1/reports/analytics/attendance-trend?from=2026-06-01&to=2026-06-30",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", attendanceRate: 100 }]);
  });

  it("returns an empty array when there are no attendance records", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/attendance-trend");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("blocks a role with no attendance.view_team/view_all grant", async () => {
    const response = await sales1Agent.get("/api/v1/reports/analytics/attendance-trend");

    expect(response.status).toBe(403);
  });
});

describe("GET /reports/analytics/payroll-cost-trend", () => {
  function payrollFixture(overrides) {
    return {
      employeeId: employee1._id,
      daysInMonth: 30,
      presentDays: 28,
      paidLeaveDays: 1,
      unpaidDeductionDays: 1,
      workingHoursTotal: 200,
      grossAmount: 20000,
      netAmount: 20000,
      mileageReimbursement: 0,
      generatedAt: new Date(),
      paidOn: new Date(),
      ...overrides,
    };
  }

  it("sums netAmount grouped by year/month, admin-only", async () => {
    await Payroll.create(payrollFixture({ month: 6, year: 2026, netAmount: 20000 }));
    await Payroll.create(payrollFixture({ employeeId: sales1._id, month: 6, year: 2026, netAmount: 15000 }));
    await Payroll.create(payrollFixture({ month: 7, year: 2026, netAmount: 18000 }));

    const response = await adminAgent.get("/api/v1/reports/analytics/payroll-cost-trend");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { month: "2026-06", totalCost: 35000 },
      { month: "2026-07", totalCost: 18000 },
    ]);
  });

  it("filters by from/to month bounds", async () => {
    await Payroll.create(payrollFixture({ month: 5, year: 2026, netAmount: 10000 }));
    await Payroll.create(payrollFixture({ month: 6, year: 2026, netAmount: 20000 }));
    await Payroll.create(payrollFixture({ month: 7, year: 2026, netAmount: 30000 }));

    const response = await adminAgent.get(
      "/api/v1/reports/analytics/payroll-cost-trend?from=2026-06-01&to=2026-06-30",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ month: "2026-06", totalCost: 20000 }]);
  });

  it("blocks a manager — Payroll has no manager grant at all", async () => {
    const response = await managerAgent.get("/api/v1/reports/analytics/payroll-cost-trend");

    expect(response.status).toBe(403);
  });

  it("returns an empty array when there is no payroll history", async () => {
    const response = await adminAgent.get("/api/v1/reports/analytics/payroll-cost-trend");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /reports/analytics/* — authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const request = (await import("supertest")).default;
    const response = await request(app).get("/api/v1/reports/analytics/leads-pipeline");

    expect(response.status).toBe(401);
  });
});
