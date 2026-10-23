import { fireEvent, render, waitFor } from "@testing-library/react-native";
import TrackingDisclosureScreen from "./TrackingDisclosureScreen";
import { recordDisclosureAnswer, requestTrackingPermissions } from "../tracking.service";
import { getLocationConfig } from "../locationApi";

jest.mock("../tracking.service", () => ({ recordDisclosureAnswer: jest.fn(), requestTrackingPermissions: jest.fn() }));
jest.mock("../locationApi", () => ({ getLocationConfig: jest.fn() }));

/**
 * Found on the emulator (2026-10-23): "Turn on" tracking during an open shift
 * walked the permissions, then opened the CHECK-IN camera — as if the
 * employee were not checked in. From an open shift it must go back Home.
 */
const granted = { fine: "granted", background: "granted" };

beforeEach(() => {
  jest.clearAllMocks();
  getLocationConfig.mockResolvedValue({ data: { data: { pingIntervalMinutes: 2 } } });
  recordDisclosureAnswer.mockResolvedValue();
  requestTrackingPermissions.mockResolvedValue(granted);
});

test("before a check-in, Continue goes on to the check-in camera", async () => {
  const navigation = { replace: jest.fn(), goBack: jest.fn() };
  const screen = await render(<TrackingDisclosureScreen navigation={navigation} route={{ params: {} }} />);
  await fireEvent.press(screen.getByTestId("tracking-disclosure-continue"));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("Capture", { mode: "check-in" }));
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test("turning tracking on during an open shift goes back Home, never to check-in", async () => {
  const navigation = { replace: jest.fn(), goBack: jest.fn() };
  const screen = await render(<TrackingDisclosureScreen navigation={navigation} route={{ params: { afterwards: "back" } }} />);
  await fireEvent.press(screen.getByTestId("tracking-disclosure-continue"));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(navigation.replace).not.toHaveBeenCalled();
});
