import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Project from "./project.model.js";

let app;
let adminAgent, manager1Agent, manager2Agent, employee1Agent, employee2Agent, sales1Agent;
let manager1, manager2, employee1, employee2, sales1;

// No POST /projects endpoint exists (§7.3 — projects are only ever created via
// the customer/contract automation, already covered in customer.test.js), so
// this module's own tests seed a Project directly, the same way
// location.test.js seeds an Attendance record directly for scenarios that
// aren't themselves testing the creation path.
async function createProjectDirectly({ projectManagerId, teamMemberIds = [] }) {
  return Project.create({
    name: "Test Project",
    customerId: "000000000000000000000001",
    projectManagerId,
    teamMemberIds,
    type: "onetime",
    status: "active",
  });
}

async function clearProjectData() {
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

  // Registered through the real /auth/register endpoint so these fixtures get
  // the actual role-based projects permission defaults, not a hand-picked
  // override.
  const manager1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager One",
    email: "manager1@test.local",
    password: "Password123",
    role: "manager",
  });
  manager1 = manager1Response.body.data;
  manager1Agent = await loginAsAgent(app, "manager1@test.local", "Password123");

  // A second manager, deliberately never made a project's own projectManagerId —
  // used to prove "Manager/Admin only" means THIS project's manager, not any
  // user holding the manager role.
  const manager2Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Manager Two",
    email: "manager2@test.local",
    password: "Password123",
  role: "manager",
  });
  manager2 = manager2Response.body.data;
  manager2Agent = await loginAsAgent(app, "manager2@test.local", "Password123");

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

  // sales_associate has no projects grant by default — used for the
  // no-permission-at-all case.
  const sales1Response = await adminAgent.post("/api/v1/auth/register").send({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
  });
  sales1 = sales1Response.body.data;
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");
});

afterEach(async () => {
  await clearProjectData();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("GET /projects", () => {
  it("admin sees every project", async () => {
    await createProjectDirectly({ projectManagerId: manager1._id });
    await createProjectDirectly({ projectManagerId: manager2._id });

    const response = await adminAgent.get("/api/v1/projects");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("a manager sees only projects they manage or are a team member of", async () => {
    await createProjectDirectly({ projectManagerId: manager1._id });
    await createProjectDirectly({ projectManagerId: manager2._id });

    const response = await manager1Agent.get("/api/v1/projects");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("an employee sees a project they're a team member of", async () => {
    await createProjectDirectly({ projectManagerId: manager1._id, teamMemberIds: [employee1._id] });

    const response = await employee1Agent.get("/api/v1/projects");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("returns 403 for a role with no projects.* grant at all", async () => {
    const response = await sales1Agent.get("/api/v1/projects");

    expect(response.status).toBe(403);
  });
});

describe("GET /projects/:id", () => {
  it("returns 404 (not 403) when a manager who isn't this project's manager or a team member requests it", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await manager2Agent.get(`/api/v1/projects/${project._id}`);

    expect(response.status).toBe(404);
  });
});

describe("POST /projects/:id/team", () => {
  it("lets this project's own manager add a team member", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await manager1Agent
      .post(`/api/v1/projects/${project._id}/team`)
      .send({ action: "add", userId: String(employee1._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.teamMemberIds).toContain(String(employee1._id));
  });

  it("lets this project's own manager remove a team member", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });

    const response = await manager1Agent
      .post(`/api/v1/projects/${project._id}/team`)
      .send({ action: "remove", userId: String(employee1._id) });

    expect(response.status).toBe(200);
    expect(response.body.data.teamMemberIds).not.toContain(String(employee1._id));
  });

  it("blocks a different manager (not this project's manager) from changing its team", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await manager2Agent
      .post(`/api/v1/projects/${project._id}/team`)
      .send({ action: "add", userId: String(employee1._id) });

    expect(response.status).toBe(403);
  });

  it("blocks an employee (no assign_team grant) at the route level", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await employee1Agent
      .post(`/api/v1/projects/${project._id}/team`)
      .send({ action: "add", userId: String(employee2._id) });

    expect(response.status).toBe(403);
  });

  it("lets an admin change any project's team", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await adminAgent
      .post(`/api/v1/projects/${project._id}/team`)
      .send({ action: "add", userId: String(employee1._id) });

    expect(response.status).toBe(200);
  });
});
