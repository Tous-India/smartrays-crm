import NetInfo from "@react-native-community/netinfo";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ServiceDetailScreen from "./ServiceDetailScreen";
import { getService, setServiceStatus, setSubtaskDone } from "../api/serviceApi";
import { getUserDirectory } from "../../../api/userApi";
import { clearUserDirectoryCache } from "../../../hooks/useUserDirectory";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import apiClient from "../../../api/apiClient";

jest.mock("../api/serviceApi", () => ({ getService: jest.fn(), setServiceStatus: jest.fn(), setSubtaskDone: jest.fn() }));
jest.mock("../../../api/userApi", () => ({ getUserDirectory: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The detail sends the two existing PATCHes and re-reads the record; a
 * refusal is the server's words; offline the controls stay, disabled.
 */
const navigation = { goBack: jest.fn() };
const route = { params: { serviceId: "s1" } };

const SERVICE = {
  _id: "s1",
  title: "Install router",
  description: "Site B, second floor.",
  status: "todo",
  dueDate: "2026-09-10T00:00:00.000Z",
  createdById: "mgr-1",
  subtasks: [
    { _id: "t1", title: "Mount", isDone: false },
    { _id: "t2", title: "Cable", isDone: true },
  ],
};

function ok(data) {
  return Promise.resolve({ data: { data } });
}

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

function permissionsAdapter(permissions) {
  apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "200", headers: {}, config, data: { data: { role: "x", permissions } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearUserDirectoryCache();
  clearPermissionsCache();
  permissionsAdapter({ services: { view: true } });
  getUserDirectory.mockReturnValue(ok([{ _id: "mgr-1", name: "Testing Manager", role: "manager" }]));
});

test("shows the record — title, description, due date, assigned by, subtasks, overdue", async () => {
  getService.mockReturnValue(ok(SERVICE));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("Install router")).toBeTruthy());
  expect(screen.getByTestId("service-detail-description").props.children).toBe("Site B, second floor.");
  expect(screen.getByText("Testing Manager")).toBeTruthy();
  expect(screen.getByTestId("service-detail-overdue")).toBeTruthy();
  expect(screen.getByTestId("subtask-t1").props.accessibilityState.checked).toBe(false);
  expect(screen.getByTestId("subtask-t2").props.accessibilityState.checked).toBe(true);
});

test("ticking a subtask PATCHes isDone and re-reads the record", async () => {
  getService
    .mockReturnValueOnce(ok(SERVICE))
    .mockReturnValueOnce(ok({ ...SERVICE, subtasks: [{ _id: "t1", title: "Mount", isDone: true }, SERVICE.subtasks[1]] }));
  setSubtaskDone.mockReturnValue(ok({}));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("subtask-t1")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("subtask-t1"));

  await waitFor(() => expect(setSubtaskDone).toHaveBeenCalledWith("s1", "t1", true));
  await waitFor(() => expect(screen.getByTestId("subtask-t1").props.accessibilityState.checked).toBe(true));
  expect(getService).toHaveBeenCalledTimes(2);
});

test("Mark complete PATCHes the status; the completed record hides the button", async () => {
  getService.mockReturnValueOnce(ok(SERVICE)).mockReturnValueOnce(ok({ ...SERVICE, status: "completed", completedAt: "2026-09-22T05:00:00.000Z", completedById: "mgr-1" }));
  setServiceStatus.mockReturnValue(ok({}));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("service-mark-complete")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("service-mark-complete"));

  await waitFor(() => expect(setServiceStatus).toHaveBeenCalledWith("s1", "completed"));
  await waitFor(() => expect(screen.queryByTestId("service-mark-complete")).toBeNull());
  expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
});

test("the server's refusal is shown word for word", async () => {
  getService.mockReturnValue(ok(SERVICE));
  setServiceStatus.mockRejectedValue(serverError(403, "Only the assignee or someone with edit rights can change the status"));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("service-mark-complete")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("service-mark-complete"));

  await waitFor(() => expect(screen.getByText("Only the assignee or someone with edit rights can change the status")).toBeTruthy());
});

test("offline: ticking and completing stay visible but disabled, with the reason", async () => {
  NetInfo.addEventListener.mockImplementationOnce((listener) => {
    listener({ isConnected: false, isInternetReachable: false });
    return () => {};
  });
  getService.mockReturnValue(ok(SERVICE));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("service-mark-complete")).toBeTruthy());

  expect(screen.getByTestId("service-mark-complete").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId("subtask-t1").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("No connection — changing a service needs the server.")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("subtask-t1"));
  expect(setSubtaskDone).not.toHaveBeenCalled();
});

test("a failed load shows the server's message", async () => {
  getService.mockRejectedValue(serverError(404, "Service not found"));
  const screen = await render(<ServiceDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("Service not found")).toBeTruthy());
});

test("Edit shows only when the server grants services.edit, and opens the form with the record", async () => {
  getService.mockReturnValue(ok(SERVICE));
  const employee = await render(<ServiceDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(employee.getByText("Install router")).toBeTruthy());
  expect(employee.queryByTestId("service-edit")).toBeNull();
  employee.unmount();

  clearPermissionsCache();
  permissionsAdapter({ services: { view: true, edit: true } });
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const manager = await render(<ServiceDetailScreen navigation={nav} route={route} />);
  await waitFor(() => expect(manager.getByTestId("service-edit")).toBeTruthy());

  await fireEvent.press(manager.getByTestId("service-edit"));
  expect(nav.navigate).toHaveBeenCalledWith("ServiceForm", { service: SERVICE });
});
