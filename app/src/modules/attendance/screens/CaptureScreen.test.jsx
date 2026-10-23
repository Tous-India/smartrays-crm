import { Linking, PermissionsAndroid } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import CaptureScreen from "./CaptureScreen";
import { checkIn, checkOut } from "../api/attendanceApi";
import { openAppSettings } from "../../../utils/permissions.utils";

jest.mock("../api/attendanceApi", () => ({ checkIn: jest.fn(), checkOut: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("../../../utils/permissions.utils", () => {
  const actual = jest.requireActual("../../../utils/permissions.utils");
  return { ...actual, openAppSettings: jest.fn() };
});

/**
 * The both-or-nothing rule and the permission/fix outcomes, driven through
 * the mocked camera, resizer and geolocation (jest.setup.js).
 */

const navigation = { goBack: jest.fn() };
const checkInRoute = { params: { mode: "check-in" } };
const checkOutRoute = { params: { mode: "check-out" } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  global.mockGeolocationNext(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function takePhoto(screen) {
  await waitFor(() => expect(screen.getByTestId("capture-take-photo")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("capture-take-photo"));
  await waitFor(() => expect(screen.getByTestId("capture-photo-preview")).toBeTruthy());
}

test("confirm stays disabled until BOTH the photo and the location are present", async () => {
  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 9 } });
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-location-found")).toBeTruthy());
  expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("Take a photo to continue.")).toBeTruthy();

  await takePhoto(screen);

  expect(screen.getByText(/Photo ready · 184 KB/)).toBeTruthy();
  expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(false);
  expect(screen.queryByTestId("capture-blocking-reason")).toBeNull();
});

test("check-in sends the compressed photo and the coords WITH accuracy, then goes back", async () => {
  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 9 } });
  checkIn.mockResolvedValueOnce({ data: { data: {} } });
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await takePhoto(screen);
  await waitFor(() => expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByTestId("capture-confirm"));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(checkIn).toHaveBeenCalledWith({
    coords: { lat: 28.61, lng: 77.2, accuracy: 9 },
    photoUri: "file:///tmp/photo-small.jpg",
  });
  expect(checkOut).not.toHaveBeenCalled();
});

test("check-out mode calls the check-out endpoint and shows the server's refusal", async () => {
  const error = new Error("refused");
  error.response = { status: 409, data: { message: "No open check-in found — check in before checking out." } };
  checkOut.mockRejectedValueOnce(error);
  const screen = await render(<CaptureScreen navigation={navigation} route={checkOutRoute} />);

  await takePhoto(screen);
  await waitFor(() => expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByTestId("capture-confirm"));

  expect(await screen.findByText("No open check-in found — check in before checking out.")).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test("a poor fix is offered, not taken: Use anyway enables confirm", async () => {
  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 420 } });
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-location-poor")).toBeTruthy());
  expect(screen.getByText(/±420 m/)).toBeTruthy();
  await takePhoto(screen);
  expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(true);

  await fireEvent.press(screen.getByTestId("capture-location-accept"));

  await waitFor(() => expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(false));
});

test("a GPS timeout ends with a message and a retry, never a hang", async () => {
  global.mockGeolocationNext({ error: { code: 3 } });
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-location-timeout")).toBeTruthy());
  expect(screen.getByText(/Couldn't get a GPS fix in 20 seconds/)).toBeTruthy();

  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 5 } });
  await fireEvent.press(screen.getByTestId("capture-location-retry"));

  await waitFor(() => expect(screen.getByTestId("capture-location-found")).toBeTruthy());
});

test("camera denied once explains and asks again; blocked links to the app settings", async () => {
  PermissionsAndroid.request.mockImplementation(async (permission) =>
    permission === PermissionsAndroid.PERMISSIONS.CAMERA
      ? PermissionsAndroid.RESULTS.DENIED
      : PermissionsAndroid.RESULTS.GRANTED
  );
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-camera-denied")).toBeTruthy());
  expect(screen.queryByTestId("capture-take-photo")).toBeNull();

  PermissionsAndroid.request.mockImplementation(async (permission) =>
    permission === PermissionsAndroid.PERMISSIONS.CAMERA
      ? PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      : PermissionsAndroid.RESULTS.GRANTED
  );
  await fireEvent.press(screen.getByTestId("capture-camera-ask"));

  await waitFor(() => expect(screen.getByTestId("capture-camera-blocked")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("capture-camera-settings"));
  expect(openAppSettings).toHaveBeenCalled();
});

test("location blocked links to the app settings, and confirm stays disabled", async () => {
  PermissionsAndroid.request.mockImplementation(async (permission) =>
    permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      ? PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      : PermissionsAndroid.RESULTS.GRANTED
  );
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-location-blocked")).toBeTruthy());
  await takePhoto(screen);
  expect(screen.getByTestId("capture-confirm").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("Waiting for your location.")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("capture-location-settings"));
  expect(openAppSettings).toHaveBeenCalled();
});

test("location services off → says so, with a button straight to the phone's location setting (2026-10-23)", async () => {
  const sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue();
  global.mockGeolocationNext({ error: { code: 2 } });
  const screen = await render(<CaptureScreen navigation={navigation} route={checkInRoute} />);

  await waitFor(() => expect(screen.getByTestId("capture-location-unavailable")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("capture-location-turn-on"));
  expect(sendIntent).toHaveBeenCalledWith("android.settings.LOCATION_SOURCE_SETTINGS");
});
