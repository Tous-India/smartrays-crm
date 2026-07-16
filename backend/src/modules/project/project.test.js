import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Project from "./project.model.js";
import Task from "./task.model.js";

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
  await Task.deleteMany({});
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
  // the actual role-based projects/tasks permission defaults, not a
  // hand-picked override.
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

  // sales_associate has no projects/tasks grant by default — used for the
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

describe("POST /tasks (assign)", () => {
  it("a manager can assign a task to this project's team member", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });

    const response = await manager1Agent.post("/api/v1/tasks").send({
      projectId: project._id,
      title: "Design homepage",
      assignedToId: String(employee1._id),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("todo");
  });

  it("rejects assigning a task to someone who isn't this project's manager or a team member", async () => {
    const project = await createProjectDirectly({ projectManagerId: manager1._id });

    const response = await manager1Agent.post("/api/v1/tasks").send({
      projectId: project._id,
      title: "Design homepage",
      assignedToId: String(employee1._id),
    });

    expect(response.status).toBe(400);
  });

  it("blocks an employee (no tasks.assign grant) from creating a task", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });

    const response = await employee1Agent.post("/api/v1/tasks").send({
      projectId: project._id,
      title: "Design homepage",
      assignedToId: String(employee1._id),
    });

    expect(response.status).toBe(403);
  });
});

describe("PATCH /tasks/:id/start and /stop — one in_progress task per employee", () => {
  it("starts a todo task assigned to the caller", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });
    const task = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });

    const response = await employee1Agent.patch(`/api/v1/tasks/${task._id}/start`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("in_progress");
    expect(response.body.data.startedAt).not.toBeNull();
  });

  it("rejects starting a second task while one is already in_progress for the same employee", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });
    const taskA = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });
    const taskB = await Task.create({ projectId: project._id, title: "Task B", assignedToId: employee1._id });

    await employee1Agent.patch(`/api/v1/tasks/${taskA._id}/start`);

    const response = await employee1Agent.patch(`/api/v1/tasks/${taskB._id}/start`);

    expect(response.status).toBe(409);
  });

  it("lets a different employee start their own task while another employee's task is in_progress", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id, employee2._id],
    });
    const taskA = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });
    const taskB = await Task.create({ projectId: project._id, title: "Task B", assignedToId: employee2._id });

    await employee1Agent.patch(`/api/v1/tasks/${taskA._id}/start`);

    const response = await employee2Agent.patch(`/api/v1/tasks/${taskB._id}/start`);

    expect(response.status).toBe(200);
  });

  it("blocks a different employee from starting someone else's task", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id, employee2._id],
    });
    const task = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });

    const response = await employee2Agent.patch(`/api/v1/tasks/${task._id}/start`);

    expect(response.status).toBe(403);
  });

  it("stops an in_progress task and frees the employee to start another", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });
    const taskA = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });
    const taskB = await Task.create({ projectId: project._id, title: "Task B", assignedToId: employee1._id });

    await employee1Agent.patch(`/api/v1/tasks/${taskA._id}/start`);

    const stopResponse = await employee1Agent.patch(`/api/v1/tasks/${taskA._id}/stop`);
    expect(stopResponse.status).toBe(200);
    expect(stopResponse.body.data.status).toBe("done");

    const startBResponse = await employee1Agent.patch(`/api/v1/tasks/${taskB._id}/start`);
    expect(startBResponse.status).toBe(200);
  });

  it("rejects stopping a task that isn't currently in_progress", async () => {
    const project = await createProjectDirectly({
      projectManagerId: manager1._id,
      teamMemberIds: [employee1._id],
    });
    const task = await Task.create({ projectId: project._id, title: "Task A", assignedToId: employee1._id });

    const response = await employee1Agent.patch(`/api/v1/tasks/${task._id}/stop`);

    expect(response.status).toBe(409);
  });
});
