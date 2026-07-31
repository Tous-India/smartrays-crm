import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

let app;
let adminAgent, nonAdminAgent;
let manager1, manager2, employee1, employee2;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearAllCollections();

  await createUserDirectly({
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

  const manager2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager Two",
    email: "manager2@test.local",
    password: "Password123",
    role: "manager",
  });
  manager2 = manager2Response.body.data;

  const employee1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee One",
    email: "employee1@test.local",
    password: "Password123",
    role: "employee",
  });
  employee1 = employee1Response.body.data;

  const employee2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Employee Two",
    email: "employee2@test.local",
    password: "Password123",
    role: "sales_associate",
  });
  employee2 = employee2Response.body.data;

  await adminAgent.post("/api/v1/auth/register").send({
    name: "Non Admin",
    email: "nonadmin@test.local",
    password: "Password123",
    role: "employee",
  });
  nonAdminAgent = await loginAsAgent(app, "nonadmin@test.local", "Password123");
});

describe("Team access", () => {
  it("is admin-only — a non-admin is blocked on every endpoint", async () => {
    const createResponse = await nonAdminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales", headManagerId: String(manager1._id) });
    expect(createResponse.status).toBe(403);

    const listResponse = await nonAdminAgent.get("/api/v1/teams");
    expect(listResponse.status).toBe(403);
  });
});

describe("Team CRUD", () => {
  it("creates a team with a valid manager head", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", type: "Sales", headManagerId: String(manager1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Sales Team");
    expect(response.body.data.type).toBe("Sales");
    expect(response.body.data.headManagerId).toBe(String(manager1._id));
    expect(response.body.data.isActive).toBe(true);
  });

  it("rejects a type that doesn't match an existing, active team type (§7.30)", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Random Team", type: "Something Made Up", headManagerId: String(manager1._id) });

    expect(response.status).toBe(400);
  });

  it("accepts a type matching one of the seeded defaults (§7.30)", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Tech Team", type: "Technical", headManagerId: String(manager1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe("Technical");
  });

  it("no type at all is still accepted — type remains optional (§7.30)", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "No Type Team", headManagerId: String(manager1._id) });

    expect(response.status).toBe(201);
  });

  it("rejects a headManagerId that isn't a manager or admin", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Bad Team", headManagerId: String(employee1._id) });

    expect(response.status).toBe(400);
  });

  it("rejects a headManagerId that doesn't exist at all", async () => {
    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Bad Team", headManagerId: "000000000000000000000001" });

    expect(response.status).toBe(400);
  });

  it("accepts an admin as headManagerId too, not just manager", async () => {
    const admin = (await adminAgent.get("/api/v1/auth/me")).body.data;

    const response = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Admin-led Team", headManagerId: String(admin._id) });

    expect(response.status).toBe(201);
  });

  it("rejects creation with no name or no headManagerId", async () => {
    const noName = await adminAgent.post("/api/v1/teams").send({ headManagerId: String(manager1._id) });
    expect(noName.status).toBe(400);

    const noHead = await adminAgent.post("/api/v1/teams").send({ name: "No Head Team" });
    expect(noHead.status).toBe(400);
  });

  it("lists teams with a derived member count", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });

    await adminAgent.post(`/api/v1/teams/${team.body.data._id}/members`).send({ userId: String(employee1._id) });

    const response = await adminAgent.get("/api/v1/teams");

    expect(response.status).toBe(200);
    const listed = response.body.data.find((t) => t._id === team.body.data._id);
    expect(listed.memberCount).toBe(1);
  });

  it("filters by type (§7.28)", async () => {
    await adminAgent.post("/api/v1/teams").send({ name: "Sales Team", type: "Sales", headManagerId: String(manager1._id) });
    await adminAgent.post("/api/v1/teams").send({ name: "Install Team", type: "Installation", headManagerId: String(manager2._id) });

    const response = await adminAgent.get("/api/v1/teams?type=Sales");

    expect(response.status).toBe(200);
    expect(response.body.data.map((t) => t.name)).toEqual(["Sales Team"]);
  });

  it("filters by isActive (§7.28)", async () => {
    const active = await adminAgent.post("/api/v1/teams").send({ name: "Active Team", headManagerId: String(manager1._id) });
    const toDeactivate = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Inactive Team", headManagerId: String(manager2._id) });
    await adminAgent.patch(`/api/v1/teams/${toDeactivate.body.data._id}`).send({ isActive: false });

    const activeResponse = await adminAgent.get("/api/v1/teams?isActive=true");
    expect(activeResponse.body.data.map((t) => t._id)).toEqual([active.body.data._id]);

    const inactiveResponse = await adminAgent.get("/api/v1/teams?isActive=false");
    expect(inactiveResponse.body.data.map((t) => t._id)).toEqual([toDeactivate.body.data._id]);
  });

  it("combines type and isActive filters (AND logic)", async () => {
    await adminAgent.post("/api/v1/teams").send({ name: "Sales Active", type: "Sales", headManagerId: String(manager1._id) });
    const salesInactive = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Inactive", type: "Sales", headManagerId: String(manager2._id) });
    await adminAgent.patch(`/api/v1/teams/${salesInactive.body.data._id}`).send({ isActive: false });

    const response = await adminAgent.get("/api/v1/teams?type=Sales&isActive=false");

    expect(response.body.data.map((t) => t._id)).toEqual([salesInactive.body.data._id]);
  });

  it("updates name, type, and isActive", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Old Name", type: "Sales", headManagerId: String(manager1._id) });

    const response = await adminAgent
      .patch(`/api/v1/teams/${team.body.data._id}`)
      .send({ name: "New Name", type: "Installation", isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("New Name");
    expect(response.body.data.type).toBe("Installation");
    expect(response.body.data.isActive).toBe(false);
  });

  it("rejects updating to a type that doesn't match an existing, active team type (§7.30)", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "A Team", type: "Sales", headManagerId: String(manager1._id) });

    const response = await adminAgent
      .patch(`/api/v1/teams/${team.body.data._id}`)
      .send({ type: "Not A Real Type" });

    expect(response.status).toBe(400);
    // Rejected, not silently applied.
    expect((await adminAgent.get(`/api/v1/teams/${team.body.data._id}`)).body.data.type).toBe("Sales");
  });

  it("reassigns the head to a different valid manager", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });

    const response = await adminAgent
      .patch(`/api/v1/teams/${team.body.data._id}`)
      .send({ headManagerId: String(manager2._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.headManagerId).toBe(String(manager2._id));
  });

  it("rejects reassigning the head to a non-manager/admin", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });

    const response = await adminAgent
      .patch(`/api/v1/teams/${team.body.data._id}`)
      .send({ headManagerId: String(employee1._id) });

    expect(response.status).toBe(400);
  });

  it("deletes a team without touching its former members' managerId", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });
    await adminAgent.post(`/api/v1/teams/${team.body.data._id}/members`).send({ userId: String(employee1._id) });

    const deleteResponse = await adminAgent.delete(`/api/v1/teams/${team.body.data._id}`);
    expect(deleteResponse.status).toBe(200);

    const getResponse = await adminAgent.get(`/api/v1/teams/${team.body.data._id}`);
    expect(getResponse.status).toBe(404);

    const employeeStillHasManager = await adminAgent.get(`/api/v1/users/${employee1._id}`);
    expect(employeeStillHasManager.body.data.managerId).toBe(String(manager1._id));
  });

  it("404s for a nonexistent team", async () => {
    const response = await adminAgent.get("/api/v1/teams/000000000000000000000001");
    expect(response.status).toBe(404);
  });
});

describe("Team membership (derived via User.managerId, no stored member list)", () => {
  it("adding a member sets their managerId to the team's headManagerId", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });

    const response = await adminAgent
      .post(`/api/v1/teams/${team.body.data._id}/members`)
      .send({ userId: String(employee1._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.managerId).toBe(String(manager1._id));
  });

  it("the member list correctly reflects managerId-derived membership, not a stored array", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });

    await adminAgent.post(`/api/v1/teams/${team.body.data._id}/members`).send({ userId: String(employee1._id) });
    await adminAgent.post(`/api/v1/teams/${team.body.data._id}/members`).send({ userId: String(employee2._id) });

    const response = await adminAgent.get(`/api/v1/teams/${team.body.data._id}/members`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((member) => member.name).sort()).toEqual(
      ["Employee One", "Employee Two"].sort()
    );
  });

  it("a user cannot end up counted in two teams simultaneously — adding to Team B removes them from Team A's derived list", async () => {
    const teamA = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Team A", headManagerId: String(manager1._id) });
    const teamB = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Team B", headManagerId: String(manager2._id) });

    await adminAgent.post(`/api/v1/teams/${teamA.body.data._id}/members`).send({ userId: String(employee1._id) });

    let teamAMembers = await adminAgent.get(`/api/v1/teams/${teamA.body.data._id}/members`);
    expect(teamAMembers.body.data).toHaveLength(1);

    // Moving to Team B — no explicit "remove from Team A" call at all.
    await adminAgent.post(`/api/v1/teams/${teamB.body.data._id}/members`).send({ userId: String(employee1._id) });

    teamAMembers = await adminAgent.get(`/api/v1/teams/${teamA.body.data._id}/members`);
    const teamBMembers = await adminAgent.get(`/api/v1/teams/${teamB.body.data._id}/members`);

    expect(teamAMembers.body.data).toHaveLength(0);
    expect(teamBMembers.body.data).toHaveLength(1);
    expect(teamBMembers.body.data[0]._id).toBe(String(employee1._id));
  });

  it("removing a member clears their managerId entirely", async () => {
    const team = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Sales Team", headManagerId: String(manager1._id) });
    await adminAgent.post(`/api/v1/teams/${team.body.data._id}/members`).send({ userId: String(employee1._id) });

    const response = await adminAgent.delete(`/api/v1/teams/${team.body.data._id}/members/${employee1._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.managerId).toBeNull();

    const teamMembers = await adminAgent.get(`/api/v1/teams/${team.body.data._id}/members`);
    expect(teamMembers.body.data).toHaveLength(0);
  });
});

describe("Team types (§7.30, 2026-07-31 — admin-managed, structural mirror of LeadSource + real validation)", () => {
  it("seeds the three defaults on first read", async () => {
    const response = await adminAgent.get("/api/v1/team-types");

    expect(response.status).toBe(200);
    expect(response.body.data.map((t) => t.name).sort()).toEqual(["Installation", "Sales", "Technical"]);
    expect(response.body.data.every((t) => t.isActive)).toBe(true);
  });

  it("any authenticated user can read the list, not just an admin", async () => {
    const response = await nonAdminAgent.get("/api/v1/team-types");

    expect(response.status).toBe(200);
  });

  it("admin can create a new team type", async () => {
    const response = await adminAgent.post("/api/v1/team-types").send({ name: "Management" });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Management");
    expect(response.body.data.isActive).toBe(true);
  });

  it("a non-admin cannot create a team type", async () => {
    const response = await nonAdminAgent.post("/api/v1/team-types").send({ name: "Management" });

    expect(response.status).toBe(403);
  });

  it("rejects creating a duplicate-named team type", async () => {
    await adminAgent.get("/api/v1/team-types"); // trigger the seed
    const response = await adminAgent.post("/api/v1/team-types").send({ name: "Sales" });

    expect(response.status).toBe(409);
  });

  it("rejects creating with no name", async () => {
    const response = await adminAgent.post("/api/v1/team-types").send({});

    expect(response.status).toBe(400);
  });

  it("admin can rename a team type and toggle isActive", async () => {
    const created = await adminAgent.post("/api/v1/team-types").send({ name: "Draft Name" });

    const response = await adminAgent
      .patch(`/api/v1/team-types/${created.body.data._id}`)
      .send({ name: "Final Name", isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Final Name");
    expect(response.body.data.isActive).toBe(false);
  });

  it("a non-admin cannot update a team type", async () => {
    const created = await adminAgent.post("/api/v1/team-types").send({ name: "Draft Name" });

    const response = await nonAdminAgent
      .patch(`/api/v1/team-types/${created.body.data._id}`)
      .send({ name: "Hijacked" });

    expect(response.status).toBe(403);
  });

  it("deactivating a team type blocks it from being selected for a NEW team, but an existing team keeps its type value and still displays it", async () => {
    const salesType = (await adminAgent.get("/api/v1/team-types")).body.data.find((t) => t.name === "Sales");

    const existingTeam = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "Legacy Sales Team", type: "Sales", headManagerId: String(manager1._id) });
    expect(existingTeam.status).toBe(201);

    await adminAgent.patch(`/api/v1/team-types/${salesType._id}`).send({ isActive: false });

    // The existing team's own type value is completely untouched.
    const stillThere = await adminAgent.get(`/api/v1/teams/${existingTeam.body.data._id}`);
    expect(stillThere.body.data.type).toBe("Sales");

    // But a brand-new team can no longer be created with the now-inactive type.
    const newTeamResponse = await adminAgent
      .post("/api/v1/teams")
      .send({ name: "New Sales Team", type: "Sales", headManagerId: String(manager2._id) });
    expect(newTeamResponse.status).toBe(400);
  });
});
