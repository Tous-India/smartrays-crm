import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Service from "./service.model.js";
import Notification from "../notification/notification.model.js";

/**
 * Services (§7.72). The fixtures exercise the ROLE TEMPLATE defaults on
 * purpose — no explicit `permissions` on any user — so what these tests prove
 * is the real shipped grant set, not a hand-built one:
 *
 *   admin                      everything, everyone
 *   manager1                   services.* — sees/assigns employee1 + employee2 (their team) and themselves
 *   employee1, employee2       services.view — own items only; reports to manager1
 *   employee3                  services.view — own items only; NOT on manager1's team
 *   manager2                   services.* — a second manager with NO team
 */
let app;
let adminAgent, manager1Agent, manager2Agent, employee1Agent, employee2Agent, employee3Agent;
let admin, manager1, manager2, employee1, employee2, employee3;

async function registerAs(payload) {
  const response = await adminAgent.post("/api/v1/auth/register").send({ password: "Password123", ...payload });
  return response.body.data;
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  admin = await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  manager1 = await registerAs({ name: "Manager One", email: "manager1@test.local", role: "manager" });
  manager2 = await registerAs({ name: "Manager Two", email: "manager2@test.local", role: "manager" });
  employee1 = await registerAs({ name: "Employee One", email: "employee1@test.local", role: "employee", managerId: manager1._id });
  employee2 = await registerAs({ name: "Employee Two", email: "employee2@test.local", role: "employee", managerId: manager1._id });
  // Deliberately NOT on manager1's team.
  employee3 = await registerAs({ name: "Employee Three", email: "employee3@test.local", role: "employee" });

  manager1Agent = await loginAsAgent(app, "manager1@test.local", "Password123");
  manager2Agent = await loginAsAgent(app, "manager2@test.local", "Password123");
  employee1Agent = await loginAsAgent(app, "employee1@test.local", "Password123");
  employee2Agent = await loginAsAgent(app, "employee2@test.local", "Password123");
  employee3Agent = await loginAsAgent(app, "employee3@test.local", "Password123");
});

afterEach(async () => {
  await Service.deleteMany({});
  await Notification.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

async function createAs(agent, overrides = {}) {
  const response = await agent.post("/api/v1/services").send({
    title: "Inspect inverter at site 4",
    assignedToId: String(employee1._id),
    ...overrides,
  });

  return response;
}

describe("POST /services — who may create, and for whom", () => {
  it("admin creates for anyone; the record carries creator, assignee and defaults", async () => {
    const response = await createAs(adminAgent, {
      description: "Check the DC isolator",
      dueDate: "2026-09-25",
      subtasks: [{ title: "Photograph the label" }, { title: "Log the serial", isDone: true }],
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      title: "Inspect inverter at site 4",
      description: "Check the DC isolator",
      status: "todo",
      assignedToId: String(employee1._id),
      createdById: String(admin._id),
      completedAt: null,
      completedById: null,
    });
    expect(response.body.data.subtasks).toHaveLength(2);
    expect(response.body.data.subtasks[1]).toMatchObject({ title: "Log the serial", isDone: true });
  });

  it("manager creates for their own team", async () => {
    const response = await createAs(manager1Agent, { assignedToId: String(employee2._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.createdById).toBe(String(manager1._id));
  });

  it("manager may assign to themselves", async () => {
    const response = await createAs(manager1Agent, { assignedToId: String(manager1._id) });

    expect(response.status).toBe(201);
  });

  it("manager CANNOT assign to someone outside their team — 400, nothing created", async () => {
    const response = await createAs(manager1Agent, { assignedToId: String(employee3._id) });

    expect(response.status).toBe(400);
    expect(await Service.countDocuments({})).toBe(0);
  });

  it("employee cannot create at all — 403 from the template grant", async () => {
    const response = await createAs(employee1Agent, { assignedToId: String(employee1._id) });

    expect(response.status).toBe(403);
  });

  it("rejects a missing title and a missing assignee", async () => {
    expect((await adminAgent.post("/api/v1/services").send({ assignedToId: String(employee1._id) })).status).toBe(400);
    expect((await adminAgent.post("/api/v1/services").send({ title: "x" })).status).toBe(400);
  });

  it("rejects a deactivated assignee", async () => {
    await adminAgent.patch(`/api/v1/users/${employee3._id}/deactivate`).send({});

    const response = await createAs(adminAgent, { assignedToId: String(employee3._id) });

    expect(response.status).toBe(400);
    await adminAgent.patch(`/api/v1/users/${employee3._id}/reactivate`).send({});
  });
});

describe("GET /services — scoped by the caller, every time", () => {
  async function seed() {
    await createAs(adminAgent, { title: "for employee1", assignedToId: String(employee1._id) });
    await createAs(adminAgent, { title: "for employee2", assignedToId: String(employee2._id) });
    await createAs(adminAgent, { title: "for employee3", assignedToId: String(employee3._id) });
    await createAs(adminAgent, { title: "for manager1", assignedToId: String(manager1._id) });
  }

  it("admin sees everyone's", async () => {
    await seed();

    const response = await adminAgent.get("/api/v1/services");

    expect(response.status).toBe(200);
    expect(response.body.data.map((s) => s.title).sort()).toEqual(
      ["for employee1", "for employee2", "for employee3", "for manager1"]
    );
  });

  it("manager sees their team's and their own — never employee3's", async () => {
    await seed();

    const response = await manager1Agent.get("/api/v1/services");

    expect(response.body.data.map((s) => s.title).sort()).toEqual(["for employee1", "for employee2", "for manager1"]);
  });

  it("a manager with no team sees nothing", async () => {
    await seed();

    const response = await manager2Agent.get("/api/v1/services");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("employee sees only what is assigned to them", async () => {
    await seed();

    const response = await employee1Agent.get("/api/v1/services");

    expect(response.body.data.map((s) => s.title)).toEqual(["for employee1"]);
  });

  it("?assignedTo can only narrow the scope, never widen it", async () => {
    await seed();

    // In scope → narrows.
    const own = await manager1Agent.get(`/api/v1/services?assignedTo=${employee2._id}`);
    expect(own.body.data.map((s) => s.title)).toEqual(["for employee2"]);

    // Out of scope → empty, not employee3's list.
    const outside = await manager1Agent.get(`/api/v1/services?assignedTo=${employee3._id}`);
    expect(outside.status).toBe(200);
    expect(outside.body.data).toEqual([]);

    // An employee asking for a colleague gets nothing.
    const colleague = await employee1Agent.get(`/api/v1/services?assignedTo=${employee2._id}`);
    expect(colleague.body.data).toEqual([]);
  });

  it("?status filters within the scope", async () => {
    await seed();
    const mine = (await employee1Agent.get("/api/v1/services")).body.data[0];
    await employee1Agent.patch(`/api/v1/services/${mine._id}/status`).send({ status: "completed" });

    const todo = await adminAgent.get("/api/v1/services?status=todo");
    const completed = await adminAgent.get("/api/v1/services?status=completed");

    expect(todo.body.data).toHaveLength(3);
    expect(completed.body.data.map((s) => s.title)).toEqual(["for employee1"]);
  });
});

describe("GET /services/:id — an out-of-scope service is a 404, not a 403", () => {
  it("employee cannot fetch another employee's service by direct call", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee2._id) });

    const response = await employee1Agent.get(`/api/v1/services/${created.body.data._id}`);

    expect(response.status).toBe(404);
  });

  it("manager cannot fetch a service assigned outside their team", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee3._id) });

    const response = await manager1Agent.get(`/api/v1/services/${created.body.data._id}`);

    expect(response.status).toBe(404);
  });

  it("the assignee and their manager both can", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee1._id) });

    expect((await employee1Agent.get(`/api/v1/services/${created.body.data._id}`)).status).toBe(200);
    expect((await manager1Agent.get(`/api/v1/services/${created.body.data._id}`)).status).toBe(200);
  });
});

describe("GET /services/assignees — the scoped picker", () => {
  it("admin gets every active user", async () => {
    const response = await adminAgent.get("/api/v1/services/assignees");

    expect(response.status).toBe(200);
    const names = response.body.data.map((u) => u.name);
    expect(names).toEqual(expect.arrayContaining(["Employee One", "Employee Two", "Employee Three", "Manager One", "Manager Two"]));
  });

  it("manager gets their team and themselves only", async () => {
    const response = await manager1Agent.get("/api/v1/services/assignees");

    expect(response.body.data.map((u) => u.name).sort()).toEqual(["Employee One", "Employee Two", "Manager One"]);
  });

  it("employee gets 403 — no create grant, no picker", async () => {
    expect((await employee1Agent.get("/api/v1/services/assignees")).status).toBe(403);
  });
});

describe("PATCH /services/:id — edit and reassign", () => {
  it("manager edits fields and reassigns within their team; the new assignee is notified", async () => {
    const created = await createAs(manager1Agent, { assignedToId: String(employee1._id) });
    await Notification.deleteMany({});

    const response = await manager1Agent.patch(`/api/v1/services/${created.body.data._id}`).send({
      title: "Inspect inverter at site 4 — URGENT",
      assignedToId: String(employee2._id),
      dueDate: "2026-09-22",
      subtasks: [{ title: "Bring the meter" }],
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      title: "Inspect inverter at site 4 — URGENT",
      assignedToId: String(employee2._id),
    });
    expect(response.body.data.subtasks).toHaveLength(1);

    const notified = await Notification.find({ userId: employee2._id, type: "service_assigned" });
    expect(notified).toHaveLength(1);
    expect(notified[0].message).toContain("Manager One assigned you");
  });

  it("manager cannot reassign outside their team", async () => {
    const created = await createAs(manager1Agent, { assignedToId: String(employee1._id) });

    const response = await manager1Agent
      .patch(`/api/v1/services/${created.body.data._id}`)
      .send({ assignedToId: String(employee3._id) });

    expect(response.status).toBe(400);
  });

  it("employee cannot edit — 403", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee1._id) });

    const response = await employee1Agent.patch(`/api/v1/services/${created.body.data._id}`).send({ title: "mine now" });

    expect(response.status).toBe(403);
  });

  it("status is not editable here — use the status endpoint", async () => {
    const created = await createAs(adminAgent);

    const response = await adminAgent.patch(`/api/v1/services/${created.body.data._id}`).send({ status: "completed" });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /services/:id/status", () => {
  it("the assignee (view only) can complete their own, and completedAt/By are stamped", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee1._id) });

    const response = await employee1Agent
      .patch(`/api/v1/services/${created.body.data._id}/status`)
      .send({ status: "completed" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("completed");
    expect(response.body.data.completedById).toBe(String(employee1._id));
    expect(response.body.data.completedAt).not.toBeNull();
  });

  it("reopening clears completedAt/By", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee1._id) });
    await employee1Agent.patch(`/api/v1/services/${created.body.data._id}/status`).send({ status: "completed" });

    const response = await manager1Agent
      .patch(`/api/v1/services/${created.body.data._id}/status`)
      .send({ status: "todo" });

    expect(response.body.data).toMatchObject({ status: "todo", completedAt: null, completedById: null });
  });

  it("someone else's employee cannot touch it — 404 (out of scope)", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee2._id) });

    const response = await employee1Agent
      .patch(`/api/v1/services/${created.body.data._id}/status`)
      .send({ status: "completed" });

    expect(response.status).toBe(404);
  });

  it("rejects an unknown status", async () => {
    const created = await createAs(adminAgent);

    const response = await adminAgent
      .patch(`/api/v1/services/${created.body.data._id}/status`)
      .send({ status: "in_progress" });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /services/:id", () => {
  it("manager deletes within scope; employee cannot delete at all", async () => {
    const created = await createAs(manager1Agent, { assignedToId: String(employee1._id) });

    expect((await employee1Agent.delete(`/api/v1/services/${created.body.data._id}`)).status).toBe(403);
    expect((await manager1Agent.delete(`/api/v1/services/${created.body.data._id}`)).status).toBe(200);
    expect(await Service.findById(created.body.data._id)).toBeNull();
  });

  it("manager cannot delete outside their team — 404", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee3._id) });

    expect((await manager1Agent.delete(`/api/v1/services/${created.body.data._id}`)).status).toBe(404);
    expect(await Service.findById(created.body.data._id)).not.toBeNull();
  });
});

describe("notifications — the existing fan-out, not a new path", () => {
  it("assigning notifies the assignee once, with the module reference", async () => {
    const created = await createAs(adminAgent, { assignedToId: String(employee1._id) });

    const notified = await Notification.find({ userId: employee1._id, type: "service_assigned" });

    expect(notified).toHaveLength(1);
    expect(String(notified[0].relatedEntity.id)).toBe(String(created.body.data._id));
    expect(notified[0].relatedEntity.module).toBe("services");
  });

  it("assigning to yourself does not notify you", async () => {
    await createAs(manager1Agent, { assignedToId: String(manager1._id) });

    expect(await Notification.countDocuments({ userId: manager1._id, type: "service_assigned" })).toBe(0);
  });
});

/**
 * §7.72 — subtasks the assignee can actually work through. Same gating shape
 * as the status endpoint: `services.view` at the route, assignee-or-edit
 * inside, service-level scope (404, never 403) for anyone else's.
 */
describe("PATCH /services/:id/subtasks/:subtaskId", () => {
  async function createWithSubtasks(agent = adminAgent, assignedToId = String(employee1._id)) {
    const response = await agent.post("/api/v1/services").send({
      title: "Commission the inverter",
      assignedToId,
      subtasks: [{ title: "Photograph the label" }, { title: "Log the serial" }],
    });

    return response.body.data;
  }

  it("the assignee (view only) can tick a subtask done, and untick it; the count is live in the response", async () => {
    const service = await createWithSubtasks();
    const [first] = service.subtasks;

    const done = await employee1Agent
      .patch(`/api/v1/services/${service._id}/subtasks/${first._id}`)
      .send({ isDone: true });

    expect(done.status).toBe(200);
    expect(done.body.data.subtasks[0]).toMatchObject({ title: "Photograph the label", isDone: true });
    expect(done.body.data.subtasks[1].isDone).toBe(false);

    const undone = await employee1Agent
      .patch(`/api/v1/services/${service._id}/subtasks/${first._id}`)
      .send({ isDone: false });

    expect(undone.body.data.subtasks[0].isDone).toBe(false);
  });

  it("persists — a fresh fetch shows the tick", async () => {
    const service = await createWithSubtasks();
    await employee1Agent.patch(`/api/v1/services/${service._id}/subtasks/${service.subtasks[1]._id}`).send({ isDone: true });

    const fetched = await employee1Agent.get(`/api/v1/services/${service._id}`);

    expect(fetched.body.data.subtasks.map((subtask) => subtask.isDone)).toEqual([false, true]);
  });

  it("an employee cannot toggle a subtask on someone else's service — 404, not 403", async () => {
    const theirs = await createWithSubtasks(adminAgent, String(employee2._id));

    const response = await employee1Agent
      .patch(`/api/v1/services/${theirs._id}/subtasks/${theirs.subtasks[0]._id}`)
      .send({ isDone: true });

    expect(response.status).toBe(404);
    const untouched = await Service.findById(theirs._id);
    expect(untouched.subtasks[0].isDone).toBe(false);
  });

  it("manager toggles within their team; admin anywhere; manager outside their team gets 404", async () => {
    const teamOne = await createWithSubtasks(adminAgent, String(employee1._id));
    const outside = await createWithSubtasks(adminAgent, String(employee3._id));

    expect(
      (await manager1Agent.patch(`/api/v1/services/${teamOne._id}/subtasks/${teamOne.subtasks[0]._id}`).send({ isDone: true })).status
    ).toBe(200);
    expect(
      (await adminAgent.patch(`/api/v1/services/${outside._id}/subtasks/${outside.subtasks[0]._id}`).send({ isDone: true })).status
    ).toBe(200);
    expect(
      (await manager1Agent.patch(`/api/v1/services/${outside._id}/subtasks/${outside.subtasks[1]._id}`).send({ isDone: true })).status
    ).toBe(404);
  });

  it("an in-scope viewer who is neither the assignee nor an editor is refused — 403", async () => {
    // employee2 is on manager1's team but is not the assignee and holds only view;
    // they can SEE nothing of employee1's (own-only scope), so this is a 404 for
    // them. The 403 case needs someone in scope without edit: there is no such
    // role by template, so it is exercised by granting an override.
    const service = await createWithSubtasks(adminAgent, String(employee1._id));
    // Widen employee2's scope artificially is not possible (scope is by role),
    // so assert the rule at the service layer instead.
    const { changeSubtaskDone } = await import("./service.service.js");
    const { default: User } = await import("../user/user.model.js");
    const viewerInScope = await User.findOne({ email: "manager1@test.local" }); // in scope of employee1's item
    viewerInScope.permissions = { ...viewerInScope.permissions, services: { view: true } }; // strip edit, keep view

    await expect(changeSubtaskDone(service._id, service.subtasks[0]._id, true, viewerInScope)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("404 for an unknown subtask id on a service the caller can see", async () => {
    const service = await createWithSubtasks();

    const response = await employee1Agent
      .patch(`/api/v1/services/${service._id}/subtasks/507f1f77bcf86cd799439011`)
      .send({ isDone: true });

    expect(response.status).toBe(404);
  });

  it("rejects a non-boolean isDone", async () => {
    const service = await createWithSubtasks();

    const response = await employee1Agent
      .patch(`/api/v1/services/${service._id}/subtasks/${service.subtasks[0]._id}`)
      .send({ isDone: "yes" });

    expect(response.status).toBe(400);
  });

  it("ticking every subtask does NOT complete the service — completing is a separate, deliberate action", async () => {
    const service = await createWithSubtasks();

    for (const subtask of service.subtasks) {
      await employee1Agent.patch(`/api/v1/services/${service._id}/subtasks/${subtask._id}`).send({ isDone: true });
    }

    const fetched = await employee1Agent.get(`/api/v1/services/${service._id}`);
    expect(fetched.body.data.subtasks.every((subtask) => subtask.isDone)).toBe(true);
    expect(fetched.body.data.status).toBe("todo");
    expect(fetched.body.data.completedAt).toBeNull();
  });
});
