import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { PERMISSION_REGISTRY } from "../../constants/permissionRegistry.constants.js";
import { reconcileRoleTemplate, reconcileAllRoleTemplates, RECONCILABLE_ROLES } from "./permission.service.js";
import RolePermissionTemplate from "./permission.model.js";

let app;
let adminAgent;
let nonAdminAgent;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

// Templates and users both get mutated heavily across these tests, so every
// test starts from a fully clean slate — matching auth.test.js's pattern
// rather than lead.test.js's shared-fixture one, since here the interaction
// between templates and users (not just users alone) is what's under test.
beforeEach(async () => {
  await clearAllCollections();

  await createUserDirectly({
    name: "Admin",
    email: "admin@test.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  await adminAgent.post("/api/v1/auth/register").send({
    name: "Non Admin",
    email: "nonadmin@test.local",
    password: "Password123",
    role: "employee",
  });
  nonAdminAgent = await loginAsAgent(app, "nonadmin@test.local", "Password123");
});

describe("GET /permissions/registry", () => {
  it("returns the expected structural shape", async () => {
    const response = await adminAgent.get("/api/v1/permissions/registry");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(PERMISSION_REGISTRY);
  });
});

describe("Template CRUD", () => {
  it("lazily seeds and lists all 5 role templates", async () => {
    const response = await adminAgent.get("/api/v1/permissions/templates");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    const roles = response.body.data.map((template) => template.role).sort();
    expect(roles).toEqual(["admin", "customer", "employee", "manager", "sales_associate"].sort());
  });

  it("admin can view a role's template, seeded from the §5 permission matrix", async () => {
    const response = await adminAgent.get("/api/v1/permissions/templates/manager");

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("manager");
    expect(response.body.data.permissions).toEqual({
      leads: { view: true, create: true, edit: true, delete: true },
      location: { view_team: true },
      users: { view_team: true },
      customers: { view: true, create: true, edit: true, delete: true },
      credentials: { view: true },
      projects: { view: true, assign_team: true },
      attendance: { view_team: true },
      leave: {
        view: true,
        view_team: true,
        approve: true,
        decline: true,
        mark_unapproved_absence: true,
        delete: true,
      },
      travelLogs: { view_team: true },
      tickets: { create: true, assign: true, view_all: true },
      amc: { view: true, edit: true },
      // Read-only org-structure visibility (2026-08-05) — scoped to the
      // team(s) this manager heads. Deliberately not `manage`.
      teams: { view_team: true },
    });
  });

  it("admin can edit a role's template", async () => {
    const response = await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: true } },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.permissions).toEqual({ leads: { view: true } });
    expect(response.body.data.updatedBy).toBeDefined();
  });

  it("rejects an invalid role param", async () => {
    const response = await adminAgent.get("/api/v1/permissions/templates/not_a_real_role");

    expect(response.status).toBe(400);
  });
});

describe("Non-retroactivity and creation-time seeding", () => {
  it("editing a role's template does NOT retroactively change an existing user's permissions", async () => {
    const created = await adminAgent.post("/api/v1/auth/register").send({
      name: "Retro Test",
      email: "retrotest@test.local",
      password: "Password123",
      role: "employee",
    });
    const originalPermissions = created.body.data.permissions;

    await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: true } },
    });

    const afterEdit = await adminAgent.get(`/api/v1/users/${created.body.data._id}/permissions`);

    expect(afterEdit.body.data).toEqual(originalPermissions);
  });

  it("a newly created user is seeded from the CURRENT template, not the original defaults", async () => {
    await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: true } },
    });

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "New After Edit",
      email: "newafteredit@test.local",
      password: "Password123",
      role: "employee",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.permissions).toEqual({ leads: { view: true } });
  });
});

describe("Per-user permission overrides are isolated", () => {
  it("editing one user's permissions never affects the template or another user with the same role", async () => {
    const userAResponse = await adminAgent.post("/api/v1/auth/register").send({
      name: "User A",
      email: "usera@test.local",
      password: "Password123",
      role: "employee",
    });
    const userBResponse = await adminAgent.post("/api/v1/auth/register").send({
      name: "User B",
      email: "userb@test.local",
      password: "Password123",
      role: "employee",
    });
    const templateBefore = await adminAgent.get("/api/v1/permissions/templates/employee");

    const editResponse = await adminAgent
      .patch(`/api/v1/users/${userAResponse.body.data._id}/permissions`)
      .send({ permissions: { leads: { delete: true } } });

    const templateAfter = await adminAgent.get("/api/v1/permissions/templates/employee");
    const userBAfter = await adminAgent.get(`/api/v1/users/${userBResponse.body.data._id}/permissions`);

    expect(editResponse.status).toBe(200);
    expect(editResponse.body.data.permissions).toEqual({ leads: { delete: true } });
    expect(templateAfter.body.data.permissions).toEqual(templateBefore.body.data.permissions);
    expect(userBAfter.body.data).toEqual(userBResponse.body.data.permissions);
  });
});

describe("POST /users/:id/permissions/reset", () => {
  it("overwrites a customized user with the role's CURRENT template, not creation-time or customized values", async () => {
    // 1. Register — gets the employee template as it exists right now.
    const created = await adminAgent.post("/api/v1/auth/register").send({
      name: "Reset Test",
      email: "resettest@test.local",
      password: "Password123",
      role: "employee",
    });
    const userId = created.body.data._id;

    // 2. Customize this one user's permissions to something unique.
    await adminAgent.patch(`/api/v1/users/${userId}/permissions`).send({
      permissions: { location: { view: true, view_team: true }, leads: { view: true } },
    });

    // 3. Change the employee TEMPLATE to something different again, AFTER
    // both the creation and the customization above.
    await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: true, create: true } },
    });

    // 4. Reset — should match step 3's values, not step 1's or step 2's.
    const resetResponse = await adminAgent.post(`/api/v1/users/${userId}/permissions/reset`);

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.data.permissions).toEqual({ leads: { view: true, create: true } });
  });
});

describe("Registry validation", () => {
  it("rejects an unknown permission module on a template edit", async () => {
    const response = await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { notARealModule: { view: true } },
    });

    expect(response.status).toBe(400);
  });

  it("rejects an unknown permission action for a known module on a template edit", async () => {
    const response = await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { notARealAction: true } },
    });

    expect(response.status).toBe(400);
  });

  it("rejects an unknown permission module on a per-user override", async () => {
    const created = await adminAgent.post("/api/v1/auth/register").send({
      name: "Validation Test",
      email: "validationtest@test.local",
      password: "Password123",
      role: "employee",
    });

    const response = await adminAgent
      .patch(`/api/v1/users/${created.body.data._id}/permissions`)
      .send({ permissions: { notARealModule: { view: true } } });

    expect(response.status).toBe(400);
  });

  it("rejects a non-boolean permission value", async () => {
    const response = await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: "yes" } },
    });

    expect(response.status).toBe(400);
  });
});

describe("Non-admin access is denied on every endpoint in this module", () => {
  it("blocks GET /permissions/registry", async () => {
    const response = await nonAdminAgent.get("/api/v1/permissions/registry");
    expect(response.status).toBe(403);
  });

  it("blocks GET /permissions/templates", async () => {
    const response = await nonAdminAgent.get("/api/v1/permissions/templates");
    expect(response.status).toBe(403);
  });

  it("blocks GET /permissions/templates/:role", async () => {
    const response = await nonAdminAgent.get("/api/v1/permissions/templates/manager");
    expect(response.status).toBe(403);
  });

  it("blocks PATCH /permissions/templates/:role", async () => {
    const response = await nonAdminAgent
      .patch("/api/v1/permissions/templates/manager")
      .send({ permissions: {} });
    expect(response.status).toBe(403);
  });

  it("blocks GET /users/:id/permissions", async () => {
    const response = await nonAdminAgent.get("/api/v1/users/000000000000000000000000/permissions");
    expect(response.status).toBe(403);
  });

  it("blocks PATCH /users/:id/permissions", async () => {
    const response = await nonAdminAgent
      .patch("/api/v1/users/000000000000000000000000/permissions")
      .send({ permissions: {} });
    expect(response.status).toBe(403);
  });

  it("blocks POST /users/:id/permissions/reset", async () => {
    const response = await nonAdminAgent.post("/api/v1/users/000000000000000000000000/permissions/reset");
    expect(response.status).toBe(403);
  });
});

describe("RolePermissionTemplate drift reconciliation (§7.12b, 2026-08-03)", () => {
  // Seeds the role's template via the real `getOrCreateTemplate` code path
  // (through the existing GET endpoint, same as the "lazily seeds..." test
  // above) — an `upsert` straight against the model would bypass
  // `INITIAL_TEMPLATE_DEFAULTS` entirely and create an empty `{}` template,
  // which isn't what "a template that's drifted from its real defaults"
  // means.
  async function seedTemplate(role) {
    await adminAgent.get(`/api/v1/permissions/templates/${role}`);
  }

  it("adds a key missing from the stored template that code says should exist, with the code's default value", async () => {
    await seedTemplate("manager");
    // Strip out leave.delete directly to simulate the exact §7.5d scenario
    // (a template seeded BEFORE that key existed in code).
    await RolePermissionTemplate.updateOne({ role: "manager" }, { $unset: { "permissions.leave.delete": "" } });

    const before = await RolePermissionTemplate.findOne({ role: "manager" });
    expect(before.permissions.leave.delete).toBeUndefined();

    const result = await reconcileRoleTemplate("manager");

    expect(result.changed).toBe(true);
    expect(result.added).toContain("leave.delete");
    expect(result.removed).toEqual([]);

    const after = await RolePermissionTemplate.findOne({ role: "manager" });
    expect(after.permissions.leave.delete).toBe(true);
    // Every other leave action untouched by the same fix.
    expect(after.permissions.leave.view_team).toBe(true);
    expect(after.permissions.leave.approve).toBe(true);
  });

  it("removes an orphaned key no longer present in PERMISSION_REGISTRY", async () => {
    await seedTemplate("employee");
    // Simulate the real employee.tasks orphan generically — a module that
    // no longer exists anywhere in PERMISSION_REGISTRY (Task functionality
    // was fully removed 2026-07-29).
    await RolePermissionTemplate.updateOne(
      { role: "employee" },
      { $set: { "permissions.tasks": { view: true, assign: true } } }
    );

    const before = await RolePermissionTemplate.findOne({ role: "employee" });
    expect(before.permissions.tasks).toEqual({ view: true, assign: true });

    const result = await reconcileRoleTemplate("employee");

    expect(result.changed).toBe(true);
    expect(result.removed).toEqual(expect.arrayContaining(["tasks.view", "tasks.assign"]));

    const after = await RolePermissionTemplate.findOne({ role: "employee" });
    expect(after.permissions.tasks).toBeUndefined();
    // Employee's real, still-valid grants untouched.
    expect(after.permissions.leave.view).toBe(true);
  });

  it("removes only the invalid action within a module, keeping its still-valid actions", async () => {
    await seedTemplate("manager");
    // "leave.not_a_real_action" isn't in PERMISSION_REGISTRY.leave, but the
    // module itself is still valid and manager should keep its other leave
    // actions.
    await RolePermissionTemplate.updateOne(
      { role: "manager" },
      { $set: { "permissions.leave.not_a_real_action": true } }
    );

    const result = await reconcileRoleTemplate("manager");

    expect(result.removed).toEqual(["leave.not_a_real_action"]);

    const after = await RolePermissionTemplate.findOne({ role: "manager" });
    expect(after.permissions.leave.not_a_real_action).toBeUndefined();
    expect(after.permissions.leave.view).toBe(true);
    expect(after.permissions.leave.approve).toBe(true);
  });

  it("leaves a key an admin customized to a non-default value completely untouched", async () => {
    await seedTemplate("manager");
    // Simulate an admin having deliberately turned OFF manager's default
    // leave.approve grant via the Permissions UI.
    await RolePermissionTemplate.updateOne({ role: "manager" }, { $set: { "permissions.leave.approve": false } });

    const result = await reconcileRoleTemplate("manager");

    // leave.approve already exists (as false) — reconciliation must never
    // touch an existing key, regardless of its value.
    expect(result.added).not.toContain("leave.approve");

    const after = await RolePermissionTemplate.findOne({ role: "manager" });
    expect(after.permissions.leave.approve).toBe(false);
  });

  it("is idempotent — running it again immediately after finds nothing left to change", async () => {
    await seedTemplate("manager");
    await RolePermissionTemplate.updateOne({ role: "manager" }, { $unset: { "permissions.leave.delete": "" } });
    await RolePermissionTemplate.updateOne(
      { role: "manager" },
      { $set: { "permissions.notARealModule": { someAction: true } } }
    );

    const first = await reconcileRoleTemplate("manager");
    expect(first.changed).toBe(true);

    const second = await reconcileRoleTemplate("manager");
    expect(second).toEqual({ role: "manager", added: [], removed: [], changed: false });
  });

  it("a freshly-seeded template (never drifted) is already a no-op", async () => {
    const result = await reconcileRoleTemplate("sales_associate");

    expect(result.changed).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("reconcileAllRoleTemplates processes exactly the 4 non-admin roles, never admin", async () => {
    const results = await reconcileAllRoleTemplates();

    expect(results.map((result) => result.role)).toEqual(RECONCILABLE_ROLES);
    expect(RECONCILABLE_ROLES).not.toContain("admin");
  });
});
