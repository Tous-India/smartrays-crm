import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent;
let manager1, sales1, sales2, sales3;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

// This module is almost entirely about mutating users (role/manager/isActive
// changes), so every test gets a fully fresh set of fixtures rather than a
// shared pool — matching permission.test.js's approach, not lead.test.js's
// (where the users themselves are never the thing under test).
beforeEach(async () => {
  await clearAllCollections();

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

describe("createUser managerId validation (via POST /auth/register)", () => {
  it("rejects a managerId that doesn't belong to a manager or admin", async () => {
    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Bad Manager Assignment",
      email: "badmanager@test.local",
      password: "Password123",
      role: "employee",
      managerId: String(sales1._id),
    });

    expect(response.status).toBe(400);
  });

  it("rejects a managerId that doesn't match any existing user", async () => {
    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Nonexistent Manager",
      email: "nomanager@test.local",
      password: "Password123",
      role: "employee",
      managerId: "000000000000000000000000",
    });

    expect(response.status).toBe(400);
  });

  it("accepts a managerId that belongs to a manager", async () => {
    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Valid Manager Assignment",
      email: "goodmanager@test.local",
      password: "Password123",
      role: "employee",
      managerId: String(manager1._id),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.managerId).toBe(String(manager1._id));
  });

  it("accepts a managerId that belongs to an admin", async () => {
    const adminMe = await adminAgent.get("/api/v1/auth/me");

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Admin Managed",
      email: "adminmanaged@test.local",
      password: "Password123",
      role: "employee",
      managerId: adminMe.body.data._id,
    });

    expect(response.status).toBe(201);
  });
});

describe("GET /users/dropdown", () => {
  it("is accessible without any users.* grant and returns only id/name/role", async () => {
    const response = await sales1Agent.get("/api/v1/users/dropdown");

    expect(response.status).toBe(200);
    const names = response.body.data.map((user) => user.name);
    expect(names).toContain("Manager One");
    expect(names).toContain("Sales One");

    const firstEntry = response.body.data[0];
    expect(firstEntry.name).toBeDefined();
    expect(firstEntry.role).toBeDefined();
    expect(firstEntry.email).toBeUndefined();
    expect(firstEntry.managerId).toBeUndefined();
    expect(firstEntry.isActive).toBeUndefined();
    expect(firstEntry.passwordHash).toBeUndefined();
    expect(firstEntry.permissions).toBeUndefined();
  });

  it("excludes deactivated users", async () => {
    await adminAgent.patch(`/api/v1/users/${sales3._id}/deactivate`);

    const response = await sales1Agent.get("/api/v1/users/dropdown");

    expect(response.body.data.map((user) => user.name)).not.toContain("Sales Three");
  });
});

describe("GET /users (list)", () => {
  it("admin sees everyone", async () => {
    const response = await adminAgent.get("/api/v1/users");

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name)).toEqual(
      expect.arrayContaining(["Admin", "Manager One", "Sales One", "Sales Two", "Sales Three"])
    );
  });

  it("manager sees only their direct reports plus themselves, not an unaffiliated sales associate", async () => {
    const response = await managerAgent.get("/api/v1/users");

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name).sort()).toEqual(
      ["Manager One", "Sales One", "Sales Two"].sort()
    );
  });

  it("falls back to self-only when the caller has no users.* grant at all", async () => {
    const response = await sales1Agent.get("/api/v1/users");

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name)).toEqual(["Sales One"]);
  });

  it("supports filtering by role in addition to scope", async () => {
    const response = await adminAgent.get("/api/v1/users?role=sales_associate");

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name).sort()).toEqual(
      ["Sales One", "Sales Three", "Sales Two"].sort()
    );
  });

  it("supports filtering by isActive", async () => {
    await adminAgent.patch(`/api/v1/users/${sales3._id}/deactivate`);

    const response = await adminAgent.get("/api/v1/users?isActive=false");

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name)).toEqual(["Sales Three"]);
  });

  it("supports filtering by managerId", async () => {
    const response = await adminAgent.get(`/api/v1/users?managerId=${manager1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user.name).sort()).toEqual(
      ["Sales One", "Sales Two"].sort()
    );
  });
});

describe("GET /users/:id", () => {
  // Regression pair for getUserById's self-bypass: sales1 has no `users.*`
  // grant of any kind (sales_associate's default template has none), so
  // these two prove the self-shortcut at the top of getUserById is exactly as
  // narrow as intended — it always lets a caller fetch their OWN id, but does
  // NOT broaden into "no grant → self only" the way GET /users' fallbackToSelf
  // does for the list endpoint. The two endpoints are allowed to diverge here
  // (see user.service.js#resolveVisibleUserFilter's doc comment) — this pair
  // locks in that getUserById's side of that divergence hasn't drifted.
  it("allows self-fetch with no users.* grant at all", async () => {
    const response = await sales1Agent.get(`/api/v1/users/${sales1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Sales One");
  });

  it("still 403s a different user's id when the caller has no users.* grant", async () => {
    const response = await sales1Agent.get(`/api/v1/users/${sales2._id}`);

    expect(response.status).toBe(403);
  });

  it("lets a manager fetch a team member's record", async () => {
    const response = await managerAgent.get(`/api/v1/users/${sales1._id}`);

    expect(response.status).toBe(200);
  });

  it("returns 404 when a manager fetches an unaffiliated sales associate", async () => {
    const response = await managerAgent.get(`/api/v1/users/${sales3._id}`);

    expect(response.status).toBe(404);
  });
});

describe("PATCH /users/:id — self-service vs. admin-only fields", () => {
  it("lets a user update their own name/email/phone", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}`).send({
      name: "Sales One Updated",
      phone: "9999999999",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Sales One Updated");
    expect(response.body.data.phone).toBe("9999999999");
  });

  it("blocks a user from updating their own role", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}`).send({ role: "admin" });

    expect(response.status).toBe(403);
  });

  it("blocks a user from updating their own isActive", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}`).send({ isActive: false });

    expect(response.status).toBe(403);
  });

  it("blocks a user from setting their own baseSalary", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}`).send({ baseSalary: 50000 });

    expect(response.status).toBe(403);
  });

  it("lets an admin set a user's baseSalary, and never leaks it on a plain list fetch", async () => {
    const updateResponse = await adminAgent
      .patch(`/api/v1/users/${sales1._id}`)
      .send({ baseSalary: 50000 });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.baseSalary).toBe(50000);

    const listResponse = await adminAgent.get("/api/v1/users");
    const sales1InList = listResponse.body.data.find((user) => user._id === String(sales1._id));

    expect(sales1InList.baseSalary).toBeUndefined();
  });

  it("blocks a user from updating their own managerId", async () => {
    const response = await sales1Agent
      .patch(`/api/v1/users/${sales1._id}`)
      .send({ managerId: String(manager1._id) });

    expect(response.status).toBe(403);
  });

  it("blocks one non-admin user from updating another user at all", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales2._id}`).send({ name: "Hijacked" });

    expect(response.status).toBe(403);
  });

  it("lets an admin update any field on any user, including role/managerId/isActive", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({
      name: "Renamed By Admin",
      role: "employee",
      isActive: false,
      managerId: String(manager1._id),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Renamed By Admin");
    expect(response.body.data.role).toBe("employee");
    expect(response.body.data.isActive).toBe(false);
  });

  it("rejects an admin assigning an invalid managerId through the general update endpoint", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales2._id}`)
      .send({ managerId: String(sales1._id) });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /users/:id/deactivate and /reactivate", () => {
  it("admin can deactivate a user", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
  });

  it("admin can reactivate a user", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}/reactivate`);

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(true);
  });

  it("blocks a non-admin from deactivating anyone, including themselves", async () => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    expect(response.status).toBe(403);
  });

  it("blocks a manager from deactivating a team member", async () => {
    const response = await managerAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    expect(response.status).toBe(403);
  });
});

describe("PATCH /users/:id/manager", () => {
  it("admin can assign a valid manager", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales3._id}/manager`)
      .send({ managerId: String(manager1._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.managerId).toBe(String(manager1._id));
  });

  it("rejects a managerId that isn't a manager or admin", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales3._id}/manager`)
      .send({ managerId: String(sales1._id) });

    expect(response.status).toBe(400);
  });

  it("admin can clear a user's manager", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales1._id}/manager`)
      .send({ managerId: null });

    expect(response.status).toBe(200);
    expect(response.body.data.managerId).toBeNull();
  });

  it("blocks a non-admin from reassigning anyone's manager", async () => {
    const response = await managerAgent
      .patch(`/api/v1/users/${sales1._id}/manager`)
      .send({ managerId: null });

    expect(response.status).toBe(403);
  });
});

describe("PATCH /users/:id/reset-password (admin override, §7.17)", () => {
  it("admin can set an exact new password, and it is never echoed back", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales1._id}/reset-password`)
      .send({ newPassword: "AdminChosenPass123" });

    expect(response.status).toBe(200);
    expect(response.body.data.tempPassword).toBeNull();

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "sales1@test.local", password: "AdminChosenPass123" });

    expect(loginResponse.status).toBe(200);
  });

  it("generates and returns a one-time temp password when none is supplied", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}/reset-password`).send({});

    expect(response.status).toBe(200);
    expect(typeof response.body.data.tempPassword).toBe("string");
    expect(response.body.data.tempPassword.length).toBeGreaterThanOrEqual(8);

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "sales1@test.local", password: response.body.data.tempPassword });

    expect(loginResponse.status).toBe(200);
  });

  it("rejects a supplied newPassword shorter than 8 characters", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${sales1._id}/reset-password`)
      .send({ newPassword: "short" });

    expect(response.status).toBe(400);
  });

  it("blocks a non-admin from resetting anyone's password, including their own", async () => {
    const response = await sales1Agent
      .patch(`/api/v1/users/${sales1._id}/reset-password`)
      .send({ newPassword: "SomeNewPass123" });

    expect(response.status).toBe(403);
  });
});
