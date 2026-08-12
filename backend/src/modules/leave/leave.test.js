import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Leave from "./leave.model.js";
import Notification from "../notification/notification.model.js";

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
  await Notification.deleteMany({});
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
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", employeeId: String(sales2._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("lets an admin request leave on behalf of another employee", async () => {
    const response = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", employeeId: String(sales1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeId).toBe(String(sales1._id));
  });

  it("rejects an admin's own leave request (§7.5c admin exemption), with no employeeId given", async () => {
    const response = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/do not request leave for themselves/i);
  });

  it("rejects an admin explicitly naming their own id as employeeId too, not just the omitted case", async () => {
    const adminId = (await adminAgent.get("/api/v1/auth/me")).body.data._id;

    const response = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", employeeId: adminId });

    expect(response.status).toBe(403);
  });

  it("requires a reason on request submission", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5) });

    expect(response.status).toBe(400);
  });

  it("rejects a blank/whitespace-only reason", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "   " });

    expect(response.status).toBe(400);
  });

  it("stores and returns the reason correctly", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Family event" });

    expect(response.status).toBe(201);
    expect(response.body.data.reason).toBe("Family event");

    const stored = await Leave.findById(response.body.data._id);
    expect(stored.reason).toBe("Family event");
  });

  it("rejects a request with endDate before startDate", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(3), reason: "Test reason" });

    expect(response.status).toBe(400);
  });

  it("rejects a request with type=unapproved_absence — that's admin-only, never self-requestable", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", type: "unapproved_absence" });

    expect(response.status).toBe(400);
  });

  it("accepts isHalfDay:true for a single-day request", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", isHalfDay: true });

    expect(response.status).toBe(201);
    expect(response.body.data.isHalfDay).toBe(true);
  });

  it("rejects isHalfDay:true when startDate and endDate differ — a half day only describes a single day", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(6), reason: "Test reason", isHalfDay: true });

    expect(response.status).toBe(400);
  });

  it("rejects a non-boolean isHalfDay", async () => {
    const response = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason", isHalfDay: "yes" });

    expect(response.status).toBe(400);
  });
});

describe("GET /leave?scope=own|team|all", () => {
  it("scope=own (default) returns only the caller's own requests", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await sales2Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await sales1Agent.get("/api/v1/leave");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(sales1._id));
  });

  it("scope=own now works for a manager too (§7.5d, 2026-07-31) — previously only view_team, no view grant at all", async () => {
    await managerAgent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.get("/api/v1/leave");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employeeId).toBe(String(manager1._id));
  });

  it("scope=team lets a manager see their direct reports' requests, not an unaffiliated sales associate's", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await sales2Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await sales3Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.get("/api/v1/leave?scope=team");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("scope=team returns 200 with an empty array for a manager with zero direct reports — not a 403 or an error (BUG 3 regression, 2026-08-04)", async () => {
    // Diagnosed live: a reported "Team tab shows empty" turned out to be
    // correct behavior given the actual data (a manager account with no
    // one reporting to them), not a scoping bug — this locks in that exact
    // distinction so a future change can't turn "no direct reports" into
    // an accidental 403/500 instead of a legitimate empty list.
    // Registered through the real endpoint (not createUserDirectly), the
    // same way manager1/sales1/etc. are set up in beforeAll — that's what
    // resolves the manager role's actual `leave.view_team` template default
    // onto the new user; createUserDirectly leaves `permissions: {}` and
    // would 403 here for the wrong reason (no grant at all, not "no reports").
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Unaffiliated Manager",
      email: "unaffiliated-manager@test.local",
      password: "Password123",
      role: "manager",
    });
    const unaffiliatedManagerAgent = await loginAsAgent(app, "unaffiliated-manager@test.local", "Password123");

    const response = await unaffiliatedManagerAgent.get("/api/v1/leave?scope=team");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("scope=team is blocked for a sales_associate (no leave.view_team grant)", async () => {
    const response = await sales1Agent.get("/api/v1/leave?scope=team");

    expect(response.status).toBe(403);
  });

  it("scope=all is blocked for a manager (no leave.view_all grant) but allowed for admin", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

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
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(response.body.data.approvedBy).toBe(String((await adminAgent.get("/api/v1/auth/me")).body.data._id));
  });

  it("allows a manager to approve a pending request from their own direct report (§7.5c manager parity)", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(response.body.data.approvedBy).toBe(String(manager1._id));
  });

  it("blocks a manager from approving a request outside their own team", async () => {
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(403);
  });

  it("blocks a role with no leave.approve grant at all (sales_associate) from approving", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await sales2Agent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(403);
  });

  it("still lets admin approve anything org-wide, regardless of team", async () => {
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(200);
  });

  it("rejects approving a request that isn't pending", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(409);
  });

  it("rejects approving a paid request spanning more than 1 day", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(6), reason: "Test reason" });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    expect(response.status).toBe(409);
  });

  it("enforces the one-paid-leave-per-month quota at APPROVAL time, not at request time: both requests can be submitted, only one can be approved", async () => {
    const first = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(2), endDate: isoDate(2), reason: "Test reason" });

    const second = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(3), endDate: isoDate(3), reason: "Test reason" });

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
      .send({ startDate: isoDate(2), endDate: isoDate(2), reason: "Test reason", type: "unpaid" });

    const response = await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);

    expect(response.status).toBe(200);
  });

  it("a half-day paid request counts as 0.5 against the monthly quota — two can be approved in the same month", async () => {
    const first = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });
    const second = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });

    const firstApproval = await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);
    expect(firstApproval.status).toBe(200);

    const secondApproval = await adminAgent.patch(`/api/v1/leave/${second.body.data._id}/approve`);
    expect(secondApproval.status).toBe(200);
  });

  it("rejects a third half-day paid approval once 1.0 day has already been used (0.5 + 0.5 + 0.5 > 1)", async () => {
    const first = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });
    const second = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });
    const third = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });

    await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);
    await adminAgent.patch(`/api/v1/leave/${second.body.data._id}/approve`);
    const thirdApproval = await adminAgent.patch(`/api/v1/leave/${third.body.data._id}/approve`);

    expect(thirdApproval.status).toBe(409);
  });
});

describe("PATCH /leave/:id/mark-unapproved-absence", () => {
  it("admin marks a leave record as an unapproved absence with double deduction", async () => {
    const created = await adminAgent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1), reason: "Test reason", employeeId: String(sales1._id) });

    const response = await adminAgent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe("unapproved_absence");
    expect(response.body.data.isDoubleDeduction).toBe(true);
    expect(response.body.data.status).toBe("approved");
  });

  it("allows a manager to mark an unapproved absence for their own direct report (§7.5c manager parity)", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1), reason: "Test reason" });

    const response = await managerAgent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe("unapproved_absence");
    expect(response.body.data.isDoubleDeduction).toBe(true);
  });

  it("blocks a manager from marking an unapproved absence outside their own team", async () => {
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1), reason: "Test reason" });

    const response = await managerAgent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(403);
  });

  it("blocks a role with no leave.mark_unapproved_absence grant at all (sales_associate)", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(-1), endDate: isoDate(-1), reason: "Test reason" });

    const response = await sales2Agent.patch(
      `/api/v1/leave/${created.body.data._id}/mark-unapproved-absence`
    );

    expect(response.status).toBe(403);
  });
});

describe("PATCH /leave/:id/decline", () => {
  it("admin declines a pending request, optionally with a reason", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent
      .patch(`/api/v1/leave/${created.body.data._id}/decline`)
      .send({ reason: "Team is short-staffed that week" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("rejected");
    expect(response.body.data.declineReason).toBe("Team is short-staffed that week");
    expect(response.body.data.approvedBy).toBe(String((await adminAgent.get("/api/v1/auth/me")).body.data._id));
  });

  it("works with no reason at all", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/decline`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("rejected");
    expect(response.body.data.declineReason).toBeNull();
  });

  it("rejects a non-string reason", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent
      .patch(`/api/v1/leave/${created.body.data._id}/decline`)
      .send({ reason: 12345 });

    expect(response.status).toBe(400);
  });

  it("allows a manager to decline a pending request from their own direct report (§7.5c manager parity)", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent
      .patch(`/api/v1/leave/${created.body.data._id}/decline`)
      .send({ reason: "Team is short-staffed that week" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("rejected");
    expect(response.body.data.approvedBy).toBe(String(manager1._id));
  });

  it("blocks a manager from declining a request outside their own team", async () => {
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.patch(`/api/v1/leave/${created.body.data._id}/decline`);

    expect(response.status).toBe(403);
  });

  it("blocks a role with no leave.decline grant at all (sales_associate) from declining", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await sales2Agent.patch(`/api/v1/leave/${created.body.data._id}/decline`);

    expect(response.status).toBe(403);
  });

  it("rejects declining a request that isn't pending", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/decline`);

    expect(response.status).toBe(409);
  });

  it("404s for a nonexistent leave record", async () => {
    const response = await adminAgent.patch("/api/v1/leave/000000000000000000000000/decline");

    expect(response.status).toBe(404);
  });
});

describe("DELETE /leave/:id (§7.5d, 2026-07-31)", () => {
  it("admin deletes any leave request org-wide", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await adminAgent.delete(`/api/v1/leave/${created.body.data._id}`);

    expect(response.status).toBe(200);
    expect(await Leave.findById(created.body.data._id)).toBeNull();
  });

  it("allows a manager to delete a request from their own direct report", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.delete(`/api/v1/leave/${created.body.data._id}`);

    expect(response.status).toBe(200);
    expect(await Leave.findById(created.body.data._id)).toBeNull();
  });

  it("blocks a manager from deleting a request outside their own team", async () => {
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await managerAgent.delete(`/api/v1/leave/${created.body.data._id}`);

    expect(response.status).toBe(403);
    expect(await Leave.findById(created.body.data._id)).not.toBeNull();
  });

  it("blocks a role with no leave.delete grant at all (sales_associate)", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    const response = await sales2Agent.delete(`/api/v1/leave/${created.body.data._id}`);

    expect(response.status).toBe(403);
  });

  it("404s for a nonexistent leave record", async () => {
    const response = await adminAgent.delete("/api/v1/leave/000000000000000000000000");

    expect(response.status).toBe(404);
  });
});

describe("GET /leave/balance", () => {
  it("returns zero usage/full remaining for an employee with no approved paid leave this month", async () => {
    const response = await sales1Agent.get("/api/v1/leave/balance");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 });
  });

  it("reflects a full-day approved paid leave as fully used", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await sales1Agent.get("/api/v1/leave/balance");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ paidLeaveUsed: 1, paidLeaveLimit: 1, paidLeaveRemaining: 0 });
  });

  it("reflects a half-day approved paid leave as 0.5 used, 0.5 remaining", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason", isHalfDay: true });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await sales1Agent.get("/api/v1/leave/balance");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ paidLeaveUsed: 0.5, paidLeaveLimit: 1, paidLeaveRemaining: 0.5 });
  });

  it("ignores a pending (not yet approved) paid leave", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason" });

    const response = await sales1Agent.get("/api/v1/leave/balance");

    expect(response.body.data.paidLeaveUsed).toBe(0);
  });

  it("lets an admin view any employee's balance via ?employeeId=", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(1), endDate: isoDate(1), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const response = await adminAgent.get(`/api/v1/leave/balance?employeeId=${sales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.paidLeaveUsed).toBe(1);
  });

  it("lets a manager view their own direct report's balance via ?employeeId=", async () => {
    const response = await managerAgent.get(`/api/v1/leave/balance?employeeId=${sales1._id}`);

    expect(response.status).toBe(200);
  });

  it("blocks a manager from viewing a non-direct-report's balance", async () => {
    const response = await managerAgent.get(`/api/v1/leave/balance?employeeId=${sales3._id}`);

    expect(response.status).toBe(403);
  });

  it("blocks a sales_associate (no view_team/view_all grant) from viewing someone else's balance", async () => {
    const response = await sales1Agent.get(`/api/v1/leave/balance?employeeId=${sales2._id}`);

    expect(response.status).toBe(403);
  });
});

describe("Leave notifications", () => {
  it("notifies the requester's manager and every admin on submission — never the requester themselves", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    expect(created.status).toBe(201);

    const managerNotification = await Notification.findOne({ userId: manager1._id, type: "leave_requested" });
    expect(managerNotification).not.toBeNull();
    expect(managerNotification.relatedEntity.id.toString()).toBe(created.body.data._id);

    const adminUserId = (await adminAgent.get("/api/v1/auth/me")).body.data._id;
    const adminNotification = await Notification.findOne({ userId: adminUserId, type: "leave_requested" });
    expect(adminNotification).not.toBeNull();

    const selfNotification = await Notification.findOne({ userId: sales1._id, type: "leave_requested" });
    expect(selfNotification).toBeNull();
  });

  it("does not notify an unaffiliated manager who isn't this employee's manager", async () => {
    // sales3 has no managerId at all — only admins should be notified.
    const created = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });

    expect(created.status).toBe(201);
    expect(await Notification.countDocuments({ userId: manager1._id, type: "leave_requested" })).toBe(0);
  });

  it("notifies the requester when their leave is approved", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${created.body.data._id}/approve`);

    const notification = await Notification.findOne({ userId: sales1._id, type: "leave_approved" });
    expect(notification).not.toBeNull();
    expect(notification.message).toMatch(/approved/i);
  });

  it("notifies the requester when their leave is declined, including the reason", async () => {
    const created = await sales1Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await adminAgent
      .patch(`/api/v1/leave/${created.body.data._id}/decline`)
      .send({ reason: "Insufficient coverage" });

    const notification = await Notification.findOne({ userId: sales1._id, type: "leave_declined" });
    expect(notification).not.toBeNull();
    expect(notification.message).toMatch(/declined/i);
    expect(notification.message).toMatch(/Insufficient coverage/);
  });
});

describe("GET /leave/pending-count (§7.26, sidebar badge)", () => {
  it("returns the org-wide count of pending leave requests", async () => {
    await sales1Agent.post("/api/v1/leave/request").send({ startDate: isoDate(5), endDate: isoDate(5), reason: "Test reason" });
    await sales2Agent.post("/api/v1/leave/request").send({ startDate: isoDate(6), endDate: isoDate(6), reason: "Test reason" });
    const third = await sales3Agent
      .post("/api/v1/leave/request")
      .send({ startDate: isoDate(7), endDate: isoDate(7), reason: "Test reason" });
    await adminAgent.patch(`/api/v1/leave/${third.body.data._id}/approve`);

    const response = await adminAgent.get("/api/v1/leave/pending-count");

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(2);
  });

  it("is admin-only — a hard role gate, not a leave.view_all permission grant", async () => {
    expect((await managerAgent.get("/api/v1/leave/pending-count")).status).toBe(403);
    expect((await sales1Agent.get("/api/v1/leave/pending-count")).status).toBe(403);
  });

  it("returns 0 when there are no pending requests", async () => {
    const response = await adminAgent.get("/api/v1/leave/pending-count");

    expect(response.body.data.count).toBe(0);
  });
});

/**
 * §7.56 rule C — the free monthly paid day is granted AT APPROVAL.
 *
 * These fail against the previous code, which only ever honoured a leave
 * explicitly REQUESTED as paid: an unpaid request stayed unpaid however much
 * allowance was unused, so the allowance was silently forfeited by anyone who
 * did not know to ask for it.
 */
describe("The free monthly paid day is spent at approval (§7.56)", () => {
  it("marks an UNPAID single-day request paid when the month's day is unused", async () => {
    const request = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07",
      endDate: "2026-09-07",
      type: "unpaid",
      reason: "Personal errand",
    });

    const approved = await adminAgent.patch(`/api/v1/leave/${request.body.data._id}/approve`);

    expect(approved.status).toBe(200);
    // Granted, not requested — the employee asked for unpaid.
    expect(approved.body.data.type).toBe("paid");
  });

  it("does NOT grant a second one in the same month", async () => {
    const first = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-07", type: "unpaid", reason: "First",
    });
    await adminAgent.patch(`/api/v1/leave/${first.body.data._id}/approve`);

    const second = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-14", endDate: "2026-09-14", type: "unpaid", reason: "Second",
    });
    const approved = await adminAgent.patch(`/api/v1/leave/${second.body.data._id}/approve`);

    expect(approved.status).toBe(200);
    expect(approved.body.data.type).toBe("unpaid");
  });

  it("grants it again the FOLLOWING month — the allowance is per calendar month", async () => {
    const september = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-07", type: "unpaid", reason: "September",
    });
    await adminAgent.patch(`/api/v1/leave/${september.body.data._id}/approve`);

    const october = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-10-05", endDate: "2026-10-05", type: "unpaid", reason: "October",
    });
    const approved = await adminAgent.patch(`/api/v1/leave/${october.body.data._id}/approve`);

    expect(approved.body.data.type).toBe("paid");
  });

  it("leaves a MULTI-DAY request entirely unpaid", async () => {
    // `type` is a property of the whole record, so "one day paid, two unpaid"
    // would mean splitting the request into documents the employee never
    // submitted. The system already treats paid leave as at-most-one-day.
    const request = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-09", type: "unpaid", reason: "Three days",
    });

    const approved = await adminAgent.patch(`/api/v1/leave/${request.body.data._id}/approve`);

    expect(approved.body.data.type).toBe("unpaid");
  });

  it("grants a HALF day and leaves the remaining half of the allowance", async () => {
    const half = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-07", type: "unpaid",
      isHalfDay: true, reason: "Half day",
    });
    const first = await adminAgent.patch(`/api/v1/leave/${half.body.data._id}/approve`);
    expect(first.body.data.type).toBe("paid");

    const secondHalf = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-21", endDate: "2026-09-21", type: "unpaid",
      isHalfDay: true, reason: "Another half",
    });
    const second = await adminAgent.patch(`/api/v1/leave/${secondHalf.body.data._id}/approve`);

    // 0.5 + 0.5 exactly fills the one-day allowance.
    expect(second.body.data.type).toBe("paid");

    const third = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-28", endDate: "2026-09-28", type: "unpaid",
      isHalfDay: true, reason: "One too many",
    });
    const overflow = await adminAgent.patch(`/api/v1/leave/${third.body.data._id}/approve`);
    expect(overflow.body.data.type).toBe("unpaid");
  });

  it("NEVER consumes the allowance for an unapproved absence", async () => {
    // The day being penalised at 2x cannot also be the day being forgiven.
    const request = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-07", type: "unpaid", reason: "Did not show",
    });
    const marked = await adminAgent.patch(
      `/api/v1/leave/${request.body.data._id}/mark-unapproved-absence`
    );

    expect(marked.status).toBe(200);
    expect(marked.body.data.type).toBe("unapproved_absence");
    expect(marked.body.data.isDoubleDeduction).toBe(true);

    // ...and the allowance is still there for a later, genuine request.
    const later = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-21", endDate: "2026-09-21", type: "unpaid", reason: "Genuine",
    });
    const approved = await adminAgent.patch(`/api/v1/leave/${later.body.data._id}/approve`);

    expect(approved.body.data.type).toBe("paid");
  });

  it("still rejects an EXPLICIT paid request once the day is spent", async () => {
    // PAID_LEAVE_MONTHLY_LIMIT now bounds automatic granting as well as
    // explicit requests, and both draw on the same monthly total.
    const granted = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-07", endDate: "2026-09-07", type: "unpaid", reason: "Auto-granted",
    });
    await adminAgent.patch(`/api/v1/leave/${granted.body.data._id}/approve`);

    const explicit = await sales1Agent.post("/api/v1/leave/request").send({
      startDate: "2026-09-14", endDate: "2026-09-14", type: "paid", reason: "Explicit paid",
    });
    const rejected = await adminAgent.patch(`/api/v1/leave/${explicit.body.data._id}/approve`);

    expect(rejected.status).toBe(409);
  });
});

