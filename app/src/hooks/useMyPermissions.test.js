import { can, canAny, permissionsFor } from "./useMyPermissions";

/**
 * Admins always pass (2026-10-23), as on the server (permission.helper.js):
 * an admin's stored permissions are empty, so without this the app would
 * hide every admin control — the complaints list, assigning, the team map.
 */
test("an admin may do everything, whatever is stored", () => {
  const admin = permissionsFor({ role: "admin", permissions: {} });
  expect(can(admin, "complaints", "assign")).toBe(true);
  expect(canAny(admin, "location", ["view_team", "view_all"])).toBe(true);
});

test("anyone else gets exactly what is stored", () => {
  const coordinator = permissionsFor({ role: "employee", permissions: { complaints: { view_all: true, assign: true } } });
  expect(can(coordinator, "complaints", "assign")).toBe(true);
  expect(can(coordinator, "services", "create")).toBe(false);
  expect(can(permissionsFor({ role: "manager", permissions: {} }), "complaints", "assign")).toBe(false);
  expect(permissionsFor(null)).toBeNull();
});
