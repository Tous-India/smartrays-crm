import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import AMC from "./amc.model.js";
import Customer from "../customer/customer.model.js";
import User from "../user/user.model.js";

/**
 * §7.42 (2026-08-06) — `GET /amc?expiringSoon=true` backs the renewals panel
 * above the Customers table.
 */

let app;
let adminAgent, sales1Agent, sales2Agent;
let admin, sales1, sales2;
let customerA, customerB;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS);
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Customer.deleteMany({});
  await AMC.deleteMany({});

  admin = await createUserDirectly({
    name: "Admin",
    email: "admin@amcx.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@amcx.local", "AdminPass123!");

  sales1 = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Sales One",
      email: "sales1@amcx.local",
      password: "Password123",
      role: "sales_associate",
    })
  ).body.data;
  sales1Agent = await loginAsAgent(app, "sales1@amcx.local", "Password123");

  sales2 = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Sales Two",
      email: "sales2@amcx.local",
      password: "Password123",
      role: "sales_associate",
    })
  ).body.data;
  sales2Agent = await loginAsAgent(app, "sales2@amcx.local", "Password123");

  customerA = await Customer.create({
    companyName: "Acme Industries",
    ownerId: sales1._id,
    projectManagerId: admin._id,
  });
  customerB = await Customer.create({
    companyName: "Beta Logistics",
    ownerId: sales2._id,
    projectManagerId: admin._id,
  });
});

afterEach(async () => {
  await AMC.deleteMany({});
});

function createAmc(customerId, renewalDate, overrides = {}) {
  return AMC.create({
    customerId,
    amount: 50000,
    startDate: daysFromNow(-365),
    renewalDate,
    status: "active",
    createdFromFlow: "existing_customer",
    ...overrides,
  });
}

const listExpiring = (agent) => agent.get("/api/v1/amc?expiringSoon=true");

describe("GET /amc?expiringSoon=true — the 30-day boundary", () => {
  it("INCLUDES a record renewing just inside 30 days", async () => {
    await createAmc(customerA._id, daysFromNow(29));

    const response = await listExpiring(adminAgent);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("EXCLUDES a record renewing just outside 30 days", async () => {
    await createAmc(customerA._id, daysFromNow(31));

    const response = await listExpiring(adminAgent);

    expect(response.body.data).toHaveLength(0);
  });

  it("includes a record sitting essentially ON the boundary", async () => {
    // A few minutes inside 30 days — the cutoff is inclusive (`$lte`).
    await createAmc(customerA._id, new Date(Date.now() + 30 * DAY_MS - 60_000));

    expect((await listExpiring(adminAgent)).body.data).toHaveLength(1);
  });

  /**
   * Wider than `decorateAMC`'s `isExpiringSoon` flag, which excludes
   * already-expired dates because it drives an amber "expiring soon" badge.
   * An AMC that lapsed last week is the most urgent row in the panel, not
   * one to hide.
   */
  it("INCLUDES an already-overdue record, which isExpiringSoon does not flag", async () => {
    await createAmc(customerA._id, daysFromNow(-7));

    const response = await listExpiring(adminAgent);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].isExpiringSoon).toBe(false);
  });

  it("excludes a record already marked expired — it has been dealt with", async () => {
    await createAmc(customerA._id, daysFromNow(5), { status: "expired" });

    expect((await listExpiring(adminAgent)).body.data).toHaveLength(0);
  });

  it("returns everything unfiltered when the flag is absent", async () => {
    await createAmc(customerA._id, daysFromNow(200));

    expect((await adminAgent.get("/api/v1/amc")).body.data).toHaveLength(1);
    expect((await listExpiring(adminAgent)).body.data).toHaveLength(0);
  });

  it("sorts the most urgent first", async () => {
    await createAmc(customerA._id, daysFromNow(20));
    await createAmc(customerB._id, daysFromNow(-10));
    await createAmc(customerA._id, daysFromNow(5));

    const dates = (await listExpiring(adminAgent)).body.data.map((r) => new Date(r.renewalDate).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});

describe("GET /amc?expiringSoon=true — scoping is unchanged", () => {
  it("shows a sales associate only their OWN customers' records", async () => {
    await createAmc(customerA._id, daysFromNow(10)); // sales1's
    await createAmc(customerB._id, daysFromNow(10)); // sales2's

    const response = await listExpiring(sales1Agent);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].customerName).toBe("Acme Industries");
  });

  it("does not let the filter widen scope — sales2 still cannot see sales1's", async () => {
    await createAmc(customerA._id, daysFromNow(10));

    const response = await listExpiring(sales2Agent);

    expect(response.body.data).toHaveLength(0);
  });

  it("shows an admin every customer's records", async () => {
    await createAmc(customerA._id, daysFromNow(10));
    await createAmc(customerB._id, daysFromNow(10));

    expect((await listExpiring(adminAgent)).body.data).toHaveLength(2);
  });

  it("still refuses a role with no amc grant at all", async () => {
    await createAmc(customerA._id, daysFromNow(10));
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Employee",
      email: "emp@amcx.local",
      password: "Password123",
      role: "employee",
    });
    const employeeAgent = await loginAsAgent(app, "emp@amcx.local", "Password123");

    expect((await listExpiring(employeeAgent)).status).toBe(403);
  });
});

describe("GET /amc — the customer name arrives with the records", () => {
  it("returns customerName on every record", async () => {
    await createAmc(customerA._id, daysFromNow(10));
    await createAmc(customerB._id, daysFromNow(12));

    const records = (await listExpiring(adminAgent)).body.data;

    expect(records.map((r) => r.customerName).sort()).toEqual(["Acme Industries", "Beta Logistics"]);
  });

  it("keeps customerId a plain id string, not the populated object", async () => {
    await createAmc(customerA._id, daysFromNow(10));

    const [record] = (await listExpiring(adminAgent)).body.data;

    // The Customer Detail page compares this as a string; populating must not
    // change its shape for existing callers.
    expect(typeof record.customerId).toBe("string");
    expect(record.customerId).toBe(String(customerA._id));
  });

  /**
   * The requirement is a single query with a join, NOT one lookup per AMC.
   * Asserting the response contains names would pass either way, so this
   * counts the actual `find` calls the driver issues on the `customers`
   * collection while the request runs.
   */
  it("costs ONE customers query regardless of how many AMCs come back", async () => {
    await Promise.all([
      createAmc(customerA._id, daysFromNow(3)),
      createAmc(customerA._id, daysFromNow(6)),
      createAmc(customerB._id, daysFromNow(9)),
      createAmc(customerB._id, daysFromNow(12)),
      createAmc(customerA._id, daysFromNow(15)),
    ]);

    /*
     * Counts real collection operations via Mongoose's own debug hook.
     *
     * Two cheaper approaches were tried and rejected: driver command
     * monitoring needs `monitorCommands: true` on the connection, which this
     * app deliberately does not set, and `vi.spyOn(Customer, "find")` never
     * fires because `populate` does not go through the model's `find`.
     *
     * Admin is used on purpose — `getVisibleCustomerIds` returns early for
     * admin without querying, so the only `customers` operation left in the
     * request is the populate itself.
     */
    const customerOps = [];
    mongoose.set("debug", (collectionName, methodName) => {
      if (collectionName === "customers") {
        customerOps.push(methodName);
      }
    });

    let records;
    try {
      records = (await listExpiring(adminAgent)).body.data;
    } finally {
      mongoose.set("debug", false);
    }

    expect(records).toHaveLength(5);
    expect(records.every((r) => r.customerName)).toBe(true);
    // One join for five records. An N+1 would show five.
    expect(customerOps).toHaveLength(1);
  });
});
