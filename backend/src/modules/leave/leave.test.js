import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Leave from "./leave.model.js";

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent;
let manager1, sales1, sales2, sales3;

function isoDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  return date.toISOString().slice(0, 10);
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
  await Leave.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /leave/request", () => {
  it("creates a pending leave request for the authenticated employee", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Family event" });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
    expect(response.body.data.status).toBe("pending");
    expect(response.body.data.type).toBe("paid");
  });

  it("always attributes the request to the authenticated user, ignoring any employeeId in the body", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), employeeId: String(sales2._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("lets an admin request leave on behalf of another employee", async () => {
    const response = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), employeeId: String(sales1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("rejects a request with endDate before startDate", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(3) });

    expect(response.status).toBe(400);
  });

  it("rejects a request with type=unapproved_absence — that's admin-only, never self-requestable", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), type: "unapproved_absence" });

    expect(response.status).toBe(400);
  });
});

describe("GET /leave?scope=own|team|all", () => {
  it("scope=own (default) returns only the caller's own requests", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });
    await sales2Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });

    const response = await sales1Agent.get("/api/v1/leave");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(sales1._id));
  });

  it("scope=team lets a manager see their direct reports' requests, not an unaffiliated sales associate's", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });
    await sales2Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });
    await sales3Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });

    const response = await managerAgent.get("/api/v1/leave?scope=team");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("scope=team is blocked for a sales_associate (no leave.view_team grant)", async () => {
    const response = await sales1Agent.get("/api/v1/leave?scope=team");

    expect(response.status).toBe(403);
  });

  it("scope=all is blocked for a manager (no leave.view_all grant) but allowed for admin", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5) });

    const managerResponse = await managerAgent.get("/api/v1/leave?scope=all");
    expect(managerResponse.status).toBe(403);

    const adminResponse = await adminAgent.get("/api/v1/leave?scope=all");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(1);
  });

  it("rejects an invalid scope value", async () => {
    const response = await sales1Agent.get("/api/v1/leave?scope=everyone");

    expect(response.status).toBe(400);
  });
});

describe("PATCH /leave/:id/approve", () => {
  it("admin approves a pending paid leave request", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5) });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(response.body.data.approvedBy).toBe(String((await adminAgent.get("/api/v1/auth/me")).body.data._id));
  });

  it("blocks a non-admin (including the requester's manager) from approving", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5) });

    const response = await managerAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(403);
  });

  it("rejects approving a request that isn't pending", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5) });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(409);
  });

  it("rejects approving a paid request spanning more than 1 day", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(6) });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(409);
  });

  it("enforces the one-paid-leave-per-month quota at APPROVAL time, not at request time: both requests can be submitted, only one can be approved", async () => {
    const first = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(2), endDate: isoDate(2) });

    const second = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(3), endDate: isoDate(3) });

    // Submitting a second paid request in the same month is never blocked —
    // a request existing isn't the same as it being granted. Both succeed.
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstApproval = await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);
    expect(firstApproval.status).toBe(200);

    const secondApproval = await adminAgent.patch(`/api/v1/leave/${second.body.data._id}/approve`);
    expect(secondApproval.status).toBe(409);
    expect(secondApproval.body.message).toMatch(/already used their one paid leave/i);
  });

  it("allows an unpaid request to be approved without touching the paid-leave quota", async () => {
    const first = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(2), endDate: isoDate(2), type: "unpaid" });

    const response = await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);

    expect(response.status).toBe(200);
  });
});

describe("PATCH /leave/:id/mark-unapproved-absence", () => {
  it("admin marks a leave record as an unapproved absence with double deduction", async () => {
    const created = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1), employeeId: String(sales1._id) });

    const response = await adminAgent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe("unapproved_absence");
    expect(response.body.data.isDoubleDeduction).toBe(true);
    expect(response.body.data.status).toBe("approved");
  });

  it("blocks a non-admin from marking an unapproved absence", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1) });

    const response = await managerAgent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(403);
  });
});
