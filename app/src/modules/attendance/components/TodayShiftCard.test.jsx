import { Linking } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import TodayShiftCard from "./TodayShiftCard";

const OPEN = { checkIn: { time: new Date(Date.now() - 125 * 60000).toISOString() }, checkOut: {} };
const CLOSED = {
  checkIn: { time: "2026-09-21T03:30:00Z" },
  checkOut: { time: "2026-09-21T12:00:00Z" },
  workingHours: 8.5,
  status: "present",
};

function renderCard(props) {
  return render(
    <TodayShiftCard
      openRecord={null}
      todayRecord={null}
      isLoading={false}
      error={null}
      isOnline
      onCheckIn={jest.fn()}
      onCheckOut={jest.fn()}
      {...props}
    />
  );
}

test("not checked in: the check-in action", async () => {
  const onCheckIn = jest.fn();
  const screen = await renderCard({ onCheckIn });

  expect(screen.getByTestId("shift-card-not-checked-in")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("shift-check-in"));
  expect(onCheckIn).toHaveBeenCalled();
});

test("checked in: elapsed time since the check-in, and the check-out action", async () => {
  const onCheckOut = jest.fn();
  const screen = await renderCard({ openRecord: OPEN, onCheckOut });

  expect(screen.getByTestId("shift-card-checked-in")).toBeTruthy();
  // One line, the owner's wording (2026-10-23): "Checked in at 9:42 AM · working 3h 15m".
  expect(screen.getByTestId("shift-checked-in-line").props.children.join("")).toMatch(/^Checked in at \d{1,2}:\d{2} (AM|PM) · working 2h 05m$/);
  await fireEvent.press(screen.getByTestId("shift-check-out"));
  expect(onCheckOut).toHaveBeenCalled();
});

test("checked out: the server's hours and status, and a second check-in — never a check-out", async () => {
  const onCheckIn = jest.fn();
  const screen = await renderCard({ todayRecord: CLOSED, onCheckIn });

  expect(screen.getByTestId("shift-card-checked-out")).toBeTruthy();
  expect(screen.getByText("Working hours: 8.50")).toBeTruthy();
  expect(screen.getByText("Status: present")).toBeTruthy();
  expect(screen.queryByTestId("shift-check-out")).toBeNull();
  await fireEvent.press(screen.getByTestId("shift-check-in"));
  expect(onCheckIn).toHaveBeenCalled();
});

test("offline: the action stays visible, disabled, with the reason", async () => {
  const onCheckIn = jest.fn();
  const screen = await renderCard({ isOnline: false, onCheckIn });

  const button = screen.getByTestId("shift-check-in");
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText(/No connection/)).toBeTruthy();
  await fireEvent.press(button);
  expect(onCheckIn).not.toHaveBeenCalled();
});

test("a load error says so instead of pretending nobody is checked in", async () => {
  const screen = await renderCard({ error: new Error("boom") });

  expect(screen.getByTestId("shift-card-error")).toBeTruthy();
  expect(screen.queryByTestId("shift-check-in")).toBeNull();
});

test("location switched off on the phone → 'Tracking paused — location is off', and Turn on opens the location settings (2026-10-23)", async () => {
  const sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue();
  const onFixTracking = jest.fn();
  const screen = await renderCard({ openRecord: OPEN, onFixTracking, trackingState: { status: "paused", reason: "location_off", queuedCount: 0 } });

  expect(screen.getByText(/Tracking paused — location is off on this phone/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("shift-tracking-fix"));
  expect(sendIntent).toHaveBeenCalledWith("android.settings.LOCATION_SOURCE_SETTINGS");
  expect(onFixTracking).not.toHaveBeenCalled();
});
