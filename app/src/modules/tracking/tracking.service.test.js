import { NativeModules, PermissionsAndroid } from "react-native";
import apiClient, { refreshClient } from "../../api/apiClient";
import {
  getTrackingState,
  recordDisclosureAnswer,
  requestTrackingPermissions,
  syncTrackingWithShift,
  PAUSE_REASONS,
  TRACKING_STATUS,
} from "./tracking.service";
import { DISCLOSURE_ANSWERS } from "../../constants/tracking.constants";

/**
 * The one rule — tracking only while a shift is open and allowed — and what
 * the card is told, against the in-memory native twin.
 */

const native = NativeModules.SmartraysTracking;
const OPEN_SHIFT = { checkIn: { time: new Date().toISOString() }, checkOut: {} };

function respond(config, status, data) {
  return Promise.resolve({ status, statusText: String(status), headers: {}, config, data });
}

beforeEach(async () => {
  global.mockTrackingNative.running = false;
  global.mockTrackingNative.queue = [];
  global.mockTrackingNative.flags = {};
  jest.clearAllMocks();
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  refreshClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));
  apiClient.defaults.adapter = async (config) => {
    if (config.url.includes("/location/config")) {
      return respond(config, 200, { data: { pingIntervalMinutes: 2 } });
    }
    return respond(config, 200, { data: { accepted: 0, duplicates: 0, rejected: [], results: [] } });
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("an open shift with the disclosure accepted and both grants → the engine starts at the server's cadence", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.ACCEPTED);

  await syncTrackingWithShift(OPEN_SHIFT);

  expect(native.start).toHaveBeenCalledWith(2 * 60 * 1000);
  expect(global.mockTrackingNative.running).toBe(true);
  expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.TRACKING, reason: null });
});

test("no open shift → the engine stops and the queue is pushed; never tracks outside a shift", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.ACCEPTED);
  global.mockTrackingNative.running = true;

  await syncTrackingWithShift(null);

  expect(native.stop).toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
  expect(await getTrackingState(null)).toMatchObject({ status: TRACKING_STATUS.OFF });
});

test("disclosure declined → paused (declined), whatever the OS grants say", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.DECLINED);

  await syncTrackingWithShift(OPEN_SHIFT);

  expect(native.start).not.toHaveBeenCalled();
  expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.PAUSED, reason: PAUSE_REASONS.DECLINED });
});

test("disclosure accepted but background location missing → paused (permission), and a running engine is stopped", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.ACCEPTED);
  PermissionsAndroid.check.mockImplementation(async (permission) => permission !== PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
  global.mockTrackingNative.running = true;

  await syncTrackingWithShift(OPEN_SHIFT);

  expect(native.stop).toHaveBeenCalled();
  expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.PAUSED, reason: PAUSE_REASONS.PERMISSION });
});

test("the queue count and last fix reach the card", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.ACCEPTED);
  global.mockTrackingNative.running = true;
  global.mockTrackingNative.queue = [{ id: "a", capturedAt: 1, lat: 0, lng: 0 }, { id: "b", capturedAt: 2, lat: 0, lng: 0 }];
  global.mockTrackingNative.lastCapturedAt = 1700000000000;

  const state = await getTrackingState(OPEN_SHIFT);

  expect(state.queuedCount).toBe(2);
  expect(state.lastCapturedAt.getTime()).toBe(1700000000000);
});

test("permissions are asked one at a time, in order: foreground location → notifications → background; a refused first stops the sequence", async () => {
  const asked = [];
  PermissionsAndroid.request.mockImplementation(async (permission) => {
    asked.push(permission);
    return PermissionsAndroid.RESULTS.GRANTED;
  });

  const granted = await requestTrackingPermissions();

  expect(asked).toEqual([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
  ]);
  expect(granted).toEqual({ fine: "granted", notifications: "granted", background: "granted" });

  asked.length = 0;
  PermissionsAndroid.request.mockImplementation(async (permission) => {
    asked.push(permission);
    return PermissionsAndroid.RESULTS.DENIED;
  });

  const refused = await requestTrackingPermissions();

  expect(asked).toEqual([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]);
  expect(refused).toEqual({ fine: "denied", notifications: null, background: null });
});
