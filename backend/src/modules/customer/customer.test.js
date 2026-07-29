import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Customer from "./customer.model.js";
import Contact from "./contact.model.js";
import Contract from "./contract.model.js";
import Credential from "./credential.model.js";
import Invoice from "./invoice.model.js";
import CustomerActivity from "./customerActivity.model.js";
import Project from "../project/project.model.js";

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent;
let admin, manager1, sales1, sales2, sales3;

function buildCustomerPayload(overrides = {}) {
  return {
    companyName: "Acme Corp",
    email: "billing@acme.test",
    phone: "9998887777",
    projectManagerId: overrides.projectManagerId,
    ...overrides,
  };
}

async function clearCustomerData() {
  await Customer.deleteMany({});
  await Contact.deleteMany({});
  await Contract.deleteMany({});
  await Credential.deleteMany({});
  await Invoice.deleteMany({});
  await CustomerActivity.deleteMany({});
  await Project.deleteMany({});
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

  // Registered through the real /auth/register endpoint (not createUserDirectly),
  // so these fixtures exercise the actual role-based customers/credentials/
  // projects/tasks permission defaults instead of bypassing that logic.
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
  await clearCustomerData();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("Customer CRUD + scoping", () => {
  it("requires projectManagerId to create a customer", async () => {
    const response = await sales1Agent.post("/api/v1/customers").send({ companyName: "No PM Co" });

    expect(response.status).toBe(400);
  });

  it("a sales_associate's created customer is always owned by themselves", async () => {
    const response = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, ownerId: sales2._id }));

    expect(response.status).toBe(201);
    expect(response.body.data.ownerId).toBe(String(sales1._id));
  });

  it("admin sees every customer regardless of owner", async () => {
    await sales1Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));
    await sales2Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));
    await sales3Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await adminAgent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
  });

  it("a manager sees only their direct reports' customers, not an unaffiliated sales associate's", async () => {
    await sales1Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));
    await sales2Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));
    await sales3Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await managerAgent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("a sales_associate sees only their own customers", async () => {
    await sales1Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));
    await sales2Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("returns 404 (not 403) when a sales associate fetches another's out-of-scope customer", async () => {
    const created = await sales2Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent.get(`/api/v1/customers/${created.body.data._id}`);

    expect(response.status).toBe(404);
  });

  it("updates editable fields and blocks a sales_associate from reassigning ownerId", async () => {
    const created = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent
      .patch(`/api/v1/customers/${created.body.data._id}`)
      .send({ industry: "Manufacturing", ownerId: String(sales2._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.industry).toBe("Manufacturing");
    expect(response.body.data.ownerId).toBe(String(sales1._id));
  });

  it("deletes a customer within scope", async () => {
    const created = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent.delete(`/api/v1/customers/${created.body.data._id}`);

    expect(response.status).toBe(200);
    expect(await Customer.findById(created.body.data._id)).toBeNull();
  });
});

describe("GET /customers — primaryContact", () => {
  it("includes each customer's isPrimary contact (name + phone), not every contact", async () => {
    const created = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = created.body.data._id;

    await Contact.create({ customerId, name: "Secondary Contact", phone: "1112223333", isPrimary: false });
    await Contact.create({ customerId, name: "Primary Contact", phone: "4445556666", isPrimary: true });

    const response = await sales1Agent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].primaryContact).toEqual({ name: "Primary Contact", phone: "4445556666" });
  });

  it("returns primaryContact: null for a customer with no contacts at all", async () => {
    await sales1Agent.post("/api/v1/customers").send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data[0].primaryContact).toBeNull();
  });

  it("returns primaryContact: null when contacts exist but none is flagged isPrimary", async () => {
    const created = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    await Contact.create({ customerId: created.body.data._id, name: "Just A Contact", phone: "9990001111" });

    const response = await sales1Agent.get("/api/v1/customers");

    expect(response.status).toBe(200);
    expect(response.body.data[0].primaryContact).toBeNull();
  });
});

describe("Solar-specific fields", () => {
  it("creates a customer with no solar fields set (they're optional, not required)", async () => {
    const response = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    expect(response.status).toBe(201);
    expect(response.body.data.clientType).toBeNull();
    expect(response.body.data.netMeteringStatus).toBe("not_applied");
    expect(response.body.data.subsidyClaimStatus).toBe("not_applicable");
  });

  it("rejects an invalid clientType/roofType/connectionType/netMeteringStatus/subsidyClaimStatus", async () => {
    const badClientType = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, clientType: "not_a_real_type" }));
    expect(badClientType.status).toBe(400);

    const badRoof = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, roofType: "not_a_real_roof" }));
    expect(badRoof.status).toBe(400);

    const badConnection = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, connectionType: "not_a_real_connection" }));
    expect(badConnection.status).toBe(400);

    const badNetMetering = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, netMeteringStatus: "not_a_real_status" }));
    expect(badNetMetering.status).toBe(400);

    const badSubsidyStatus = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id, subsidyClaimStatus: "not_a_real_status" }));
    expect(badSubsidyStatus.status).toBe(400);
  });

  it("sets the remaining solar fields via a normal update, not at creation", async () => {
    const created = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const response = await sales1Agent.patch(`/api/v1/customers/${created.body.data._id}`).send({
      installedCapacityKw: 12,
      commissioningDate: new Date().toISOString(),
      panelBrand: "Waaree",
      panelModel: "WSM-540",
      inverterBrand: "Growatt",
      inverterModel: "MIN 5000TL-X",
      netMeteringStatus: "approved",
      subsidyClaimStatus: "pending",
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      installedCapacityKw: 12,
      panelBrand: "Waaree",
      panelModel: "WSM-540",
      inverterBrand: "Growatt",
      inverterModel: "MIN 5000TL-X",
      netMeteringStatus: "approved",
      subsidyClaimStatus: "pending",
    });
  });
});

describe("Bulk actions", () => {
  it("bulk-deactivates within scope and requires customers.delete for the delete action", async () => {
    const created1 = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const created2 = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));

    const deactivateResponse = await sales1Agent
      .post("/api/v1/customers/bulk")
      .send({ ids: [created1.body.data._id, created2.body.data._id], action: "deactivate" });

    expect(deactivateResponse.status).toBe(200);
    const customer1 = await Customer.findById(created1.body.data._id);
    expect(customer1.customerStatus).toBe("inactive");

    // sales_associate holds full customers CRUD by default (same as Leads), so
    // to prove the delete action specifically requires customers.delete, this
    // one case needs a user whose grant was explicitly narrowed to exclude it.
    // The permission check in bulkUpdateCustomers runs before any per-id scope
    // resolution, so a fake id is enough to prove the 403 is permission-driven.
    const noDeleteResponse = await adminAgent.post("/api/v1/auth/register").send({
      name: "No Delete Grant",
      email: "nodelete@test.local",
      password: "Password123",
      role: "employee",
    });
    await adminAgent
      .patch(`/api/v1/users/${noDeleteResponse.body.data._id}/permissions`)
      .send({ permissions: { customers: { view: true, edit: true } } });
    const noDeleteAgent = await loginAsAgent(app, "nodelete@test.local", "Password123");

    const deleteResponse = await noDeleteAgent
      .post("/api/v1/customers/bulk")
      .send({ ids: ["000000000000000000000000"], action: "delete" });

    expect(deleteResponse.status).toBe(403);
  });

  it("rejects an unknown bulk action", async () => {
    const response = await sales1Agent.post("/api/v1/customers/bulk").send({ ids: ["000000000000000000000000"], action: "explode" });

    expect(response.status).toBe(400);
  });
});

describe("Contract automation", () => {
  it("a monthly contract auto-creates a recurring Project + draft Invoice", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const response = await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "monthly", amount: 15000, label: "Social Media Mgmt" });

    expect(response.status).toBe(201);

    const project = await Project.findOne({ customerId, linkedContractId: response.body.data._id });
    expect(project).not.toBeNull();
    expect(project.type).toBe("recurring");
    expect(project.status).toBe("active");
    expect(String(project.projectManagerId)).toBe(String(manager1._id));

    const invoice = await Invoice.findOne({ customerId, contractId: response.body.data._id });
    expect(invoice).not.toBeNull();
    expect(invoice.status).toBe("draft");
    expect(invoice.amount).toBe(15000);
  });

  it("a onetime contract auto-creates a onetime Project + draft Invoice", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const response = await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "onetime", amount: 5000, label: "Website Build" });

    expect(response.status).toBe(201);

    const project = await Project.findOne({ customerId, linkedContractId: response.body.data._id });
    expect(project).not.toBeNull();
    expect(project.type).toBe("onetime");

    const invoice = await Invoice.findOne({ customerId, contractId: response.body.data._id });
    expect(invoice).not.toBeNull();
  });

  it("a yearly contract does not trigger project/invoice automation", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const response = await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "yearly", amount: 100000, label: "Annual Retainer" });

    expect(response.status).toBe(201);
    expect(await Project.countDocuments({ customerId })).toBe(0);
    expect(await Invoice.countDocuments({ customerId })).toBe(0);
  });

  it("deleting a contract completes its linked project and cancels its linked invoice", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const contract = await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "monthly", amount: 15000, label: "Social Media Mgmt" });
    const contractId = contract.body.data._id;

    const response = await sales1Agent.delete(`/api/v1/customers/${customerId}/contracts/${contractId}`);

    expect(response.status).toBe(200);

    const project = await Project.findOne({ linkedContractId: contractId });
    expect(project.status).toBe("completed");

    const invoice = await Invoice.findOne({ contractId });
    expect(invoice.status).toBe("cancelled");
  });
});

describe("Deactivation cascade", () => {
  it("setting customerStatus to inactive completes active projects but not already-completed ones", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "monthly", amount: 1000, label: "Retainer A" });
    await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "onetime", amount: 2000, label: "One-off B" });

    const projectsBefore = await Project.find({ customerId });
    expect(projectsBefore).toHaveLength(2);

    const response = await sales1Agent
      .patch(`/api/v1/customers/${customerId}`)
      .send({ customerStatus: "inactive" });

    expect(response.status).toBe(200);

    const projectsAfter = await Project.find({ customerId });
    expect(projectsAfter.every((project) => project.status === "completed")).toBe(true);
  });
});

describe("Contacts", () => {
  it("adds, updates, and removes a contact", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const added = await sales1Agent
      .post(`/api/v1/customers/${customerId}/contacts`)
      .send({ name: "Jane Doe", email: "jane@acme.test", isPrimary: true });

    expect(added.status).toBe(201);

    const updated = await sales1Agent
      .patch(`/api/v1/customers/${customerId}/contacts/${added.body.data._id}`)
      .send({ designation: "CFO" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.designation).toBe("CFO");

    const removed = await sales1Agent.delete(
      `/api/v1/customers/${customerId}/contacts/${added.body.data._id}`
    );

    expect(removed.status).toBe(200);
    expect(await Contact.findById(added.body.data._id)).toBeNull();
  });
});

describe("Credentials vault", () => {
  it("stores the password AES-256-GCM-encrypted, never as plaintext in the database", async () => {
    const customer = await managerAgent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const response = await managerAgent.post(`/api/v1/customers/${customerId}/credentials`).send({
      service: "Hosting",
      username: "admin",
      password: "SuperSecret123!",
      url: "https://host.example.com",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.passwordEncrypted).toBeUndefined();
    expect(response.body.data.passwordIv).toBeUndefined();

    const rawRecord = await Credential.findById(response.body.data._id).select(
      "+passwordEncrypted +passwordIv"
    );

    expect(rawRecord.passwordEncrypted).not.toBe("SuperSecret123!");
    expect(rawRecord.passwordEncrypted).not.toContain("SuperSecret123!");
    expect(rawRecord.passwordIv).toBeDefined();
  });

  it("never leaks passwordEncrypted/passwordIv on list", async () => {
    const customer = await managerAgent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    await managerAgent
      .post(`/api/v1/customers/${customerId}/credentials`)
      .send({ service: "Domain", username: "admin", password: "AnotherSecret1!" });

    const response = await managerAgent.get(`/api/v1/customers/${customerId}/credentials`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].passwordEncrypted).toBeUndefined();
    expect(response.body.data[0].passwordIv).toBeUndefined();
  });

  it("reveal decrypts correctly and writes an activity log entry", async () => {
    const customer = await managerAgent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const created = await managerAgent.post(`/api/v1/customers/${customerId}/credentials`).send({
      service: "Meta Ads",
      username: "admin",
      password: "RevealMe123!",
    });

    const revealResponse = await managerAgent.post(
      `/api/v1/customers/${customerId}/credentials/${created.body.data._id}/reveal`
    );

    expect(revealResponse.status).toBe(200);
    expect(revealResponse.body.data.password).toBe("RevealMe123!");

    const activity = await CustomerActivity.find({ customerId, action: "credential_revealed" });
    expect(activity).toHaveLength(1);
  });

  it("a sales_associate (no credentials.view by default) is blocked from the vault", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    const response = await sales1Agent.get(`/api/v1/customers/${customerId}/credentials`);

    expect(response.status).toBe(403);
  });
});

describe("Activity log", () => {
  it("records creation, edits, and contract additions in order, newest first", async () => {
    const customer = await sales1Agent
      .post("/api/v1/customers")
      .send(buildCustomerPayload({ projectManagerId: manager1._id }));
    const customerId = customer.body.data._id;

    await sales1Agent.patch(`/api/v1/customers/${customerId}`).send({ industry: "Retail" });
    await sales1Agent
      .post(`/api/v1/customers/${customerId}/contracts`)
      .send({ type: "onetime", amount: 500, label: "Landing Page" });

    const response = await sales1Agent.get(`/api/v1/customers/${customerId}/activity`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((entry) => entry.action)).toEqual([
      "contract_added",
      "edited",
      "created",
    ]);
  });
});
