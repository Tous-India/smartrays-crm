import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Payment from "./payment.model.js";
import PaymentAuditLog from "./paymentAuditLog.model.js";
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
  await PaymentAuditLog.deleteMany({});
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

async function createTestPayment(overrides = {}) {
  const response = await adminAgent.post("/api/v1/payments").send({
    manualClientName: "Edit Me Client",
    date: "2026-07-01",
    amount: 1000,
    notes: "Original notes",
    ...overrides,
  });
  return response.body.data;
}

describe("PATCH /payments/:id — edit with audit trail (§7.9 extension)", () => {
  it("is admin-only", async () => {
    const payment = await createTestPayment();
    const body = { amount: 2000, reason: "Correcting amount" };

    expect((await managerAgent.patch(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
    expect((await sales1Agent.patch(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
    expect((await employee1Agent.patch(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
  });

  it("rejects an edit with no reason", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent.patch(`/api/v1/payments/${payment._id}`).send({ amount: 2000 });

    expect(response.status).toBe(400);

    const untouched = await Payment.findById(payment._id);
    expect(untouched.amount).toBe(1000);
  });

  it("rejects an edit with a blank/whitespace-only reason", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent
      .patch(`/api/v1/payments/${payment._id}`)
      .send({ amount: 2000, reason: "   " });

    expect(response.status).toBe(400);
  });

  it("applies the update and logs an 'edited' audit entry capturing the previous values", async () => {
    const payment = await createTestPayment({ amount: 1000, notes: "Original notes" });

    const response = await adminAgent.patch(`/api/v1/payments/${payment._id}`).send({
      amount: 2500,
      notes: "Corrected notes",
      reason: "Client paid more than initially recorded",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe(2500);
    expect(response.body.data.notes).toBe("Corrected notes");

    const entries = await PaymentAuditLog.find({ paymentId: payment._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("edited");
    expect(entries[0].reason).toBe("Client paid more than initially recorded");
    expect(String(entries[0].changedBy)).toBe(String(admin._id));
    expect(entries[0].previousValues.amount).toBe(1000);
    expect(entries[0].previousValues.notes).toBe("Original notes");
  });

  it("does not allow changing customerId/manualClientName/invoiceId through this endpoint", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent.patch(`/api/v1/payments/${payment._id}`).send({
      customerId: String(customer1._id),
      manualClientName: "Should Not Change",
      reason: "Trying to move this to a different client",
    });

    expect(response.status).toBe(200);
    const updated = await Payment.findById(payment._id);
    expect(updated.manualClientName).toBe("Edit Me Client");
    expect(updated.customerId).toBeNull();
  });

  it("404s for a nonexistent payment", async () => {
    const response = await adminAgent
      .patch("/api/v1/payments/507f1f77bcf86cd799439011")
      .send({ amount: 100, reason: "test" });

    expect(response.status).toBe(404);
  });

  it("404s when trying to edit an already soft-deleted payment", async () => {
    const payment = await createTestPayment();
    await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({ reason: "gone" });

    const response = await adminAgent
      .patch(`/api/v1/payments/${payment._id}`)
      .send({ amount: 999, reason: "editing a deleted one" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /payments/:id — soft delete with audit trail (§7.9 extension)", () => {
  it("is admin-only", async () => {
    const payment = await createTestPayment();
    const body = { reason: "Duplicate entry" };

    expect((await managerAgent.delete(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
    expect((await sales1Agent.delete(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
    expect((await employee1Agent.delete(`/api/v1/payments/${payment._id}`).send(body)).status).toBe(403);
  });

  it("rejects a delete with no reason", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({});

    expect(response.status).toBe(400);
    expect(await Payment.findById(payment._id)).not.toBeNull();
  });

  it("soft-deletes: the document still exists but is excluded from list/totals", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent
      .delete(`/api/v1/payments/${payment._id}`)
      .send({ reason: "Duplicate entry, recorded twice by mistake" });

    expect(response.status).toBe(200);

    const stillExists = await Payment.findById(payment._id);
    expect(stillExists).not.toBeNull();
    expect(stillExists.isDeleted).toBe(true);
    expect(stillExists.deletionReason).toBe("Duplicate entry, recorded twice by mistake");
    expect(String(stillExists.deletedBy)).toBe(String(admin._id));
    expect(stillExists.deletedAt).not.toBeNull();

    const listResponse = await adminAgent.get("/api/v1/payments");
    expect(listResponse.body.data.total).toBe(0);
    expect(listResponse.body.data.items).toHaveLength(0);
  });

  it("logs a 'deleted' audit entry capturing the values as they were at deletion", async () => {
    const payment = await createTestPayment({ amount: 3000 });

    await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({ reason: "Recorded in error" });

    const entries = await PaymentAuditLog.find({ paymentId: payment._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("deleted");
    expect(entries[0].reason).toBe("Recorded in error");
    expect(entries[0].previousValues.amount).toBe(3000);
  });

  it("404s for a nonexistent payment", async () => {
    const response = await adminAgent
      .delete("/api/v1/payments/507f1f77bcf86cd799439011")
      .send({ reason: "test" });

    expect(response.status).toBe(404);
  });

  it("404s when trying to delete an already-deleted payment", async () => {
    const payment = await createTestPayment();
    await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({ reason: "first delete" });

    const response = await adminAgent
      .delete(`/api/v1/payments/${payment._id}`)
      .send({ reason: "second delete" });

    expect(response.status).toBe(404);
  });
});

describe("GET /payments/:id/audit-log", () => {
  it("is admin-only", async () => {
    const payment = await createTestPayment();

    expect((await managerAgent.get(`/api/v1/payments/${payment._id}/audit-log`)).status).toBe(403);
    expect((await sales1Agent.get(`/api/v1/payments/${payment._id}/audit-log`)).status).toBe(403);
    expect((await employee1Agent.get(`/api/v1/payments/${payment._id}/audit-log`)).status).toBe(403);
  });

  it("returns the full edit/delete history for a payment, newest first", async () => {
    const payment = await createTestPayment({ amount: 1000 });

    await adminAgent.patch(`/api/v1/payments/${payment._id}`).send({ amount: 1500, reason: "First correction" });
    await adminAgent.patch(`/api/v1/payments/${payment._id}`).send({ amount: 1800, reason: "Second correction" });
    await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({ reason: "Client cancelled" });

    const response = await adminAgent.get(`/api/v1/payments/${payment._id}/audit-log`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((entry) => entry.action)).toEqual(["deleted", "edited", "edited"]);
    expect(response.body.data[0].reason).toBe("Client cancelled");
    expect(response.body.data[2].previousValues.amount).toBe(1000);
  });

  it("still returns history for a soft-deleted payment (not 404)", async () => {
    const payment = await createTestPayment();
    await adminAgent.delete(`/api/v1/payments/${payment._id}`).send({ reason: "gone" });

    const response = await adminAgent.get(`/api/v1/payments/${payment._id}/audit-log`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("404s for a payment that never existed", async () => {
    const response = await adminAgent.get("/api/v1/payments/507f1f77bcf86cd799439011/audit-log");

    expect(response.status).toBe(404);
  });

  it("returns an empty array for a payment with no edit/delete history yet", async () => {
    const payment = await createTestPayment();

    const response = await adminAgent.get(`/api/v1/payments/${payment._id}/audit-log`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

/**
 * §7.70 — contact link + the customer page's own read.
 *
 * A payment can name the person it was collected FROM. Because contact
 * deletion is a hard delete, the name is snapshotted at write time; the tests
 * below are ordered to prove the snapshot survives the contact's removal.
 */
describe("POST /payments — contactId (§7.70)", () => {
  let Contact;
  let ramesh;
  let sunitaAtOtherCustomer;

  beforeAll(async () => {
    ({ default: Contact } = await import("../customer/contact.model.js"));
  });

  beforeEach(async () => {
    ramesh = await Contact.create({ customerId: customer1._id, name: "Ramesh", isPrimary: true });
    sunitaAtOtherCustomer = await Contact.create({ customerId: customer2._id, name: "Sunita" });
  });

  afterEach(async () => {
    await Contact.deleteMany({});
  });

  it("stores the ref AND snapshots the contact's name at write time", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      contactId: String(ramesh._id),
      date: "2026-09-18",
      amount: 750,
    });

    expect(response.status).toBe(201);
    expect(String(response.body.data.contactId)).toBe(String(ramesh._id));
    expect(response.body.data.contactName).toBe("Ramesh");
  });

  it("rejects a contact that belongs to a DIFFERENT customer", async () => {
    // The exact shape of the invoiceId rule: never attribute money to a
    // person at someone else's company.
    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      contactId: String(sunitaAtOtherCustomer._id),
      date: "2026-09-18",
      amount: 750,
    });

    expect(response.status).toBe(400);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("rejects a contactId alongside manualClientName", async () => {
    const response = await adminAgent.post("/api/v1/payments").send({
      manualClientName: "Walk-in",
      contactId: String(ramesh._id),
      date: "2026-09-18",
      amount: 750,
    });

    expect(response.status).toBe(400);
  });

  it("is optional — a customer with no contacts is still payable", async () => {
    await Contact.deleteMany({ customerId: customer1._id });

    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      date: "2026-09-18",
      amount: 750,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.contactId).toBeNull();
    expect(response.body.data.contactName).toBeNull();
  });

  it("keeps the snapshot name after the contact is hard-deleted", async () => {
    const created = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      contactId: String(ramesh._id),
      date: "2026-09-18",
      amount: 750,
    });

    // Through the real endpoint — this is the deleteOne() the snapshot exists
    // to survive.
    const removed = await adminAgent.delete(`/api/v1/customers/${customer1._id}/contacts/${ramesh._id}`);
    expect(removed.status).toBe(200);
    expect(await Contact.findById(ramesh._id)).toBeNull();

    const listed = await adminAgent.get("/api/v1/payments");
    const payment = listed.body.data.items.find((one) => one._id === created.body.data._id);

    expect(payment.contactName).toBe("Ramesh");
    expect(String(payment.contactId)).toBe(String(ramesh._id));
  });

  it("carries contactId/contactName into the audit-log snapshot", async () => {
    const created = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer1._id),
      contactId: String(ramesh._id),
      date: "2026-09-18",
      amount: 750,
    });

    await adminAgent
      .patch(`/api/v1/payments/${created.body.data._id}`)
      .send({ amount: 800, reason: "Typo in amount" });

    const log = await adminAgent.get(`/api/v1/payments/${created.body.data._id}/audit-log`);

    expect(log.body.data).toHaveLength(1);
    expect(String(log.body.data[0].previousValues.contactId)).toBe(String(ramesh._id));
    expect(log.body.data[0].previousValues.contactName).toBe("Ramesh");
  });
});

describe("GET /customers/:id/payments (§7.70)", () => {
  async function recordFor(customer, amount, date = "2026-09-18") {
    const response = await adminAgent.post("/api/v1/payments").send({
      customerId: String(customer._id),
      date,
      amount,
    });

    return response.body.data;
  }

  it("returns only that customer's payments, newest first, in the Payments table's envelope", async () => {
    await recordFor(customer1, 100, "2026-09-10");
    await recordFor(customer2, 999, "2026-09-12");
    await recordFor(customer1, 200, "2026-09-15");

    const response = await adminAgent.get(`/api/v1/customers/${customer1._id}/payments`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ total: 2, page: 1, limit: null });
    expect(response.body.data.items.map((one) => one.amount)).toEqual([200, 100]);
    expect(response.body.data.items.every((one) => String(one.customerId) === String(customer1._id))).toBe(true);
  });

  it("excludes soft-deleted payments, the same as the global list", async () => {
    const kept = await recordFor(customer1, 100);
    const gone = await recordFor(customer1, 200);
    await adminAgent.delete(`/api/v1/payments/${gone._id}`).send({ reason: "Duplicate" });

    const response = await adminAgent.get(`/api/v1/customers/${customer1._id}/payments`);

    expect(response.body.data.items.map((one) => one._id)).toEqual([kept._id]);
  });

  it("is gated on customers.view, NOT payments.view — a sales associate can read their own customer's", async () => {
    // sales_associate holds customers.view by template and no payments.*
    // at all. The customer must be theirs for the ownership scope to pass.
    const { default: User } = await import("../user/user.model.js");
    const sales = await User.findOne({ email: "sales1@test.local" });
    const own = await Customer.create({ companyName: "Own Co", ownerId: sales._id, projectManagerId: sales._id });
    await recordFor(own, 300);

    // Sanity: the global list is still closed to them.
    expect((await sales1Agent.get("/api/v1/payments")).status).toBe(403);

    const response = await sales1Agent.get(`/api/v1/customers/${own._id}/payments`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].amount).toBe(300);

    await Customer.deleteOne({ _id: own._id });
  });

  it("404s (not 403) for a customer outside the viewer's ownership scope", async () => {
    await recordFor(customer1, 100);

    // customer1 is admin-owned; sales1 cannot see it at all.
    const response = await sales1Agent.get(`/api/v1/customers/${customer1._id}/payments`);

    expect(response.status).toBe(404);
  });

  it("is closed to a role with no customers.view at all", async () => {
    const response = await employee1Agent.get(`/api/v1/customers/${customer1._id}/payments`);

    expect(response.status).toBe(403);
  });
});
