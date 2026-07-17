import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Ticket from "./ticket.model.js";
import Customer from "../customer/customer.model.js";
import Contact from "../customer/contact.model.js";
import Notification from "../notification/notification.model.js";

const FAKE_ATTACHMENT_URL = "https://fake.cloudinary.test/attachment.pdf";

// No test ever makes a real Cloudinary API call — mocked at the module
// boundary, same pattern attendance.test.js/travelLog.test.js established.
vi.mock("../../services/cloudinary.service.js", () => ({
  uploadTicketAttachment: vi.fn(async () => FAKE_ATTACHMENT_URL),
}));

let app;
let adminAgent, managerAgent, employee1Agent, employee2Agent, sales1Agent;
let admin, manager1, employee1, employee2, sales1;
let customer1, customer2;
let portalUser1Agent, portalUser2Agent;
let portalUser1, portalUser2;

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

  const employee1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee One",
    email: "employee1@test.local",
    password: "Password123",
    role: "employee",
  });
  employee1 = employee1Response.body.data;
  employee1Agent = await loginAsAgent(app, "employee1@test.local", "Password123");

  const employee2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee Two",
    email: "employee2@test.local",
    password: "Password123",
    role: "employee",
  });
  employee2 = employee2Response.body.data;
  employee2Agent = await loginAsAgent(app, "employee2@test.local", "Password123");

  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
  });
  sales1 = sales1Response.body.data;
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  customer1 = await Customer.create({
    companyName: "Acme Corp",
    ownerId: admin._id,
    projectManagerId: admin._id,
  });
  await Contact.create({ customerId: customer1._id, name: "Acme Buyer", email: "buyer@acme.com" });

  customer2 = await Customer.create({
    companyName: "Beta Co",
    ownerId: admin._id,
    projectManagerId: admin._id,
  });
  await Contact.create({ customerId: customer2._id, name: "Beta Buyer", email: "buyer@betaco.com" });

  const portal1SignupResponse = await adminAgent
    .post("/api/v1/auth/customer/signup")
    .send({ name: "Acme Portal User", email: "portal1@acme.com", password: "Password123" });
  portalUser1 = portal1SignupResponse.body.data;
  portalUser1Agent = await loginAsAgent(app, "portal1@acme.com", "Password123");

  const portal2SignupResponse = await adminAgent
    .post("/api/v1/auth/customer/signup")
    .send({ name: "Beta Portal User", email: "portal2@betaco.com", password: "Password123" });
  portalUser2 = portal2SignupResponse.body.data;
  portalUser2Agent = await loginAsAgent(app, "portal2@betaco.com", "Password123");
});

afterEach(async () => {
  await Ticket.deleteMany({});
  await Notification.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /tickets", () => {
  it("lets an admin raise a ticket internally, with subject/description becoming the first history entry", async () => {
    const response = await adminAgent.post("/api/v1/tickets").send({
      subject: "Server outage",
      description: "The client called saying their site is down.",
      customerId: String(customer1._id),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe(String(customer1._id));
    expect(response.body.data.raisedByCustomerId).toBeNull();
    expect(response.body.data.category).toBe("other");
    expect(response.body.data.status).toBe("open");
    expect(response.body.data.history).toHaveLength(1);
    expect(response.body.data.history[0].type).toBe("comment");
    expect(response.body.data.history[0].comment).toBe("The client called saying their site is down.");
  });

  it("lets a manager raise a ticket and optionally assign it in the same request", async () => {
    const response = await managerAgent.post("/api/v1/tickets").send({
      subject: "New project kickoff",
      description: "Client wants a new landing page.",
      customerId: String(customer1._id),
      category: "new_project",
      assignedToId: String(employee1._id),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.category).toBe("new_project");
    expect(response.body.data.assignedToId).toBe(String(employee1._id));
  });

  it("rejects a sales_associate (no tickets.create grant)", async () => {
    const response = await sales1Agent.post("/api/v1/tickets").send({
      subject: "Should fail",
      description: "Should fail",
      customerId: String(customer1._id),
    });

    expect(response.status).toBe(403);
  });

  it("rejects an employee (no tickets.create grant)", async () => {
    const response = await employee1Agent.post("/api/v1/tickets").send({
      subject: "Should fail",
      description: "Should fail",
      customerId: String(customer1._id),
    });

    expect(response.status).toBe(403);
  });

  it("lets a customer portal user raise their own ticket, auto-scoped to their own company and forced to category 'other' regardless of what's sent", async () => {
    const response = await portalUser1Agent.post("/api/v1/tickets").send({
      subject: "Invoice question",
      description: "We have a question about our latest invoice.",
      category: "new_project",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe(String(customer1._id));
    expect(response.body.data.raisedByCustomerId).toBe(String(portalUser1._id));
    expect(response.body.data.category).toBe("other");
  });

  it("rejects an internal raise with a missing customerId", async () => {
    const response = await adminAgent.post("/api/v1/tickets").send({
      subject: "Missing customerId",
      description: "Should fail",
    });

    expect(response.status).toBe(400);
  });

  it("rejects an internal raise with a nonexistent customerId", async () => {
    const response = await adminAgent.post("/api/v1/tickets").send({
      subject: "Bad customerId",
      description: "Should fail",
      customerId: "507f1f77bcf86cd799439011",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing subject or description", async () => {
    const response = await adminAgent.post("/api/v1/tickets").send({
      customerId: String(customer1._id),
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /tickets?scope=all|assigned|own", () => {
  async function createInternalTicket(customerId, assignedToId) {
    return Ticket.create({
      subject: "Test ticket",
      customerId,
      assignedToId: assignedToId || null,
      history: [{ type: "comment", authorId: admin._id, comment: "raised" }],
    });
  }

  it("scope=all lets admin see everything, including portal-raised tickets", async () => {
    await createInternalTicket(customer1._id);
    await Ticket.create({
      subject: "Portal ticket",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
      history: [{ type: "comment", authorId: portalUser1._id, comment: "help" }],
    });

    const response = await adminAgent.get("/api/v1/tickets?scope=all");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("scope=all lets a manager (\"PM\") see everything too, including portal-raised tickets — not just admin", async () => {
    await createInternalTicket(customer1._id);
    const portalTicket = await Ticket.create({
      subject: "Portal ticket",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
      history: [{ type: "comment", authorId: portalUser1._id, comment: "help" }],
    });

    const response = await managerAgent.get("/api/v1/tickets?scope=all");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((ticket) => ticket._id)).toContain(String(portalTicket._id));
  });

  it("scope=assigned lets an employee see only tickets assigned to them", async () => {
    const assignedTicket = await createInternalTicket(customer1._id, employee1._id);
    await createInternalTicket(customer1._id, employee2._id);

    const response = await employee1Agent.get("/api/v1/tickets?scope=assigned");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(String(assignedTicket._id));
  });

  it("scope=own lets a customer see only their own company's tickets, and explicitly cannot see another company's — tested directly with two customers from two different companies", async () => {
    const acmeTicket = await createInternalTicket(customer1._id);
    const betaTicket = await createInternalTicket(customer2._id);

    const acmeResponse = await portalUser1Agent.get("/api/v1/tickets?scope=own");
    expect(acmeResponse.status).toBe(200);
    expect(acmeResponse.body.data).toHaveLength(1);
    expect(acmeResponse.body.data[0]._id).toBe(String(acmeTicket._id));
    expect(acmeResponse.body.data.map((ticket) => ticket._id)).not.toContain(String(betaTicket._id));

    // Symmetric check from the other company's side — Beta's portal user must
    // see exactly the reverse: only their own ticket, never Acme's.
    const betaResponse = await portalUser2Agent.get("/api/v1/tickets?scope=own");
    expect(betaResponse.status).toBe(200);
    expect(betaResponse.body.data).toHaveLength(1);
    expect(betaResponse.body.data[0]._id).toBe(String(betaTicket._id));
    expect(betaResponse.body.data.map((ticket) => ticket._id)).not.toContain(String(acmeTicket._id));
  });

  it("a sales_associate has no ticket access at all", async () => {
    const response = await sales1Agent.get("/api/v1/tickets");

    expect(response.status).toBe(403);
  });

  it("rejects scope=assigned for a customer (permission mismatch)", async () => {
    const response = await portalUser1Agent.get("/api/v1/tickets?scope=assigned");

    expect(response.status).toBe(403);
  });

  it("defaults the scope per role when omitted — admin defaults to all, employee defaults to assigned", async () => {
    await createInternalTicket(customer1._id, employee1._id);
    await createInternalTicket(customer1._id);

    const adminResponse = await adminAgent.get("/api/v1/tickets");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(2);

    const employeeResponse = await employee1Agent.get("/api/v1/tickets");
    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.data).toHaveLength(1);
  });

  it("rejects an invalid scope value", async () => {
    const response = await adminAgent.get("/api/v1/tickets?scope=everyone");

    expect(response.status).toBe(400);
  });
});

describe("PATCH /tickets/:id/assign", () => {
  it("lets admin/manager assign a ticket to any employee", async () => {
    const ticket = await Ticket.create({ subject: "Unassigned", customerId: customer1._id });

    const response = await managerAgent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: String(employee2._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedToId).toBe(String(employee2._id));
  });

  it("rejects assigning to a nonexistent user", async () => {
    const ticket = await Ticket.create({ subject: "Unassigned", customerId: customer1._id });

    const response = await adminAgent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(400);
  });

  it("rejects a non-admin/manager (employee, sales_associate, customer)", async () => {
    const ticket = await Ticket.create({ subject: "Unassigned", customerId: customer1._id });

    const employeeResponse = await employee1Agent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: String(employee1._id) });
    expect(employeeResponse.status).toBe(403);

    const customerResponse = await portalUser1Agent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: String(employee1._id) });
    expect(customerResponse.status).toBe(403);
  });

  it("returns 404 for a nonexistent ticket id", async () => {
    const response = await adminAgent
      .patch("/api/v1/tickets/507f1f77bcf86cd799439011/assign")
      .send({ assignedToId: String(employee1._id) });

    expect(response.status).toBe(404);
  });

  // A deliberate small addition beyond §7.8's literal scope — see
  // ticket.service.js#assignTicket and final-plan.md's Platform section.
  it("notifies the assigned employee", async () => {
    const ticket = await Ticket.create({ subject: "Needs help", customerId: customer1._id });

    await managerAgent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: String(employee2._id) });

    const notification = await Notification.findOne({ userId: employee2._id, type: "ticket_assigned" });
    expect(notification).not.toBeNull();
    expect(notification.message).toContain("Needs help");
    expect(String(notification.relatedEntity.id)).toBe(String(ticket._id));
    expect(notification.relatedEntity.module).toBe("tickets");
  });

  it("does not notify when an admin/manager assigns a ticket to themselves", async () => {
    const ticket = await Ticket.create({ subject: "Self-assign", customerId: customer1._id });

    await managerAgent
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .send({ assignedToId: String(manager1._id) });

    expect(await Notification.countDocuments({ type: "ticket_assigned" })).toBe(0);
  });
});

describe("PATCH /tickets/:id/status", () => {
  it("lets the assigned employee change status, appending a history entry with fromStatus/toStatus", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      assignedToId: employee1._id,
    });

    const response = await employee1Agent
      .patch(`/api/v1/tickets/${ticket._id}/status`)
      .send({ status: "in_progress", comment: "Started working on it" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("in_progress");
    const lastEntry = response.body.data.history[response.body.data.history.length - 1];
    expect(lastEntry.type).toBe("status_change");
    expect(lastEntry.fromStatus).toBe("open");
    expect(lastEntry.toStatus).toBe("in_progress");
  });

  it("lets admin/manager change status even without being the assignee", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      assignedToId: employee1._id,
    });

    const response = await adminAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "resolved" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("resolved");
  });

  it("returns 404 for an employee not assigned to this ticket (they cannot even view it)", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      assignedToId: employee1._id,
    });

    const response = await employee2Agent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "resolved" });

    expect(response.status).toBe(404);
  });

  it("returns 403 (not 404) for a customer viewing their own ticket, since they can see it but cannot manage it", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
    });

    const response = await portalUser1Agent
      .patch(`/api/v1/tickets/${ticket._id}/status`)
      .send({ status: "resolved" });

    expect(response.status).toBe(403);
  });

  it("allows any transition, including backwards (closed -> open), logging it", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id, status: "closed" });

    const response = await adminAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "open" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("open");
    expect(response.body.data.history[0].fromStatus).toBe("closed");
    expect(response.body.data.history[0].toStatus).toBe("open");
  });

  it("rejects an invalid status value", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id });

    const response = await adminAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "archived" });

    expect(response.status).toBe(400);
  });
});

describe("POST /tickets/:id/comments", () => {
  it("lets admin/manager comment", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id });

    const response = await managerAgent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Looking into this now.",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.history).toHaveLength(1);
    expect(response.body.data.history[0].comment).toBe("Looking into this now.");
  });

  it("lets the assigned employee comment", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id, assignedToId: employee1._id });

    const response = await employee1Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Working on it.",
    });

    expect(response.status).toBe(201);
  });

  it("lets the customer comment on their own ticket", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
    });

    const response = await portalUser1Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Any update?",
    });

    expect(response.status).toBe(201);
  });

  it("returns 404 for an unrelated employee (not assigned) trying to comment", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id, assignedToId: employee1._id });

    const response = await employee2Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Trying to comment",
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for a customer from a different company", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
    });

    const response = await portalUser2Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Trying to comment",
    });

    expect(response.status).toBe(404);
  });

  it("rejects an empty comment", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id });

    const response = await adminAgent.post(`/api/v1/tickets/${ticket._id}/comments`).send({ comment: "" });

    expect(response.status).toBe(400);
  });
});

describe("history[] accumulates status changes and comments in order", () => {
  it("records a mixed sequence of comments and status changes in the exact order they happened", async () => {
    const ticket = await Ticket.create({
      subject: "Test",
      customerId: customer1._id,
      raisedByCustomerId: portalUser1._id,
      assignedToId: employee1._id,
      history: [{ type: "comment", authorId: portalUser1._id, comment: "Initial report" }],
    });

    await employee1Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Looking into it",
    });
    await employee1Agent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "in_progress" });
    await portalUser1Agent.post(`/api/v1/tickets/${ticket._id}/comments`).send({
      comment: "Any update?",
    });
    const finalResponse = await employee1Agent
      .patch(`/api/v1/tickets/${ticket._id}/status`)
      .send({ status: "resolved", comment: "Fixed and deployed" });

    const history = finalResponse.body.data.history;

    expect(history).toHaveLength(5);
    expect(history[0]).toMatchObject({ type: "comment", comment: "Initial report" });
    expect(history[1]).toMatchObject({ type: "comment", comment: "Looking into it" });
    expect(history[2]).toMatchObject({
      type: "status_change",
      fromStatus: "open",
      toStatus: "in_progress",
    });
    expect(history[3]).toMatchObject({ type: "comment", comment: "Any update?" });
    expect(history[4]).toMatchObject({
      type: "status_change",
      fromStatus: "in_progress",
      toStatus: "resolved",
      comment: "Fixed and deployed",
    });
  });
});

describe("POST /tickets/:id/attachments", () => {
  it("lets someone with view access attach a file, uploading via the mocked Cloudinary service", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id });

    const response = await adminAgent
      .post(`/api/v1/tickets/${ticket._id}/attachments`)
      .send({ attachment: "data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ==" });

    expect(response.status).toBe(201);
    expect(response.body.data.attachments).toHaveLength(1);
    expect(response.body.data.attachments[0].url).toBe(FAKE_ATTACHMENT_URL);
  });

  it("rejects a request with no file", async () => {
    const ticket = await Ticket.create({ subject: "Test", customerId: customer1._id });

    const response = await adminAgent.post(`/api/v1/tickets/${ticket._id}/attachments`).send({});

    expect(response.status).toBe(400);
  });
});
