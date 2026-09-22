import { fireEvent, render, waitFor } from "@testing-library/react-native";
import TeamScreen from "./TeamScreen";
import TeamMemberDayScreen from "./TeamMemberDayScreen";
import ServiceFormScreen from "./ServiceFormScreen";
import useSessionStore from "../../../store/sessionStore";
import apiClient from "../../../api/apiClient";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import { clearUserDirectoryCache } from "../../../hooks/useUserDirectory";
import { createService, getLiveLocations, getTeamAttendance, listAssignees, listDirectReports, listTeamLeaves, updateService } from "../api/teamApi";
import { listServices } from "../../services/api/serviceApi";
import { getLocationConfig } from "../../tracking/locationApi";
import { getUserDirectory } from "../../../api/userApi";

jest.mock("../api/teamApi", () => ({
  listDirectReports: jest.fn(),
  getTeamAttendance: jest.fn(),
  getLiveLocations: jest.fn(),
  listTeamLeaves: jest.fn(),
  listAssignees: jest.fn(),
  createService: jest.fn(),
  updateService: jest.fn(),
}));
jest.mock("../../services/api/serviceApi", () => ({ listServices: jest.fn() }));
jest.mock("../../tracking/locationApi", () => ({ getLocationConfig: jest.fn() }));
jest.mock("../../../api/userApi", () => ({ getUserDirectory: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The Team tab: segments follow the server's permissions, the roster is
 * the server's answers combined, a refusal is the server's words, and the
 * assign form sends the body POST /services validates with an assignee
 * from GET /services/assignees only.
 */
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const MANAGER = { _id: "mgr-1", name: "Testing Manager", role: "manager" };
const REPORT = { _id: "emp-1", name: "Testing User 2", role: "employee" };

function ok(data) {
  return Promise.resolve({ data: { data } });
}

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

function permissionsAdapter(permissions) {
  apiClient.defaults.adapter = async (config) => ({
    status: 200,
    statusText: "200",
    headers: {},
    config,
    data: { data: { role: "manager", permissions } },
  });
}

const FULL = {
  attendance: { view_team: true },
  location: { view_team: true },
  services: { view: true, create: true, edit: true },
  leave: { view_team: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  clearPermissionsCache();
  clearUserDirectoryCache();
  useSessionStore.getState().setSignedIn(MANAGER);
  permissionsAdapter(FULL);
  getUserDirectory.mockReturnValue(ok([MANAGER, REPORT]));
  listDirectReports.mockReturnValue(ok([REPORT]));
  getTeamAttendance.mockReturnValue(ok([]));
  listTeamLeaves.mockReturnValue(ok([]));
  getLiveLocations.mockReturnValue(ok({ entries: [], unlocatable: [], openShiftCount: 0 }));
  getLocationConfig.mockReturnValue(ok({ pingIntervalMinutes: 2, staleAfterMinutes: 10 }));
  listServices.mockReturnValue(ok([]));
  listAssignees.mockReturnValue(ok([REPORT]));
});

describe("TeamScreen", () => {
  test("Today: the roster from the team endpoints — silent when on shift with no position", async () => {
    getTeamAttendance.mockReturnValue(ok([{ _id: "r1", employeeId: "emp-1", date: new Date().toISOString(), checkIn: { time: new Date().toISOString() }, checkOut: {} }]));
    getLiveLocations.mockReturnValue(ok({ entries: [], unlocatable: [{ employeeId: "emp-1", name: "Testing User 2", silentForMinutes: 40 }], openShiftCount: 1 }));
    const screen = await render(<TeamScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("team-row-emp-1")).toBeTruthy());
    expect(screen.getByTestId("team-status-emp-1").props.children).toBe("Silent");
    expect(screen.getByText(/no position yet/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("team-row-emp-1"));
    expect(navigation.navigate).toHaveBeenCalledWith("TeamMemberDay", { employeeId: "emp-1", name: "Testing User 2" });
  });

  test("segments follow the permissions: no location grant → no Map, no create grant → no Assign", async () => {
    permissionsAdapter({ attendance: { view_team: true }, services: { view: true }, leave: { view_team: true } });
    const screen = await render(<TeamScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("team-segment-today")).toBeTruthy());
    expect(screen.queryByTestId("team-segment-map")).toBeNull();

    await fireEvent.press(screen.getByTestId("team-segment-services"));
    await waitFor(() => expect(screen.getByTestId("team-services-empty")).toBeTruthy());
    expect(screen.queryByTestId("team-assign-service")).toBeNull();
  });

  test("Map: markers for live positions, stale ones marked; tapping one offers their day", async () => {
    const fresh = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 60000).toISOString();
    listDirectReports.mockReturnValue(ok([REPORT, { _id: "emp-2", name: "Other One", role: "employee" }]));
    getTeamAttendance.mockReturnValue(
      ok(["emp-1", "emp-2"].map((id) => ({ _id: `r-${id}`, employeeId: id, date: fresh, checkIn: { time: fresh }, checkOut: {} })))
    );
    getLiveLocations.mockReturnValue(
      ok({
        entries: [
          { employeeId: "emp-1", coords: { lat: 28.6, lng: 77.2 }, capturedAt: fresh },
          { employeeId: "emp-2", coords: { lat: 28.7, lng: 77.3 }, capturedAt: old },
        ],
        unlocatable: [],
        openShiftCount: 2,
      })
    );
    const screen = await render(<TeamScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByTestId("team-segment-map")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("team-segment-map"));

    await waitFor(() => expect(screen.getByTestId("team-map-marker-emp-1")).toBeTruthy());
    expect(screen.getByTestId("team-map-marker-emp-2").props.accessibilityLabel).toBe("Other One, stale");
    expect(screen.getByTestId("team-map-silent").props.children.join("")).toMatch(/Silent: Other One/);

    const annotations = screen.getAllByTestId("mock-view-annotation");
    await fireEvent(annotations[1], "onPress");
    await waitFor(() => expect(screen.getByTestId("team-map-selected")).toBeTruthy());
    expect(screen.getByText(/STALE — last update/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("team-map-open-day"));
    expect(navigation.navigate).toHaveBeenCalledWith("TeamMemberDay", { employeeId: "emp-2", name: "Other One" });
  });

  test("Services: open items grouped by assignee, overdue flagged; Assign opens the form", async () => {
    listServices.mockReturnValue(
      ok([
        { _id: "s1", title: "Late one", status: "todo", assignedToId: "emp-1", createdById: "mgr-1", dueDate: new Date(Date.now() - 86400000).toISOString(), subtasks: [] },
        { _id: "s2", title: "Mine", status: "todo", assignedToId: "mgr-1", createdById: "mgr-1", dueDate: null, subtasks: [] },
      ])
    );
    const screen = await render(<TeamScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByTestId("team-segment-services")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("team-segment-services"));

    await waitFor(() => expect(screen.getByTestId("team-services-group-emp-1")).toBeTruthy());
    expect(screen.getByText("Testing User 2 · 1")).toBeTruthy();
    expect(screen.getByText("Testing Manager · 1")).toBeTruthy();
    expect(screen.getByTestId("service-overdue-s1")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("team-assign-service"));
    expect(navigation.navigate).toHaveBeenCalledWith("ServiceForm", {});

    await fireEvent.press(screen.getByTestId("service-row-s1"));
    expect(navigation.navigate).toHaveBeenCalledWith("TeamServiceDetail", { serviceId: "s1" });
  });

  test("Leave: the team's requests, named, view only", async () => {
    listTeamLeaves.mockReturnValue(ok([{ _id: "l1", employeeId: "emp-1", status: "pending", type: "paid", reason: "Trip", startDate: "2026-09-28T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z" }]));
    const screen = await render(<TeamScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByTestId("team-segment-leave")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("team-segment-leave"));

    await waitFor(() => expect(screen.getByTestId("team-leave-row-l1")).toBeTruthy());
    expect(screen.getByText("Testing User 2")).toBeTruthy();
    expect(screen.getByText("Approvals are made on the web.")).toBeTruthy();
  });

  test("a 403 from a team endpoint is the server's message, not a crash", async () => {
    getTeamAttendance.mockRejectedValue(serverError(403, "You do not have permission to view team attendance"));
    const screen = await render(<TeamScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText("You do not have permission to view team attendance")).toBeTruthy());
  });
});

describe("TeamMemberDayScreen", () => {
  test("shows the photo only when the server released a photoUrl, and the last position time", async () => {
    const at = new Date().toISOString();
    getTeamAttendance.mockReturnValue(ok([{ _id: "r1", employeeId: "emp-1", date: at, checkIn: { time: at, photoUrl: "https://res.example/in.jpg" }, checkOut: { time: null, photoUrl: null }, status: "present" }]));
    getLiveLocations.mockReturnValue(ok({ entries: [{ employeeId: "emp-1", coords: { lat: 1, lng: 2 }, capturedAt: at }], unlocatable: [], openShiftCount: 1 }));
    const screen = await render(<TeamMemberDayScreen navigation={navigation} route={{ params: { employeeId: "emp-1", name: "Testing User 2" } }} />);

    await waitFor(() => expect(screen.getByTestId("team-member-status")).toBeTruthy());
    expect(screen.getByTestId("team-member-status").props.children).toBe("Checked in");
    expect(screen.getByTestId("team-member-check-in-photo").props.source).toEqual({ uri: "https://res.example/in.jpg" });
    expect(screen.queryByTestId("team-member-check-out-photo")).toBeNull();
    expect(screen.getByTestId("team-member-last-seen").props.children).toMatch(/0m ago/);
  });

  test("no photoUrl (no attendance.view_photos) → no image at all", async () => {
    const at = new Date().toISOString();
    getTeamAttendance.mockReturnValue(ok([{ _id: "r1", employeeId: "emp-1", date: at, checkIn: { time: at, photoUrl: null }, checkOut: {} }]));
    const screen = await render(<TeamMemberDayScreen navigation={navigation} route={{ params: { employeeId: "emp-1", name: "Testing User 2" } }} />);

    await waitFor(() => expect(screen.getByTestId("team-member-status")).toBeTruthy());
    expect(screen.queryByTestId("team-member-check-in-photo")).toBeNull();
  });
});

describe("ServiceFormScreen", () => {
  test("the assignee list is GET /services/assignees; create sends the validated body and goes back", async () => {
    createService.mockReturnValue(ok({ _id: "new" }));
    const screen = await render(<ServiceFormScreen navigation={navigation} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId("service-form-assignee-emp-1")).toBeTruthy());
    expect(listAssignees).toHaveBeenCalledTimes(1);
    expect(getUserDirectory).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("service-form-submit"));
    expect(await screen.findByText("A title is required")).toBeTruthy();
    expect(screen.getByText("Choose who does this")).toBeTruthy();
    expect(createService).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId("service-form-title"), "  Fix the router ");
    await fireEvent.changeText(screen.getByTestId("service-form-description"), "Site B");
    await fireEvent.press(screen.getByTestId("service-form-assignee-emp-1"));
    await fireEvent.press(screen.getByTestId("service-form-add-subtask"));
    await fireEvent.changeText(screen.getByTestId("service-form-subtask-0"), "Mount");
    await fireEvent.press(screen.getByTestId("service-form-add-subtask"));
    await fireEvent.press(screen.getByTestId("service-form-subtask-remove-1"));
    await fireEvent.press(screen.getByTestId("service-form-submit"));

    await waitFor(() =>
      expect(createService).toHaveBeenCalledWith({
        title: "Fix the router",
        description: "Site B",
        assignedToId: "emp-1",
        dueDate: null,
        subtasks: [{ title: "Mount", isDone: false }],
      })
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test("editing pre-fills and PATCHes the same record; a refusal is the server's words", async () => {
    updateService.mockRejectedValue(serverError(400, "assignedToId is not someone you can assign to"));
    const service = { _id: "s1", title: "Old title", description: "d", assignedToId: "emp-1", dueDate: "2026-09-30T00:00:00.000Z", subtasks: [{ title: "One", isDone: true }] };
    const screen = await render(<ServiceFormScreen navigation={navigation} route={{ params: { service } }} />);
    await waitFor(() => expect(screen.getByTestId("service-form-assignee-emp-1")).toBeTruthy());

    expect(screen.getByTestId("service-form-title").props.value).toBe("Old title");
    expect(screen.getByTestId("service-form-subtask-0").props.value).toBe("One");
    await fireEvent.changeText(screen.getByTestId("service-form-title"), "New title");
    await fireEvent.press(screen.getByTestId("service-form-submit"));

    await waitFor(() => expect(updateService).toHaveBeenCalledWith("s1", expect.objectContaining({ title: "New title", assignedToId: "emp-1", subtasks: [{ title: "One", isDone: true }] })));
    expect(await screen.findByText("assignedToId is not someone you can assign to")).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
