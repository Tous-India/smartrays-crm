import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import { completePermissions } from "../../../tests/helpers/permissionBody.js";

// Customer complaints redesign (2026-10-23): seeing every complaint and
// assigning them is its own permission — admin by default, grantable to any
// user (e.g. an office coordinator) from the Permissions screen.

let app;
let adminAgent;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("complaints permission", () => {
  it("is in the registry with view_all and assign", async () => {
    const { PERMISSION_REGISTRY } = await import("../../constants/permissionRegistry.constants.js");
    expect(PERMISSION_REGISTRY.complaints).toEqual(["view_all", "assign"]);
  });

  it("is not granted to any non-admin role by default", async () => {
    const response = await adminAgent.get("/api/v1/permissions/templates").expect(200);
    for (const template of response.body.data) {
      if (template.role === "admin") continue;
      expect(template.permissions.complaints?.assign ?? false).toBe(false);
      expect(template.permissions.complaints?.view_all ?? false).toBe(false);
    }
  });

  it("can be granted to an ordinary user without making them admin", async () => {
    const coordinator = (
      await adminAgent
        .post("/api/v1/auth/register")
        .send({ name: "Office Coordinator", email: "coord@test.local", password: "Password123", role: "employee" })
        .expect(201)
    ).body.data;

    await adminAgent
      .patch(`/api/v1/users/${coordinator._id}/permissions`)
      .send({ permissions: completePermissions({ complaints: { view_all: true, assign: true } }) })
      .expect(200);

    const { default: User } = await import("../user/user.model.js");
    const stored = await User.findById(coordinator._id).lean();
    expect(stored.role).toBe("employee");
    expect(stored.permissions.complaints).toEqual({ view_all: true, assign: true });
  });
});
