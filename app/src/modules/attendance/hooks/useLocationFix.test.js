import { PermissionsAndroid } from "react-native";
import { renderHook, waitFor } from "@testing-library/react-native";
import useLocationFix, { FIX_STATUS } from "./useLocationFix";

/**
 * Every way a fix can end, each as one state with the coords it carries.
 * The permission and the position are both mocked at the module boundary.
 */

beforeEach(() => {
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  global.mockGeolocationNext(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("a precise fix → found, with lat/lng/accuracy", async () => {
  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 8 } });

  const { result } = await renderHook(() => useLocationFix());

  await waitFor(() => expect(result.current.status).toBe(FIX_STATUS.FOUND));
  expect(result.current.coords).toEqual({ lat: 28.61, lng: 77.2, accuracy: 8 });
});

test("an imprecise fix → poor, kept, and accepted on request", async () => {
  global.mockGeolocationNext({ coords: { latitude: 28.61, longitude: 77.2, accuracy: 350 } });

  const { result } = await renderHook(() => useLocationFix());

  await waitFor(() => expect(result.current.status).toBe(FIX_STATUS.POOR));
  expect(result.current.coords.accuracy).toBe(350);

  result.current.acceptPoorFix();

  await waitFor(() => expect(result.current.status).toBe(FIX_STATUS.FOUND));
  expect(result.current.coords.accuracy).toBe(350);
});

test("timeout, unavailable and provider-denied each end in their own state", async () => {
  for (const [code, status] of [
    [3, FIX_STATUS.TIMEOUT],
    [2, FIX_STATUS.UNAVAILABLE],
    [1, FIX_STATUS.BLOCKED],
  ]) {
    global.mockGeolocationNext({ error: { code, message: "x" } });

    const { result } = await renderHook(() => useLocationFix());

    await waitFor(() => expect(result.current.status).toBe(status));
    expect(result.current.coords).toBeNull();
  }
});

test("permission denied once → denied; never-ask-again → blocked; neither asks the provider", async () => {
  const position = require("@react-native-community/geolocation").getCurrentPosition;
  position.mockClear();

  PermissionsAndroid.request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
  const denied = await renderHook(() => useLocationFix());
  await waitFor(() => expect(denied.result.current.status).toBe(FIX_STATUS.DENIED));

  PermissionsAndroid.request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  const blocked = await renderHook(() => useLocationFix());
  await waitFor(() => expect(blocked.result.current.status).toBe(FIX_STATUS.BLOCKED));

  expect(position).not.toHaveBeenCalled();
});
