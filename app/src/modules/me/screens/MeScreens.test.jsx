import { fireEvent, render, waitFor } from "@testing-library/react-native";
import MeScreen from "./MeScreen";
import AttendanceHistoryScreen from "./AttendanceHistoryScreen";
import PayslipsScreen from "./PayslipsScreen";
import useSessionStore from "../../../store/sessionStore";
import { getMyTeam, listMyPayroll, openPayslip } from "../api/meApi";
import { getMyAttendance } from "../../attendance/api/attendanceApi";
import apiClient from "../../../api/apiClient";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import { signOut } from "../../auth/session.service";
import { monthKey } from "../../attendance/attendance.utils";
import { formatMonth, formatShortDate } from "../../../utils/date.utils";

jest.mock("../api/meApi", () => {
  const actual = jest.requireActual("../api/meApi");
  return { ...actual, getMyTeam: jest.fn(), listMyPayroll: jest.fn(), openPayslip: jest.fn() };
});
jest.mock("../../attendance/api/attendanceApi", () => ({ getMyAttendance: jest.fn() }));
jest.mock("../../auth/session.service", () => ({ signOut: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The Me tab reads and shows; the one thing it does is open a payslip. What
 * is listed is the server's, filtered only by "has a payslip".
 */
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

function ok(data) {
  return Promise.resolve({ data: { data } });
}

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

const defaultAdapter = apiClient.defaults.adapter;

beforeEach(() => {
  jest.clearAllMocks();
  clearPermissionsCache();
  apiClient.defaults.adapter = defaultAdapter;
  useSessionStore.getState().setSignedIn({ _id: "u1", name: "Testing User 2", email: "t2@example.com", role: "employee", designation: "Field engineer" });
});

describe("MeScreen", () => {
  test("profile from the session, department and manager from the team; the doors; sign out", async () => {
    getMyTeam.mockReturnValue(ok({ name: "Field Ops", type: "field", head: { _id: "m1", name: "Testing Manager" }, members: [] }));
    const screen = await render(<MeScreen navigation={navigation} />);

    expect(screen.getByText("Testing User 2")).toBeTruthy();
    expect(screen.getByText("Field engineer")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("me-department").props.children).toBe("Field Ops"));
    expect(screen.getByTestId("me-manager").props.children).toBe("Testing Manager");

    await fireEvent.press(screen.getByTestId("me-attendance-history"));
    expect(navigation.navigate).toHaveBeenCalledWith("AttendanceHistory");
    await fireEvent.press(screen.getByTestId("me-payslips"));
    expect(navigation.navigate).toHaveBeenCalledWith("Payslips");
    await fireEvent.press(screen.getByTestId("me-sign-out"));
    expect(signOut).toHaveBeenCalled();
  });

  test("no payroll grant (a sales associate) → no Payslips door; the rest is the same (2026-10-23)", async () => {
    apiClient.defaults.adapter = async (config) => ({
      status: 200,
      statusText: "200",
      headers: {},
      config,
      data: { data: { role: "sales_associate", permissions: { leave: { view: true }, services: { view: true } } } },
    });
    getMyTeam.mockReturnValue(ok(null));
    const screen = await render(<MeScreen navigation={navigation} />);

    await waitFor(() => expect(screen.queryByTestId("me-payslips")).toBeNull());
    expect(screen.getByTestId("me-attendance-history")).toBeTruthy();
  });

  test("no team (a manager, or nobody assigned) → dashes", async () => {
    getMyTeam.mockReturnValue(ok(null));
    const screen = await render(<MeScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("me-department").props.children).toBe("—"));
    expect(screen.getByTestId("me-manager").props.children).toBe("—");
  });

  test("a failed team call → its message in place of the department", async () => {
    getMyTeam.mockRejectedValue(serverError(500, "Teams unavailable"));
    const screen = await render(<MeScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("me-department").props.children).toBe("Teams unavailable"));
  });
});

describe("AttendanceHistoryScreen", () => {
  test("this month's rows, newest first, with times, hours and status; the previous month is another request", async () => {
    const now = new Date();
    const thisMonth = monthKey(now);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const day = (n) => new Date(now.getFullYear(), now.getMonth(), n);
    getMyAttendance.mockImplementation((month) =>
      ok(
        month === thisMonth
          ? [
              { _id: "a1", date: day(2).toISOString(), checkIn: { time: day(2).toISOString() }, checkOut: { time: day(2).toISOString() }, workingHours: 8.5, status: "present" },
              { _id: "a2", date: day(5).toISOString(), checkIn: { time: day(5).toISOString() }, checkOut: {}, status: "present" },
            ]
          : []
      )
    );
    const screen = await render(<AttendanceHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("history-row-a1")).toBeTruthy());
    expect(getMyAttendance).toHaveBeenCalledWith(thisMonth);
    const rows = screen.getAllByTestId(/^history-row-/).map((row) => row.props.testID);
    expect(rows).toEqual(["history-row-a2", "history-row-a1"]);
    expect(screen.getByText(/8\.50 h/)).toBeTruthy();
    expect(screen.getByText(/still open/)).toBeTruthy();
    expect(screen.getByTestId("history-next-month").props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId("history-prev-month"));

    await waitFor(() => expect(getMyAttendance).toHaveBeenCalledWith(monthKey(previous)));
    await waitFor(() => expect(screen.getByTestId("history-list-empty")).toBeTruthy());
    expect(screen.getByText(`No attendance recorded in ${formatMonth(previous)}.`)).toBeTruthy();
  });

  test("a check-out on a later day than its check-in shows that day beside the time", async () => {
    const now = new Date();
    const inAt = new Date(now.getFullYear(), now.getMonth(), 3, 14, 44);
    const outAt = new Date(now.getFullYear(), now.getMonth(), 4, 12, 35);
    getMyAttendance.mockReturnValue(
      ok([{ _id: "a9", date: inAt.toISOString(), checkIn: { time: inAt.toISOString() }, checkOut: { time: outAt.toISOString() }, workingHours: 0.76, status: "present" }])
    );
    const screen = await render(<AttendanceHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("history-row-a9")).toBeTruthy());
    expect(screen.getByText(new RegExp(`Out 12:35 PM · ${formatShortDate(outAt)}`))).toBeTruthy();
  });

  test("a month calendar coloured by the server's statuses, the month's summary, and a tapped day shows only that day (2026-10-23)", async () => {
    const now = new Date();
    // India-midnight dates, the way the server stores them.
    const india = (n) => new Date(Date.UTC(now.getFullYear(), now.getMonth(), n) - 330 * 60000).toISOString();
    getMyAttendance.mockReturnValue(
      ok([
        { _id: "p1", date: india(1), checkIn: { time: india(1) }, checkOut: { time: india(1) }, workingHours: 8, status: "present" },
        { _id: "h1", date: india(2), checkIn: { time: india(2) }, checkOut: { time: india(2) }, workingHours: 4, status: "half_day" },
        { _id: "l1", date: india(3), status: "on_leave" },
      ])
    );
    const screen = await render(<AttendanceHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("history-day-1")).toBeTruthy());
    expect(screen.getByTestId("history-day-1").props.accessibilityLabel).toMatch(/Present$/);
    expect(screen.getByTestId("history-day-2").props.accessibilityLabel).toMatch(/Half day$/);
    expect(screen.getByTestId("history-day-3").props.accessibilityLabel).toMatch(/On leave$/);
    expect(screen.getByTestId("history-summary-present").props.children).toEqual([1, " present"]);
    expect(screen.getByTestId("history-summary-half_day").props.children).toEqual([1, " half day"]);
    expect(screen.getByTestId("history-summary-hours").props.children).toEqual(["12", " h worked"]);

    await fireEvent.press(screen.getByTestId("history-day-2"));
    expect(screen.getAllByTestId(/^history-row-/).map((row) => row.props.testID)).toEqual(["history-row-h1"]);

    await fireEvent.press(screen.getByTestId("history-day-2"));
    expect(screen.getAllByTestId(/^history-row-/)).toHaveLength(3);
    // Statuses read as words, not keys: "On leave", not "on_leave".
    expect(screen.getAllByText("On leave", { exact: true })).toHaveLength(2); // the legend and the row
    expect(screen.queryByText("on_leave")).toBeNull();
  });

  test("a failed month shows the server's message", async () => {
    getMyAttendance.mockRejectedValue(serverError(500, "Attendance unavailable"));
    const screen = await render(<AttendanceHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText("Attendance unavailable")).toBeTruthy());
  });
});

describe("PayslipsScreen", () => {
  const RECORDS = [
    { _id: "p-draft", year: 2026, month: 9, status: "draft", netAmount: 30000 },
    { _id: "p-review", year: 2026, month: 8, status: "review", netAmount: 30000 },
    { _id: "p-approved", year: 2026, month: 7, status: "approved", netAmount: 28500 },
    { _id: "p-paid", year: 2026, month: 6, status: "paid", netAmount: 28000 },
  ];

  test("lists only approved and paid periods — never a draft or a period under review", async () => {
    listMyPayroll.mockReturnValue(ok(RECORDS));
    const screen = await render(<PayslipsScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("payslip-row-p-approved")).toBeTruthy());
    expect(screen.getByTestId("payslip-row-p-paid")).toBeTruthy();
    expect(screen.queryByTestId("payslip-row-p-draft")).toBeNull();
    expect(screen.queryByTestId("payslip-row-p-review")).toBeNull();
    expect(screen.getByText("July 2026")).toBeTruthy();
    expect(screen.getByText("Net ₹28,500")).toBeTruthy();
  });

  test("a tap opens that period's PDF; a failure shows the server's message", async () => {
    listMyPayroll.mockReturnValue(ok(RECORDS));
    openPayslip.mockResolvedValueOnce(undefined).mockRejectedValueOnce(serverError(409, "This period is not approved yet — a payslip is only issued once the figures are final"));
    const screen = await render(<PayslipsScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByTestId("payslip-row-p-approved")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("payslip-row-p-approved"));
    await waitFor(() => expect(openPayslip).toHaveBeenCalledWith("p-approved", "payslip-2026-07.pdf"));

    await fireEvent.press(screen.getByTestId("payslip-row-p-paid"));
    expect(await screen.findByText("This period is not approved yet — a payslip is only issued once the figures are final")).toBeTruthy();
  });

  test("nothing approved yet → the empty line", async () => {
    listMyPayroll.mockReturnValue(ok([RECORDS[0]]));
    const screen = await render(<PayslipsScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText("No approved payslips yet.")).toBeTruthy());
  });
});
