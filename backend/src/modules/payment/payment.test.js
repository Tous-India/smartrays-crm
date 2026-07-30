import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Payment from "./payment.model.js";
import Customer from "../customer/customer.model.js";
import Invoice from "../customer/invoice.model.js";

let app;
let adminAgent, managerAgent, sales1Agent, employee1Agent;
let admin, customer1, customer2, employee1;

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
  managerAgent = await loginAsAgent(app, "manager1@test.local", "Password123");

  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
  });
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  const employee1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee One",
    email: "employee1@test.local",
    password: "Password123",
    role: "employee",
  });
  employee1Agent = await loginAsAgent(app, "employee1@test.local", "Password123");
  employee1 = employee1Response.body.data;

  customer1 = await Customer.create({
    companyName: "Acme Corp",
    ownerId: admin._id,
    projectManagerId: admin._id,
  });
  customer2 = await Customer.create({
    companyName: "Beta Co",
    ownerId: admin._id,
    projectManagerId: admin._id,
  });
});

afterEach(async () => {
  await Payment.deleteMany({});
  await Invoice.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /payments — access", () => {
  it("is admin-only — manager/sales_associate/employee all blocked", async () => {
    const body = { manualClientName: "Walk-in Client", date: "2026-07-01", amount: 500 };

    expect((await managerAgent.post("/api/v1/payments").send(body)).status).toBe(403);
    expect((await sales1Agent.post("/api/v1/payments").send(body)).status).toBe(403);
    expect((await employee1Agent.post("/api/v1/payments").send(body)).status).toBe(403);
  });
});

describe("POST /payments — standalone (no reconciliation)", () => {
  it("logs a manual-client payment with no customerId, nothing to reconcile", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "2026-07-01",
      amount: 1500,
      notes: "Cash payment",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.manualClientName).toBe("Walk-in Client");
    expect(response.body.data.customerId).toBeNull();
    expect(response.body.data.invoiceId).toBeNull();
  });

  it("stores collectedBy when provided — the employee who physically collected it, distinct from recordedBy (whoever entered it)", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "2026-07-01",
      amount: 1500,
      collectedBy: String(employee1._id),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.collectedBy).toBe(String(employee1._id));
    expect(response.body.data.recordedBy).toBe(String(admin._id));
  });

  it("defaults collectedBy to null when not provided", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "2026-07-01",
      amount: 1500,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.collectedBy).toBeNull();
  });

  it("logs a payment against a real customerId with no invoiceId, nothing to reconcile", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id, amount: 10000, balance: 10000 });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      date: "2026-07-01",
      amount: 1500,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.invoiceId).toBeNull();

    const untouchedInvoice = await Invoice.findById(invoice._id);
    expect(untouchedInvoice.balance).toBe(10000);
    expect(untouchedInvoice.status).toBe("draft");
  });

  it("rejects providing both customerId and manualClientName", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      manualClientName: "Also this one",
      date: "2026-07-01",
      amount: 500,
    });

    expect(response.status).toBe(400);
  });

  it("rejects providing neither customerId nor manualClientName", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      date: "2026-07-01",
      amount: 500,
    });

    expect(response.status).toBe(400);
  });

  it("rejects an invoiceId without a customerId", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      invoiceId: "507f1f77bcf86cd799439011",
      date: "2026-07-01",
      amount: 500,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing/invalid date or a non-positive amount", async () => {
    const badDate = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "not-a-date",
      amount: 500,
    });
    expect(badDate.status).toBe(400);

    const badAmount = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "2026-07-01",
      amount: -50,
    });
    expect(badAmount.status).toBe(400);
  });
});

describe("POST /payments — partial reconciliation against an Invoice", () => {
  it("a partial payment reduces the balance and sets status to partially_paid", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id, amount: 10000, balance: 10000 });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 4000,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.invoiceId).toBe(String(invoice._id));

    const updatedInvoice = await Invoice.findById(invoice._id);
    expect(updatedInvoice.balance).toBe(6000);
    expect(updatedInvoice.status).toBe("partially_paid");
  });

  it("a payment that exactly zeroes the balance sets status to paid", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id, amount: 10000, balance: 10000 });

    await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 10000,
    });

    const updatedInvoice = await Invoice.findById(invoice._id);
    expect(updatedInvoice.balance).toBe(0);
    expect(updatedInvoice.status).toBe("paid");
  });

  it("an overpayment clamps the balance to 0 and sets status to paid, rather than going negative", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id, amount: 10000, balance: 10000 });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 15000,
    });

    expect(response.status).toBe(201);

    const updatedInvoice = await Invoice.findById(invoice._id);
    expect(updatedInvoice.balance).toBe(0);
    expect(updatedInvoice.status).toBe("paid");
  });

  it("a second partial payment on the same invoice compounds correctly", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id, amount: 10000, balance: 10000 });

    await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 3000,
    });
    await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-05",
      amount: 3000,
    });

    const updatedInvoice = await Invoice.findById(invoice._id);
    expect(updatedInvoice.balance).toBe(4000);
    expect(updatedInvoice.status).toBe("partially_paid");
  });

  it("rejects an invoiceId that belongs to a different customer", async () => {
    const invoice = await Invoice.create({ customerId: customer2._id, amount: 10000, balance: 10000 });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 1000,
    });

    expect(response.status).toBe(400);

    const untouchedInvoice = await Invoice.findById(invoice._id);
    expect(untouchedInvoice.balance).toBe(10000);
  });

  it("rejects reconciling against an invoice with no balance set (e.g. a draft with no contract amount)", async () => {
    const invoice = await Invoice.create({ customerId: customer1._id });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 1000,
    });

    expect(response.status).toBe(400);
  });

  it("rejects reconciling against a cancelled invoice", async () => {
    const invoice = await Invoice.create({
      customerId: customer1._id,
      amount: 10000,
      balance: 10000,
      status: "cancelled",
    });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: String(invoice._id),
      date: "2026-07-01",
      amount: 1000,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a nonexistent invoiceId", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      invoiceId: "507f1f77bcf86cd799439011",
      date: "2026-07-01",
      amount: 1000,
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /payments", () => {
  it("is admin-only and lists both manual and customer-linked payments", async () => {
    await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in Client",
      date: "2026-07-01",
      amount: 500,
    });
    await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      date: "2026-07-02",
      amount: 700,
    });

    const managerResponse = await managerAgent.get("/api/v1/payments");
    expect(managerResponse.status).toBe(403);

    const adminResponse = await adminAgent.get("/api/v1/payments");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.items).toHaveLength(2);
    expect(adminResponse.body.data.total).toBe(2);
  });

  it("returns every matching row unpaginated when no limit is given", async () => {
    for (let i = 0; i < 3; i += 1) {
      await adminAgent.post("/api/v1/payments").send({
        manualClientName: `Client ${i}`,
        date: "2026-07-01",
        amount: 100,
      });
    }

    const response = await adminAgent.get("/api/v1/payments");

    expect(response.body.data.items).toHaveLength(3);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.limit).toBeNull();
  });

  it("paginates via page/limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      await adminAgent.post("/api/v1/payments").send({
        manualClientName: `Client ${i}`,
        date: "2026-07-01",
        amount: 100,
      });
    }

    const firstPage = await adminAgent.get("/api/v1/payments?page=1&limit=2");
    expect(firstPage.body.data.items).toHaveLength(2);
    expect(firstPage.body.data.total).toBe(3);
    expect(firstPage.body.data.page).toBe(1);
    expect(firstPage.body.data.limit).toBe(2);

    const secondPage = await adminAgent.get("/api/v1/payments?page=2&limit=2");
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.total).toBe(3);
  });

  it("filters by from/to date range, inclusive on both ends", async () => {
    await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Before Range",
      date: "2026-06-30",
      amount: 100,
    });
    await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Start Of Range",
      date: "2026-07-01",
      amount: 200,
    });
    await adminAgent.post("/api/v1/payments").send({
      manualClientName: "End Of Range",
      date: "2026-07-05",
      amount: 300,
    });
    await adminAgent.post("/api/v1/payments").send({
      manualClientName: "After Range",
      date: "2026-07-06",
      amount: 400,
    });

    const response = await adminAgent.get("/api/v1/payments?from=2026-07-01&to=2026-07-05");

    expect(response.body.data.total).toBe(2);
    expect(response.body.data.items.map((payment) => payment.manualClientName).sort()).toEqual([
      "End Of Range",
      "Start Of Range",
    ]);
  });
});
