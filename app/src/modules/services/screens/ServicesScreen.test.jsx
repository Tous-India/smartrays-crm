import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ServicesScreen from "./ServicesScreen";
import { listServices } from "../api/serviceApi";
import { getUserDirectory } from "../../../api/userApi";
import { clearUserDirectoryCache } from "../../../hooks/useUserDirectory";

jest.mock("../api/serviceApi", () => ({ listServices: jest.fn() }));
jest.mock("../../../api/userApi", () => ({ getUserDirectory: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The list is the server's answer, ordered overdue first; the filter is a
 * second request; the three empty/error/loading states are drawn.
 */
const navigation = { navigate: jest.fn() };
const DAY = 24 * 60 * 60 * 1000;

function ok(data) {
  return Promise.resolve({ data: { data } });
}

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearUserDirectoryCache();
  getUserDirectory.mockReturnValue(ok([{ _id: "mgr-1", name: "Testing Manager", role: "manager" }]));
});

test("lists the to-do services overdue first, naming who assigned them and marking the overdue one", async () => {
  listServices.mockReturnValue(
    ok([
      { _id: "s-later", title: "Later", status: "todo", dueDate: new Date(Date.now() + 5 * DAY).toISOString(), createdById: "mgr-1", subtasks: [] },
      { _id: "s-none", title: "Undated", status: "todo", dueDate: null, createdById: "mgr-1", subtasks: [] },
      { _id: "s-late", title: "Late", status: "todo", dueDate: new Date(Date.now() - 2 * DAY).toISOString(), createdById: "mgr-1", subtasks: [{ isDone: true }, { isDone: false }] },
    ])
  );
  const screen = await render(<ServicesScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText("Late")).toBeTruthy());
  expect(listServices).toHaveBeenCalledWith("todo");

  const titles = ["Late", "Later", "Undated"].map((title) => screen.getByText(title));
  expect(titles.map((node) => node.props.children)).toEqual(["Late", "Later", "Undated"]);
  expect(screen.getByTestId("service-overdue-s-late")).toBeTruthy();
  expect(screen.queryByTestId("service-overdue-s-later")).toBeNull();
  expect(screen.getByText(/from Testing Manager · 1\/2 subtasks/)).toBeTruthy();

  await fireEvent.press(screen.getByTestId("service-row-s-late"));
  expect(navigation.navigate).toHaveBeenCalledWith("ServiceDetail", { serviceId: "s-late" });
});

test("the Completed segment asks the server for completed ones", async () => {
  listServices.mockImplementation((status) => ok(status === "completed" ? [{ _id: "c1", title: "Done thing", status: "completed", subtasks: [] }] : []));
  const screen = await render(<ServicesScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByTestId("services-list-empty")).toBeTruthy());
  expect(screen.getByText("Nothing to do — no services assigned to you.")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("services-filter-completed"));

  await waitFor(() => expect(screen.getByText("Done thing")).toBeTruthy());
  expect(listServices).toHaveBeenLastCalledWith("completed");
});

test("a failed load shows the server's own message and Try again reloads", async () => {
  listServices.mockRejectedValueOnce(serverError(403, "You do not have permission to view services")).mockReturnValue(ok([]));
  const screen = await render(<ServicesScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText("You do not have permission to view services")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("services-list-retry"));

  await waitFor(() => expect(screen.getByTestId("services-list-empty")).toBeTruthy());
  expect(listServices).toHaveBeenCalledTimes(2);
});
