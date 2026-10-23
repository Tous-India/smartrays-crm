import NetInfo from "@react-native-community/netinfo";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import LeaveScreen from "./LeaveScreen";
import ApplyLeaveScreen from "./ApplyLeaveScreen";
import { getLeaveBalance, listMyLeaves, requestLeave } from "../api/leaveApi";

jest.mock("../api/leaveApi", () => ({ getLeaveBalance: jest.fn(), listMyLeaves: jest.fn(), requestLeave: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The balance and the statuses are the server's figures shown as given; a
 * request is the exact body the endpoint validates; refusals are verbatim.
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("LeaveScreen", () => {
  test("shows the server's balance and each request with its status", async () => {
    getLeaveBalance.mockReturnValue(ok({ paidLeaveUsed: 1, paidLeaveLimit: 2, paidLeaveRemaining: 1 }));
    listMyLeaves.mockReturnValue(
      ok([
        { _id: "l1", startDate: "2026-09-25T00:00:00.000Z", endDate: "2026-09-25T00:00:00.000Z", type: "paid", status: "pending", reason: "Family", isHalfDay: true },
        { _id: "l2", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-02T00:00:00.000Z", type: "unpaid", status: "rejected", reason: "Trip", declineReason: "Peak week" },
      ])
    );
    const screen = await render(<LeaveScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("leave-balance-remaining")).toBeTruthy());
    expect(screen.getByTestId("leave-balance-remaining").props.children.join("")).toBe("1 of 2 left");
    expect(screen.getByTestId("leave-status-l1").props.children).toBe("pending");
    expect(screen.getByTestId("leave-status-l2").props.children).toBe("rejected");
    expect(screen.getByText(/\(half day\)/)).toBeTruthy();
    expect(screen.getByText("Declined: Peak week")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("leave-apply"));
    expect(navigation.navigate).toHaveBeenCalledWith("ApplyLeave");
  });

  test("no requests yet → the empty line; a failed balance → its message, the list still drawn", async () => {
    getLeaveBalance.mockRejectedValue(serverError(500, "Balance service down"));
    listMyLeaves.mockReturnValue(ok([]));
    const screen = await render(<LeaveScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("leave-list-empty")).toBeTruthy());
    expect(screen.getByText("No leave requests yet.")).toBeTruthy();
    expect(screen.getByTestId("leave-balance-error").props.children).toBe("Balance service down");
  });

  test("offline: Apply stays, disabled, with the reason", async () => {
    // Two listeners: the screen's own, and the shared frame's offline banner.
    const offline = (listener) => {
      listener({ isConnected: false, isInternetReachable: false });
      return () => {};
    };
    NetInfo.addEventListener.mockImplementationOnce(offline).mockImplementationOnce(offline);
    getLeaveBalance.mockReturnValue(ok({ paidLeaveUsed: 0, paidLeaveLimit: 2, paidLeaveRemaining: 2 }));
    listMyLeaves.mockReturnValue(ok([]));
    const screen = await render(<LeaveScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId("leave-list-empty")).toBeTruthy());
    expect(screen.getByTestId("leave-apply").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("No connection — applying for leave needs the server.")).toBeTruthy();
  });
});

describe("ApplyLeaveScreen", () => {
  async function pickDate(screen, fieldTestId, date) {
    await fireEvent.press(screen.getByTestId(fieldTestId));
    const picker = await screen.findByTestId("mock-date-picker");
    await fireEvent(picker, "onChange", { type: "set" }, date);
  }

  test("an empty submit shows the field messages and sends nothing", async () => {
    const screen = await render(<ApplyLeaveScreen navigation={navigation} />);

    await fireEvent.press(screen.getByTestId("apply-leave-submit"));

    expect(await screen.findByText("Pick the first day")).toBeTruthy();
    expect(screen.getByText("Pick the last day")).toBeTruthy();
    expect(screen.getByText("A reason is required")).toBeTruthy();
    expect(requestLeave).not.toHaveBeenCalled();
  });

  test("sends the range as YYYY-MM-DD with the half-day flag, type and reason, then goes back", async () => {
    requestLeave.mockReturnValue(ok({ _id: "new" }));
    const screen = await render(<ApplyLeaveScreen navigation={navigation} />);

    await pickDate(screen, "apply-leave-start", new Date(2026, 8, 28));
    await pickDate(screen, "apply-leave-end", new Date(2026, 8, 29));
    await fireEvent.press(screen.getByTestId("apply-leave-type-unpaid"));
    await fireEvent.changeText(screen.getByTestId("apply-leave-reason"), "  Wedding  ");
    await fireEvent.press(screen.getByTestId("apply-leave-submit"));

    await waitFor(() =>
      expect(requestLeave).toHaveBeenCalledWith({
        startDate: "2026-09-28",
        endDate: "2026-09-29",
        type: "unpaid",
        isHalfDay: false,
        reason: "Wedding",
      })
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test("half day pins the end date to the start date", async () => {
    requestLeave.mockReturnValue(ok({ _id: "new" }));
    const screen = await render(<ApplyLeaveScreen navigation={navigation} />);

    await pickDate(screen, "apply-leave-start", new Date(2026, 8, 28));
    await pickDate(screen, "apply-leave-end", new Date(2026, 8, 30));
    await fireEvent(screen.getByTestId("apply-leave-half-day"), "onValueChange", true);
    await fireEvent.changeText(screen.getByTestId("apply-leave-reason"), "Doctor");
    await fireEvent.press(screen.getByTestId("apply-leave-submit"));

    await waitFor(() => expect(requestLeave).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-09-28", endDate: "2026-09-28", isHalfDay: true })));
  });

  test("the server's refusal is shown word for word and the screen stays", async () => {
    requestLeave.mockRejectedValue(serverError(400, "You have already used your paid leave for this month"));
    const screen = await render(<ApplyLeaveScreen navigation={navigation} />);

    await pickDate(screen, "apply-leave-start", new Date(2026, 8, 28));
    await fireEvent.changeText(screen.getByTestId("apply-leave-reason"), "Rest");
    await fireEvent.press(screen.getByTestId("apply-leave-submit"));

    expect(await screen.findByText("You have already used your paid leave for this month")).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
