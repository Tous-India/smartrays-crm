import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import AMC from "./amc.model.js";
import Customer from "../customer/customer.model.js";

let app;
let adminAgent, manager1Agent, sales1Agent, sales2Agent, employee1Agent;
let admin, manager1, sales1, sales2;
let customerOwnedBySales1, customerOwnedBySales2;

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

  const manager1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager One",
    email: "manager1@test.local",
    password: "Password123",
    role: "manager",
  });
  manager1 = manager1Response.body.data;
  manager1Agent = await loginAsAgent(app, "manager1@test.local", "Password123");

  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1._id,
  });
  sales1 = sales1Response.body.data;
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  // Deliberately NOT on manager1's team.
  const sales2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales Two",
    email: "sales2@test.local",
    password: "Password123",
    role: "sales_associate",
  });
  sales2 = sales2Response.body.data;
  sales2Agent = await loginAsAgent(app, "sales2@test.local", "Password123");

  const employee1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee One",
    email: "employee1@test.local",
    password: "Password123",
    role: "employee",
  });
  employee1Agent = await loginAsAgent(app, "employee1@test.local", "Password123");

  customerOwnedBySales1 = await Customer.create({
    companyName: "Sales1's Customer",
    ownerId: sales1._id,
    projectManagerId: admin._id,
  });
  customerOwnedBySales2 = await Customer.create({
    companyName: "Sales2's Customer",
    ownerId: sales2._id,
    projectManagerId: admin._id,
  });
});

afterEach(async () => {
  await AMC.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /amc — existing_customer flow", () => {
  it("lets admin create an AMC record for any existing customer", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      amount: 12000,
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe(String(customerOwnedBySales1._id));
    expect(response.body.data.createdFromFlow).toBe("existing_customer");
    expect(response.body.data.status).toBe("active");
  });

  it("lets sales1 create an AMC record for their own customer", async () => {
    const response = await sales1Agent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(201);
  });

  it("rejects sales1 creating an AMC record for sales2's customer — outside their scope", async () => {
    const response = await sales1Agent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales2._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a nonexistent customerId", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: "507f1f77bcf86cd799439011",
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing customerId for this flow", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /amc — new_customer flow", () => {
  it("creates a real Customer inline and links the new AMC record to it", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "new_customer",
      newCustomerPayload: {
        companyName: "Brand New Co",
        projectManagerId: String(admin._id),
      },
      amount: 15000,
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.createdFromFlow).toBe("new_customer");

    const createdCustomer = await Customer.findById(response.body.data.customerId);
    expect(createdCustomer).not.toBeNull();
    expect(createdCustomer.companyName).toBe("Brand New Co");
  });

  it("rejects a missing newCustomerPayload for this flow", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "new_customer",
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });

  it("rejects an incomplete newCustomerPayload (missing required companyName/projectManagerId)", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "new_customer",
      newCustomerPayload: { companyName: "Missing PM Co" },
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /amc — validation and access", () => {
  it("rejects an invalid flow value", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "some_other_flow",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing/invalid startDate or renewalDate", async () => {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(400);
  });

  it("blocks an employee (no amc grant at all)", async () => {
    const response = await employee1Agent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    expect(response.status).toBe(403);
  });
});

describe("GET /amc — ownership scoping", () => {
  it("admin sees every AMC record", async () => {
    await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });
    await AMC.create({
      customerId: customerOwnedBySales2._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("a manager sees AMC records for their own team's customers ('own team'), not an unaffiliated sales associate's", async () => {
    await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });
    await AMC.create({
      customerId: customerOwnedBySales2._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const response = await manager1Agent.get("/api/v1/amc");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].customerId).toBe(String(customerOwnedBySales1._id));
  });

  it("a sales_associate sees only AMC records for their own customers ('own')", async () => {
    await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });
    await AMC.create({
      customerId: customerOwnedBySales2._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const sales1Response = await sales1Agent.get("/api/v1/amc");
    expect(sales1Response.status).toBe(200);
    expect(sales1Response.body.data).toHaveLength(1);
    expect(sales1Response.body.data[0].customerId).toBe(String(customerOwnedBySales1._id));

    const sales2Response = await sales2Agent.get("/api/v1/amc");
    expect(sales2Response.status).toBe(200);
    expect(sales2Response.body.data).toHaveLength(1);
    expect(sales2Response.body.data[0].customerId).toBe(String(customerOwnedBySales2._id));
  });

  it("blocks an employee (no amc grant at all)", async () => {
    const response = await employee1Agent.get("/api/v1/amc");

    expect(response.status).toBe(403);
  });
});

describe("PATCH /amc/:id", () => {
  it("lets admin update amount/status/dates", async () => {
    const amc = await AMC.create({
      customerId: customerOwnedBySales1._id,
      amount: 10000,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const response = await adminAgent.patch(`/api/v1/amc/${amc._id}`).send({
      amount: 12000,
      status: "expired",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe(12000);
    expect(response.body.data.status).toBe("expired");
  });

  it("lets sales1 update their own AMC record but not sales2's (404, out of scope)", async () => {
    const ownAmc = await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });
    const otherAmc = await AMC.create({
      customerId: customerOwnedBySales2._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const ownResponse = await sales1Agent.patch(`/api/v1/amc/${ownAmc._id}`).send({ status: "expired" });
    expect(ownResponse.status).toBe(200);

    const otherResponse = await sales1Agent.patch(`/api/v1/amc/${otherAmc._id}`).send({ status: "expired" });
    expect(otherResponse.status).toBe(404);
  });

  it("rejects an invalid status value", async () => {
    const amc = await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const response = await adminAgent.patch(`/api/v1/amc/${amc._id}`).send({ status: "renewed" });

    expect(response.status).toBe(400);
  });

  it("never auto-expires a record whose renewalDate has passed — status only changes via an explicit PATCH", async () => {
    const amc = await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2020-01-01"),
      renewalDate: new Date("2021-01-01"), // long past
      createdFromFlow: "existing_customer",
    });

    const response = await adminAgent.get("/api/v1/amc");
    const fetched = response.body.data.find((record) => record._id === String(amc._id));

    expect(fetched.status).toBe("active");
  });

  it("blocks an employee (no amc grant at all)", async () => {
    const amc = await AMC.create({
      customerId: customerOwnedBySales1._id,
      startDate: new Date("2026-01-01"),
      renewalDate: new Date("2027-01-01"),
      createdFromFlow: "existing_customer",
    });

    const response = await employee1Agent.patch(`/api/v1/amc/${amc._id}`).send({ status: "expired" });

    expect(response.status).toBe(403);
  });
});

/**
 * `?customerId=` (2026-08-05) — added for the Customer Detail page's AMC
 * section. Layered ON TOP of role scoping, never replacing it.
 */
describe("GET /amc?customerId= — per-customer filter", () => {
  it("returns only that customer's AMC records", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales2._id),
      startDate: "2026-02-01",
      renewalDate: "2027-02-01",
    });

    const response = await adminAgent.get(`/api/v1/amc?customerId=${customerOwnedBySales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].customerId).toBe(String(customerOwnedBySales1._id));
  });

  it("without the filter, admin still sees every customer's records", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales2._id),
      startDate: "2026-02-01",
      renewalDate: "2027-02-01",
    });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.body.data).toHaveLength(2);
  });

  it("STILL respects role scoping — sales1 asking for sales2's customer gets nothing, not a leak", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales2._id),
      startDate: "2026-02-01",
      renewalDate: "2027-02-01",
    });

    const response = await sales1Agent.get(`/api/v1/amc?customerId=${customerOwnedBySales2._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it("a manager filtering to their own team member's customer gets that customer's records", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    const response = await manager1Agent.get(`/api/v1/amc?customerId=${customerOwnedBySales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
});

/**
 * Derived near-expiry flag (2026-08-05) — computed server-side so the 30-day
 * threshold lives in one place.
 */
describe("GET /amc — derived isExpiringSoon", () => {
  function isoInDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  it("flags an active record renewing within 30 days", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: isoInDays(-300),
      renewalDate: isoInDays(10),
    });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.body.data[0].isExpiringSoon).toBe(true);
  });

  it("does NOT flag one renewing beyond 30 days", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: isoInDays(-100),
      renewalDate: isoInDays(90),
    });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.body.data[0].isExpiringSoon).toBe(false);
  });

  it("does NOT flag an already-past renewal date — that is expired, not expiring", async () => {
    await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: isoInDays(-400),
      renewalDate: isoInDays(-5),
    });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.body.data[0].isExpiringSoon).toBe(false);
  });

  it("does NOT flag a record whose status is already expired, whatever its dates", async () => {
    const created = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      startDate: isoInDays(-300),
      renewalDate: isoInDays(10),
    });
    await adminAgent.patch(`/api/v1/amc/${created.body.data._id}`).send({ status: "expired" });

    const response = await adminAgent.get("/api/v1/amc");

    expect(response.body.data[0].isExpiringSoon).toBe(false);
  });
});

/**
 * POST /amc/:id/renew (2026-08-05). The defining constraint: the OLD record's
 * amount and dates must be provably unchanged afterwards — chaining exists
 * precisely so historical terms stay verbatim.
 */
describe("POST /amc/:id/renew", () => {
  async function createOriginal(overrides = {}) {
    const response = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales1._id),
      amount: 12000,
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
      ...overrides,
    });
    return response.body.data;
  }

  it("creates a new chained record and expires the old one", async () => {
    const original = await createOriginal();

    const response = await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({});

    expect(response.status).toBe(201);
    expect(response.body.data._id).not.toBe(original._id);
    expect(response.body.data.previousAmcId).toBe(original._id);
    expect(response.body.data.status).toBe("active");
    expect(response.body.data.customerId).toBe(String(customerOwnedBySales1._id));

    const oldRecord = await AMC.findById(original._id);
    expect(oldRecord.status).toBe("expired");
  });

  it("defaults the new term to start where the old one ended, running one year", async () => {
    const original = await createOriginal();

    const response = await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({});

    // No gap: new startDate === old renewalDate.
    expect(new Date(response.body.data.startDate).toISOString()).toBe(new Date(original.renewalDate).toISOString());
    expect(new Date(response.body.data.renewalDate).getUTCFullYear()).toBe(2028);
  });

  it("carries the amount over from the old record by default", async () => {
    const original = await createOriginal({ amount: 34567 });

    const response = await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({});

    expect(response.body.data.amount).toBe(34567);
  });

  it("leaves the OLD record's amount and dates provably untouched", async () => {
    const original = await createOriginal({ amount: 12000 });

    await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({
      amount: 99999,
      startDate: "2027-06-01",
      renewalDate: "2028-06-01",
    });

    const oldRecord = await AMC.findById(original._id);
    expect(oldRecord.amount).toBe(12000);
    expect(new Date(oldRecord.startDate).toISOString()).toBe(new Date(original.startDate).toISOString());
    expect(new Date(oldRecord.renewalDate).toISOString()).toBe(new Date(original.renewalDate).toISOString());
    // Only `status` changed.
    expect(oldRecord.status).toBe("expired");
  });

  it("honours an overridden amount and renewalDate", async () => {
    const original = await createOriginal();

    const response = await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({
      amount: 45000,
      renewalDate: "2027-07-01",
    });

    expect(response.body.data.amount).toBe(45000);
    expect(new Date(response.body.data.renewalDate).toISOString()).toBe(new Date("2027-07-01").toISOString());
    // startDate still defaulted from the old record's renewalDate.
    expect(new Date(response.body.data.startDate).toISOString()).toBe(new Date(original.renewalDate).toISOString());
  });

  it("supports a chain of several renewals, each pointing at its predecessor", async () => {
    const first = await createOriginal();
    const second = (await adminAgent.post(`/api/v1/amc/${first._id}/renew`).send({})).body.data;
    const third = (await adminAgent.post(`/api/v1/amc/${second._id}/renew`).send({})).body.data;

    expect(second.previousAmcId).toBe(first._id);
    expect(third.previousAmcId).toBe(second._id);

    const all = await adminAgent.get(`/api/v1/amc?customerId=${customerOwnedBySales1._id}`);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.data.filter((record) => record.status === "active")).toHaveLength(1);
  });

  it("rejects a renewalDate that is not after the startDate", async () => {
    const original = await createOriginal();

    const response = await adminAgent.post(`/api/v1/amc/${original._id}/renew`).send({
      renewalDate: "2026-06-01",
    });

    expect(response.status).toBe(400);
  });

  it("404s for an AMC outside the caller's scope — same gate as PATCH", async () => {
    const original = await adminAgent.post("/api/v1/amc").send({
      flow: "existing_customer",
      customerId: String(customerOwnedBySales2._id),
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
    });

    const response = await sales1Agent.post(`/api/v1/amc/${original.body.data._id}/renew`).send({});

    expect(response.status).toBe(404);
  });

  it("rejects a caller with no amc.edit grant", async () => {
    const original = await createOriginal();

    const response = await employee1Agent.post(`/api/v1/amc/${original._id}/renew`).send({});

    expect(response.status).toBe(403);
  });
});
