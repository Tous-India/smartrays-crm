import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import User from "./user.model.js";
import Team from "../team/team.model.js";

let app;
let adminAgent, managerAgent, employeeAgent, otherManagerAgent;
let manager, otherManager, employee;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Team.deleteMany({});

  await createUserDirectly({
    name: "Admin",
    email: "admin@self.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@self.local", "AdminPass123!");

  manager = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Manager",
      email: "manager@self.local",
      password: "Password123",
      role: "manager",
    })
  ).body.data;
  managerAgent = await loginAsAgent(app, "manager@self.local", "Password123");

  otherManager = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Other Manager",
      email: "other@self.local",
      password: "Password123",
      role: "manager",
    })
  ).body.data;
  otherManagerAgent = await loginAsAgent(app, "other@self.local", "Password123");

  employee = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Employee",
      email: "employee@self.local",
      password: "Password123",
      role: "employee",
      managerId: manager._id,
    })
  ).body.data;
  employeeAgent = await loginAsAgent(app, "employee@self.local", "Password123");
});

/**
 * §7.39 — `PATCH /users/me` is the obvious privilege-escalation target, so
 * these assert it REJECTS rather than silently ignores. A silent drop returns
 * 200 and looks like success, hiding both client bugs and real attempts.
 */
describe("PATCH /users/me — self-update whitelist", () => {
  it("rejects an attempt to change own role", async () => {
    const response = await employeeAgent.patch("/api/v1/users/me").send({ role: "admin" });

    expect(response.status).toBe(403);
    const after = await User.findById(employee._id);
    expect(after.role).toBe("employee");
  });

  it.each(["role", "permissions", "managerId", "email", "isActive", "teamId"])(
    "rejects %s even when sent alongside a legitimate field",
    async (field) => {
      await User.updateOne({ _id: employee._id }, { $set: { canEditOwnProfile: true } });

      const response = await employeeAgent
        .patch("/api/v1/users/me")
        .send({ name: "Legit Name", [field]: field === "isActive" ? false : "tampered" });

      expect(response.status).toBe(403);
      // The legitimate field must NOT have been applied either — the whole
      // request is refused, not partially honoured.
      const after = await User.findById(employee._id);
      expect(after.name).toBe("Employee");
    }
  );

  it("rejects a password change through this endpoint — that needs the current password", async () => {
    const response = await employeeAgent.patch("/api/v1/users/me").send({ password: "NewPass123" });

    expect(response.status).toBe(403);
  });

  it("rejects name/phone when canEditOwnProfile is false", async () => {
    const response = await employeeAgent.patch("/api/v1/users/me").send({ name: "Renamed" });

    expect(response.status).toBe(403);
    expect((await User.findById(employee._id)).name).toBe("Employee");
  });

  it("allows name/phone once canEditOwnProfile is true", async () => {
    await User.updateOne({ _id: employee._id }, { $set: { canEditOwnProfile: true } });

    const response = await employeeAgent
      .patch("/api/v1/users/me")
      .send({ name: "Renamed", phone: "5551234" });

    expect(response.status).toBe(200);
    const after = await User.findById(employee._id);
    expect(after.name).toBe("Renamed");
    expect(after.phone).toBe("5551234");
  });

  it("always allows a photo, regardless of canEditOwnProfile", async () => {
    const response = await employeeAgent
      .patch("/api/v1/users/me")
      .send({ photo: "https://cdn.test/me.jpg" });

    expect(response.status).toBe(200);
    expect((await User.findById(employee._id)).photo).toBe("https://cdn.test/me.jpg");
  });

  it("rejects an unrecognised field rather than ignoring it", async () => {
    const response = await employeeAgent.patch("/api/v1/users/me").send({ nickname: "Ace" });

    expect(response.status).toBe(400);
  });
});

describe("GET /users/me/permissions", () => {
  it("returns the caller's OWN role and permissions", async () => {
    const response = await employeeAgent.get("/api/v1/users/me/permissions");

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("employee");
    expect(response.body.data.permissions).toBeDefined();
  });

  it("does not leak anyone else's — there is no id to pass", async () => {
    const response = await employeeAgent.get("/api/v1/users/me/permissions");

    expect(response.body.data.role).not.toBe("admin");
  });

  it("leaves the admin-only per-user endpoint untouched for a non-admin", async () => {
    const response = await employeeAgent.get(`/api/v1/users/${manager._id}/permissions`);

    expect([401, 403]).toContain(response.status);
  });
});

describe("PATCH /users/:id/can-edit-own-profile", () => {
  it("lets the person's own manager grant it", async () => {
    const response = await managerAgent
      .patch(`/api/v1/users/${employee._id}/can-edit-own-profile`)
      .send({ canEditOwnProfile: true });

    expect(response.status).toBe(200);
    expect((await User.findById(employee._id)).canEditOwnProfile).toBe(true);
  });

  it("lets an admin grant it", async () => {
    const response = await adminAgent
      .patch(`/api/v1/users/${employee._id}/can-edit-own-profile`)
      .send({ canEditOwnProfile: true });

    expect(response.status).toBe(200);
  });

  it("refuses a manager who is NOT that person's manager", async () => {
    const response = await otherManagerAgent
      .patch(`/api/v1/users/${employee._id}/can-edit-own-profile`)
      .send({ canEditOwnProfile: true });

    expect(response.status).toBe(403);
    expect((await User.findById(employee._id)).canEditOwnProfile).toBe(false);
  });

  it("refuses the user granting it to themselves — that would make the flag meaningless", async () => {
    const response = await employeeAgent
      .patch(`/api/v1/users/${employee._id}/can-edit-own-profile`)
      .send({ canEditOwnProfile: true });

    expect(response.status).toBe(403);
  });
});

describe("Team contact visibility", () => {
  async function createTeamHeadedBy(headId) {
    return (
      await adminAgent.post("/api/v1/teams").send({ name: "Self Team", headManagerId: String(headId) })
    ).body.data;
  }

  it("OMITS contact fields from the payload when showContactsToMembers is false", async () => {
    const team = await createTeamHeadedBy(manager._id);

    const response = await managerAgent.get(`/api/v1/teams/${team._id}/members`);

    expect(response.status).toBe(200);
    const [member] = response.body.data;
    expect(member.name).toBe("Employee");
    // Absent from the payload entirely, not merely blank.
    expect(member).not.toHaveProperty("email");
    expect(member).not.toHaveProperty("phone");
  });

  it("includes them once the team head opts in", async () => {
    const team = await createTeamHeadedBy(manager._id);
    await managerAgent
      .patch(`/api/v1/teams/${team._id}/show-contacts`)
      .send({ showContactsToMembers: true })
      .expect(200);

    const response = await managerAgent.get(`/api/v1/teams/${team._id}/members`);

    expect(response.body.data[0].email).toBe("employee@self.local");
  });

  it("refuses a manager who does not head that team", async () => {
    const team = await createTeamHeadedBy(manager._id);

    const response = await otherManagerAgent
      .patch(`/api/v1/teams/${team._id}/show-contacts`)
      .send({ showContactsToMembers: true });

    // 404 rather than 403: a manager has no legitimate way to learn that
    // another team's id exists (see team.service.js#ensureCanReadTeam).
    expect([403, 404]).toContain(response.status);
    expect((await Team.findById(team._id)).showContactsToMembers).toBe(false);
  });

  it("lets an admin toggle any team's flag", async () => {
    const team = await createTeamHeadedBy(manager._id);

    const response = await adminAgent
      .patch(`/api/v1/teams/${team._id}/show-contacts`)
      .send({ showContactsToMembers: true });

    expect(response.status).toBe(200);
  });
});

/**
 * §7.39 — `GET /teams/mine` exists because an employee holds NO `teams.*`
 * grant, so `GET /teams` 403s for them and the employee Team page would be
 * impossible without a self endpoint.
 */
describe("GET /teams/mine", () => {
  async function createTeamHeadedByManager() {
    return (
      await adminAgent.post("/api/v1/teams").send({ name: "Self Team", headManagerId: String(manager._id) })
    ).body.data;
  }

  it("returns the caller's own team, naming the head separately from the members", async () => {
    await createTeamHeadedByManager();

    const response = await employeeAgent.get("/api/v1/teams/mine");

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Self Team");
    expect(response.body.data.head.name).toBe("Manager");
    expect(response.body.data.members.map((m) => m.name)).toContain("Employee");
  });

  it("omits contact fields for head AND members when the team hasn't opted in", async () => {
    await createTeamHeadedByManager();

    const response = await employeeAgent.get("/api/v1/teams/mine");

    expect(response.body.data.head).not.toHaveProperty("email");
    expect(response.body.data.members[0]).not.toHaveProperty("email");
  });

  it("includes contacts once opted in", async () => {
    const team = await createTeamHeadedByManager();
    await managerAgent
      .patch(`/api/v1/teams/${team._id}/show-contacts`)
      .send({ showContactsToMembers: true });

    const response = await employeeAgent.get("/api/v1/teams/mine");

    expect(response.body.data.head.email).toBe("manager@self.local");
  });

  it("returns null for someone with no manager, rather than erroring", async () => {
    const response = await adminAgent.get("/api/v1/teams/mine");

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
  });
});
