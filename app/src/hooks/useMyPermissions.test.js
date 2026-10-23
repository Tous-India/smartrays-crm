import { renderHook, waitFor } from "@testing-library/react-native";
import useMyPermissions, { can, canAny, permissionsFor } from "./useMyPermissions";
import apiClient from "../api/apiClient";
import useSessionStore from "../store/sessionStore";

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

/**
 * Found on the emulator (2026-10-23): after an admin signed out and a
 * technician signed in on the same phone, the app still used the admin's
 * permissions (the assigners' complaints view, the share card) — the answer
 * was cached for the life of the app. Signing out must forget it.
 */
test("signing out forgets the previous person's permissions", async () => {
  const answer = (data) => async (config) => ({ status: 200, statusText: "200", headers: {}, config, data: { data } });

  useSessionStore.getState().setSignedIn({ _id: "admin-1", name: "Arjun", role: "admin" });
  apiClient.defaults.adapter = answer({ role: "admin", permissions: {} });
  const first = await renderHook(() => useMyPermissions());
  await waitFor(() => expect(can(first.result.current.permissions, "complaints", "assign")).toBe(true));
  first.unmount();

  useSessionStore.getState().setSignedOut();
  apiClient.defaults.adapter = answer({ role: "employee", permissions: {} });
  const second = await renderHook(() => useMyPermissions());
  await waitFor(() => expect(second.result.current.role).toBe("employee"));
  expect(can(second.result.current.permissions, "complaints", "assign")).toBe(false);
});
