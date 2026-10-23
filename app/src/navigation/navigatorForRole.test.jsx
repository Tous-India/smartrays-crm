import { navigatorForRole } from "./RootNavigator";
import ManagerNavigator from "./ManagerNavigator";
import EmployeeNavigator from "./EmployeeNavigator";
import UnsupportedRoleScreen from "../modules/auth/screens/UnsupportedRoleScreen";

jest.mock("react-native-bootsplash", () => ({ hide: jest.fn(() => Promise.resolve()) }));

/**
 * Admin signs in to the app (2026-10-23): everyone live on the Team map, the
 * full complaints list and assigning. Same tabs as a manager — the server
 * already lets an admin see everyone. Sales associates and customers still
 * use the web.
 */
test("employee, manager and admin each get a navigator; others get the 'use the web' screen", () => {
  expect(navigatorForRole("employee").type).toBe(EmployeeNavigator);
  expect(navigatorForRole("manager").type).toBe(ManagerNavigator);
  expect(navigatorForRole("admin").type).toBe(ManagerNavigator);
  expect(navigatorForRole("sales_associate").type).toBe(UnsupportedRoleScreen);
  expect(navigatorForRole("customer").type).toBe(UnsupportedRoleScreen);
});
