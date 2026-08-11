import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import User from "./user.model.js";

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent;
let admin, manager1, sales1, sales2, sales3;

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

  /**
   * §7.48 (2026-08-11) — the HR profile fields. NEW fields with no prior
   * version, but these DO discriminate: before this task the server had no
   * such fields, so `updateUser` ignored them silently and returned 200. A
   * silent no-op is the dangerous shape here — it looks accepted.
   */
  it.each([
    ["dateOfBirth", "1990-01-01"],
    ["joiningDate", "2020-06-01"],
    ["address", "12 Somewhere Street"],
    ["emergencyContactName", "Next Of Kin"],
    ["emergencyContactPhone", "9998887777"],
  ])("blocks a user from setting their own %s", async (field, value) => {
    const response = await sales1Agent.patch(`/api/v1/users/${sales1._id}`).send({ [field]: value });

    expect(response.status).toBe(403);

    const unchanged = await User.findById(sales1._id);
    expect(unchanged[field] ?? "").not.toBe(value);
  });

  it("lets an ADMIN set every HR field, and persists them", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({
      dateOfBirth: "1990-01-01",
      joiningDate: "2020-06-01",
      address: "12 Somewhere Street",
      emergencyContactName: "Next Of Kin",
      emergencyContactPhone: "9998887777",
    });

    expect(response.status).toBe(200);

    const stored = await User.findById(sales1._id);
    expect(stored.address).toBe("12 Somewhere Street");
    expect(stored.emergencyContactName).toBe("Next Of Kin");
    expect(stored.emergencyContactPhone).toBe("9998887777");
    expect(stored.dateOfBirth.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(stored.joiningDate.toISOString().slice(0, 10)).toBe("2020-06-01");
  });

  it("saves a user who has NONE of these fields — every existing account predates them", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales2._id}`).send({ phone: "1112223333" });

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe("1112223333");
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

describe("GET /users/:id/deactivation-impact (§7.31, 2026-07-31)", () => {
  it("is admin only", async () => {
    const response = await managerAgent.get(`/api/v1/users/${manager1._id}/deactivation-impact`);
    expect(response.status).toBe(403);
  });

  it("returns an empty impact for a user with no led teams and no active leads", async () => {
    const response = await adminAgent.get(`/api/v1/users/${sales1._id}/deactivation-impact`);

    expect(response.status).toBe(200);
    expect(response.body.data.teamsLed).toEqual([]);
    expect(response.body.data.ownedLeadsCount).toBe(0);
  });

  it("returns each led team with its name and member count", async () => {
    // sales1 and sales2 both already report to manager1 from the fixture
    // setup (managerId: manager1._id) — a team headed by manager1 derives
    // its member count from exactly that, so it's 2 without adding anyone.
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });

    const response = await adminAgent.get(`/api/v1/users/${manager1._id}/deactivation-impact`);

    expect(response.status).toBe(200);
    expect(response.body.data.teamsLed).toHaveLength(1);
    expect(response.body.data.teamsLed[0].name).toBe("Sales Team");
    expect(response.body.data.teamsLed[0].memberCount).toBe(2);
    expect(teamResponse.status).toBe(201);
  });

  it("counts only still-open leads, excluding won/lost", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    await Lead.create({ name: "Open 1", ownerId: manager1._id, clientType: "residential", status: "new" });
    await Lead.create({ name: "Open 2", ownerId: manager1._id, clientType: "residential", status: "contacted" });
    await Lead.create({ name: "Won", ownerId: manager1._id, clientType: "residential", status: "won" });
    await Lead.create({ name: "Lost", ownerId: manager1._id, clientType: "residential", status: "lost" });

    const response = await adminAgent.get(`/api/v1/users/${manager1._id}/deactivation-impact`);

    expect(response.status).toBe(200);
    expect(response.body.data.ownedLeadsCount).toBe(2);
  });

  it("404s for a nonexistent user", async () => {
    const response = await adminAgent.get("/api/v1/users/000000000000000000000001/deactivation-impact");
    expect(response.status).toBe(404);
  });
});

describe("PATCH /users/:id/deactivate — guided reassignment (§7.31, 2026-07-31, reverses the earlier hard-block guard §7.28)", () => {
  it("allows deactivating a user who leads no team and owns no active leads, exactly as before", async () => {
    const response = await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
  });

  it("does not count an inactive team's head as needing reassignment", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });
    await adminAgent.patch(`/api/v1/teams/${teamResponse.body.data._id}`).send({ isActive: false });

    const response = await adminAgent.patch(`/api/v1/users/${manager1._id}/deactivate`);

    expect(response.status).toBe(200);
  });

  it("rejects with no reassignment info, naming the team(s) needing a new head", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });
    expect(teamResponse.status).toBe(201);

    const response = await adminAgent.patch(`/api/v1/users/${manager1._id}/deactivate`);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Sales Team");
    expect(response.body.message).toContain("needing a new head");

    const stillActive = await adminAgent.get(`/api/v1/users/${manager1._id}`);
    expect(stillActive.body.data.isActive).toBe(true);
  });

  it("names every team led by this person when there's more than one, and rejects if only some are covered", async () => {
    const team1 = await adminAgent.post("/api/v1/teams").send({ name: "Sales Team", headManagerId: manager1._id });
    await adminAgent.post("/api/v1/teams").send({ name: "Install Team", headManagerId: manager1._id });

    const uncovered = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignTeamsTo: { [team1.body.data._id]: sales3._id } });

    // sales3 isn't a manager/admin anyway, but more importantly Install Team
    // isn't covered at all — rejected before even validating sales3's role.
    expect(uncovered.status).toBe(400);
    expect(uncovered.body.message).toContain("Install Team");
  });

  it("succeeds once every led team has a valid new head, reassigning the team(s) and deactivating", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });

    const response = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignTeamsTo: { [teamResponse.body.data._id]: admin._id } });

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);

    const team = await adminAgent.get(`/api/v1/teams/${teamResponse.body.data._id}`);
    expect(team.body.data.headManagerId).toBe(String(admin._id));
  });

  it("rejects a new team head that isn't a manager or admin", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });

    const response = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignTeamsTo: { [teamResponse.body.data._id]: sales1._id } });

    expect(response.status).toBe(400);

    const stillActive = await adminAgent.get(`/api/v1/users/${manager1._id}`);
    expect(stillActive.body.data.isActive).toBe(true);
  });

  it("rejects with no reassignLeadsTo when the person owns active leads, stating the count", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    await Lead.create({ name: "Open 1", ownerId: manager1._id, clientType: "residential", status: "new" });
    await Lead.create({ name: "Open 2", ownerId: manager1._id, clientType: "residential", status: "contacted" });

    const response = await adminAgent.patch(`/api/v1/users/${manager1._id}/deactivate`);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("owns 2 active lead(s)");
    expect(response.body.message).toContain("needing a new owner");
  });

  it("succeeds once reassignLeadsTo is provided, moving every open lead's ownerId and deactivating", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    const open1 = await Lead.create({ name: "Open 1", ownerId: manager1._id, clientType: "residential", status: "new" });
    const open2 = await Lead.create({
      name: "Open 2",
      ownerId: manager1._id,
      clientType: "residential",
      status: "contacted",
    });

    const response = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignLeadsTo: String(sales1._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);

    expect((await Lead.findById(open1._id)).ownerId.toString()).toBe(String(sales1._id));
    expect((await Lead.findById(open2._id)).ownerId.toString()).toBe(String(sales1._id));
  });

  it("leaves won/lost leads untouched — they're never reassigned and never block deactivation", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    const won = await Lead.create({ name: "Won", ownerId: manager1._id, clientType: "residential", status: "won" });
    const lost = await Lead.create({ name: "Lost", ownerId: manager1._id, clientType: "residential", status: "lost" });

    // No reassignLeadsTo supplied at all — should succeed since these two
    // don't count as "active".
    const response = await adminAgent.patch(`/api/v1/users/${manager1._id}/deactivate`);

    expect(response.status).toBe(200);
    expect((await Lead.findById(won._id)).ownerId.toString()).toBe(String(manager1._id));
    expect((await Lead.findById(lost._id)).ownerId.toString()).toBe(String(manager1._id));
  });

  it("rejects a reassignLeadsTo that doesn't match an existing user", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    await Lead.create({ name: "Open 1", ownerId: manager1._id, clientType: "residential", status: "new" });

    const response = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignLeadsTo: "000000000000000000000001" });

    expect(response.status).toBe(400);
  });

  it("requires BOTH team and lead reassignment when the person has both, naming both in the rejection", async () => {
    const Lead = (await import("../lead/lead.model.js")).default;
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });
    await Lead.create({ name: "Open 1", ownerId: manager1._id, clientType: "residential", status: "new" });

    const teamOnly = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({ reassignTeamsTo: { [teamResponse.body.data._id]: admin._id } });
    expect(teamOnly.status).toBe(400);
    expect(teamOnly.body.message).toContain("active lead");

    const both = await adminAgent
      .patch(`/api/v1/users/${manager1._id}/deactivate`)
      .send({
        reassignTeamsTo: { [teamResponse.body.data._id]: admin._id },
        reassignLeadsTo: String(sales1._id),
      });

    expect(both.status).toBe(200);
    expect(both.body.data.isActive).toBe(false);
  });

  it("never blocks reactivating a team head — only deactivate has any guard", async () => {
    await adminAgent.post("/api/v1/teams").send({ name: "Sales Team", headManagerId: manager1._id });

    // Deactivated directly at the model layer (bypassing the deactivate
    // flow entirely) to set up a scenario that flow would never otherwise
    // allow, purely to prove reactivate has no guard of its own either.
    const User = (await import("./user.model.js")).default;
    await User.findByIdAndUpdate(manager1._id, { isActive: false });

    const response = await adminAgent.patch(`/api/v1/users/${manager1._id}/reactivate`);

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(true);
  });
});

describe("GET /users?teamId= (§7.28)", () => {
  it("returns only users whose managerId matches the team's headManagerId", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });
    const teamId = teamResponse.body.data._id;

    const response = await adminAgent.get(`/api/v1/users?teamId=${teamId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((user) => user._id).sort()).toEqual(
      [String(sales1._id), String(sales2._id)].sort()
    );
  });

  it("combines teamId with role (AND logic)", async () => {
    const teamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: manager1._id });
    const teamId = teamResponse.body.data._id;

    await adminAgent.patch(`/api/v1/users/${sales1._id}`).send({ role: "employee" });

    const response = await adminAgent.get(`/api/v1/users?teamId=${teamId}&role=sales_associate`);

    expect(response.body.data.map((user) => user._id)).toEqual([String(sales2._id)]);
  });

  it("returns an empty list for a nonexistent teamId rather than erroring", async () => {
    const response = await adminAgent.get("/api/v1/users?teamId=507f1f77bcf86cd799439011");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
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

describe("DELETE /users/:id — guarded hard-delete (§7.28, 2026-07-30)", () => {
  it("rejects deleting a user who is still active", async () => {
    const response = await adminAgent
      .delete(`/api/v1/users/${sales1._id}`)
      .send({ reason: "No longer with the company" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("deactivate this user first");

    const stillThere = await adminAgent.get(`/api/v1/users/${sales1._id}`);
    expect(stillThere.status).toBe(200);
  });

  it("rejects deleting without a reason, even for an already-deactivated user", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    const response = await adminAgent.delete(`/api/v1/users/${sales1._id}`).send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("reason is required");

    const stillThere = await adminAgent.get(`/api/v1/users/${sales1._id}`);
    expect(stillThere.status).toBe(200);
  });

  it("rejects deleting a deactivated user who still leads an active team (defensive — should be unreachable via the normal deactivate guard)", async () => {
    await adminAgent.post("/api/v1/teams").send({ name: "Sales Team", headManagerId: manager1._id });

    // Deactivated directly at the model layer, bypassing the deactivate
    // guard — the only way to reach this otherwise-impossible state, the
    // same technique the reactivate guard test above uses.
    const User = (await import("./user.model.js")).default;
    await User.findByIdAndUpdate(manager1._id, { isActive: false });

    const response = await adminAgent
      .delete(`/api/v1/users/${manager1._id}`)
      .send({ reason: "Leaving the company" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Sales Team");

    const stillThere = await adminAgent.get(`/api/v1/users/${manager1._id}`);
    expect(stillThere.status).toBe(200);
  });

  it("blocks a non-admin from hard-deleting anyone", async () => {
    await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    const response = await sales1Agent.delete(`/api/v1/users/${sales1._id}`).send({ reason: "Test" });

    expect(response.status).toBe(403);
  });

  it("permanently deletes an inactive, non-team-head user, logs a full snapshot audit entry, and existing records referencing them resolve gracefully rather than crashing", async () => {
    const leadResponse = await adminAgent
      .post("/api/v1/leads")
      .send({
        name: "Referencing Lead",
        email: "reflead@example.com",
        phone: "1234567890",
        companyName: "Ref Co",
        source: "Website",
        clientType: "residential",
        ownerId: String(sales1._id),
      });
    expect(leadResponse.status).toBe(201);

    // Closed (won), not left "active" — a still-open lead would now require
    // reassignment before deactivation (§7.31), which would move this
    // lead's ownerId away from sales1 and defeat the point of this test
    // (proving a lead that still references the since-deleted user resolves
    // gracefully, not that it gets reassigned away first).
    await adminAgent.patch(`/api/v1/leads/${leadResponse.body.data._id}/status`).send({ status: "won" });

    await adminAgent.patch(`/api/v1/users/${sales1._id}/deactivate`);

    const deleteResponse = await adminAgent
      .delete(`/api/v1/users/${sales1._id}`)
      .send({ reason: "Left the company 2026-07-30" });

    expect(deleteResponse.status).toBe(200);

    const goneCheck = await adminAgent.get(`/api/v1/users/${sales1._id}`);
    expect(goneCheck.status).toBe(404);

    const DeletedUserAuditLog = (await import("./deletedUserAuditLog.model.js")).default;
    const entries = await DeletedUserAuditLog.find({ deletedUserId: sales1._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe("Left the company 2026-07-30");
    expect(entries[0].snapshot.email).toBe("sales1@test.local");
    expect(entries[0].snapshot.name).toBe("Sales One");

    // The Lead this deleted user owned must still be readable, not crash —
    // the frontend's Map-lookup-with-"—"-fallback pattern is what actually
    // displays it gracefully, this just proves the backend keeps serving
    // the record untouched (no cascade-delete, no FK-style failure).
    const leadsAfterDelete = await adminAgent.get("/api/v1/leads");
    expect(leadsAfterDelete.status).toBe(200);
    const stillPresent = leadsAfterDelete.body.data.find((lead) => lead._id === leadResponse.body.data._id);
    expect(stillPresent).toBeTruthy();
    expect(stillPresent.ownerId).toBe(String(sales1._id));
  });
});
