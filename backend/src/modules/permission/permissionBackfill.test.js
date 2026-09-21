import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { completePermissions } from "../../../tests/helpers/permissionBody.js";
import { PERMISSION_REGISTRY } from "../../constants/permissionRegistry.constants.js";
import { reconcileAllRoleTemplates, reconcileUserPermissions } from "./permission.service.js";
import User from "../user/user.model.js";

/**
 * §7.12c — the boot-time User.permissions backfill, and the validator that
 * keeps it safe.
 *
 * THE RULE, EXACTLY: for each user, for each module key ABSENT on
 * `User.permissions` but PRESENT on their role's stored template, copy the
 * template's value. NEVER modify a key that is present, whatever its value.
 *
 * It relies on one invariant — the Permissions UI writes every registry
 * module explicitly, so "absent" means "never decided" and "present" means
 * "deliberately set". The validator test at the bottom is what makes that
 * invariant enforceable server-side; the frontend asserts the UI half in
 * permissionModel.test.js.
 */
let app;
let adminAgent;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearAllCollections();
  await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
  // Phase 1 must have run for the templates to carry `services` at all.
  await reconcileAllRoleTemplates();
});

async function permissionsOf(email) {
  const user = await User.findOne({ email }).select("permissions");
  return user.permissions;
}

describe("reconcileUserPermissions — the backfill phase", () => {
  it("a user missing a module key gains the template's value; present keys are untouched", async () => {
    // Created before `services` existed: holds leave, nothing about services.
    await createUserDirectly({
      name: "Old Employee",
      email: "old@test.local",
      password: "Password123",
      role: "employee",
      permissions: { leave: { view: true } },
    });

    const changes = await reconcileUserPermissions();

    const after = await permissionsOf("old@test.local");
    expect(after.services).toEqual({ view: true });
    expect(after.leave).toEqual({ view: true });
    expect(changes).toEqual([
      expect.objectContaining({ email: "old@test.local", role: "employee", added: expect.arrayContaining(["services"]) }),
    ]);
  });

  it("a deliberate all-false module SURVIVES — the test that matters", async () => {
    await createUserDirectly({
      name: "Denied Employee",
      email: "denied@test.local",
      password: "Password123",
      role: "employee",
      permissions: { ...completePermissions(), services: { view: false, create: false, edit: false, delete: false } },
    });

    const changes = await reconcileUserPermissions();

    expect((await permissionsOf("denied@test.local")).services).toEqual({ view: false, create: false, edit: false, delete: false });
    expect(changes.find((change) => change.email === "denied@test.local")).toBeUndefined();
  });

  it("a present-but-empty module ({}) is also left alone", async () => {
    await createUserDirectly({
      name: "Empty Employee",
      email: "empty@test.local",
      password: "Password123",
      role: "employee",
      permissions: { services: {} },
    });

    await reconcileUserPermissions();

    expect((await permissionsOf("empty@test.local")).services).toEqual({});
  });

  it("a per-user override EXCEEDING the template is not downgraded", async () => {
    // Manager holding services already, plus a `payments` grant the manager
    // template never gives.
    await createUserDirectly({
      name: "Powerful Manager",
      email: "power@test.local",
      password: "Password123",
      role: "manager",
      permissions: {
        services: { view: true, create: true, edit: true, delete: true },
        payments: { view: true, create: true },
        leads: { view: true, create: true, edit: true, delete: true },
      },
    });

    const changes = await reconcileUserPermissions();

    const after = await permissionsOf("power@test.local");
    expect(after.payments).toEqual({ view: true, create: true });
    expect(after.services).toEqual({ view: true, create: true, edit: true, delete: true });
    // Other template modules they never had (customers, attendance, …) are
    // added — that IS the backfill — but nothing present changed.
    expect(after.leads).toEqual({ view: true, create: true, edit: true, delete: true });
    const mine = changes.find((change) => change.email === "power@test.local");
    expect(mine?.added ?? []).not.toContain("services");
    expect(mine?.added ?? []).not.toContain("payments");
  });

  it("runs twice: the second run changes nothing", async () => {
    await createUserDirectly({ name: "Old Employee", email: "old@test.local", password: "Password123", role: "employee", permissions: { leave: { view: true } } });

    const first = await reconcileUserPermissions();
    const second = await reconcileUserPermissions();

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it("follows RECONCILABLE_ROLES exactly: admin is excluded; customer is NOT — it is reconcilable today", async () => {
    // RECONCILABLE_ROLES is ["manager", "sales_associate", "employee", "customer"].
    // Admin's template is {} and admin bypasses can(), so there is nothing to
    // copy and nothing is touched. A portal account created before the
    // customer template gained its ticket grants DOES receive them — the same
    // treatment phase 1 already gives the customer template.
    await createUserDirectly({ name: "Portal", email: "portal@test.local", password: "Password123", role: "customer", permissions: {} });

    const changes = await reconcileUserPermissions();

    expect(changes.find((change) => change.email === "admin@test.local")).toBeUndefined();
    expect((await permissionsOf("admin@test.local")).services).toBeUndefined();

    const portal = changes.find((change) => change.email === "portal@test.local");
    expect(portal.added).toEqual(["tickets"]);
    expect((await permissionsOf("portal@test.local")).tickets).toEqual({ create: true, view_own: true });
  });

  it("logs what it changed — a silent mutation of permissions at boot is not acceptable", async () => {
    await createUserDirectly({ name: "Old Employee", email: "old@test.local", password: "Password123", role: "employee", permissions: {} });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await reconcileUserPermissions();

    const lines = log.mock.calls.map((call) => call.join(" "));
    expect(lines.some((line) => /User permission backfill/.test(line) && /1 user/.test(line))).toBe(true);
    expect(lines.some((line) => /Old Employee/.test(line) && /services/.test(line))).toBe(true);
    log.mockRestore();
  });
});

describe("PATCH /users/:id/permissions — partial bodies are rejected (the hole, closed)", () => {
  async function createTarget() {
    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Target", email: "target@test.local", password: "Password123", role: "employee",
    });
    return response.body.data._id;
  }

  it("rejects a body that omits registry modules, naming what is missing", async () => {
    const id = await createTarget();

    const response = await adminAgent.patch(`/api/v1/users/${id}/permissions`).send({
      permissions: { leads: { view: true } },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/every registry module/i);
    expect(response.body.message).toMatch(/services/);
    expect(response.body.message).toMatch(/customers/);
    expect(response.body.message).not.toMatch(/\bleads\b.*missing/);
  });

  it("accepts the shape the UI sends — every module, every action, explicit booleans", async () => {
    const id = await createTarget();
    const body = completePermissions({ leads: { view: true }, services: { view: true } });

    const response = await adminAgent.patch(`/api/v1/users/${id}/permissions`).send({ permissions: body });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data.permissions).sort()).toEqual(Object.keys(PERMISSION_REGISTRY).sort());
    expect(response.body.data.permissions.services).toEqual({ view: true, create: false, edit: false, delete: false });
  });

  it("the template PATCH keeps accepting partial bodies — templates are partial by construction", async () => {
    const response = await adminAgent.patch("/api/v1/permissions/templates/employee").send({
      permissions: { leads: { view: true } },
    });

    expect(response.status).toBe(200);
  });
});
