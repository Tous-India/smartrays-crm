import { NativeModules, PermissionsAndroid } from "react-native";
import apiClient, { refreshClient } from "../../api/apiClient";
import { saveTokens, clearTokens } from "../../store/tokenStorage";
import flushTask from "./flushTask";

/**
 * The headless run: the server's word on the shift is applied BEFORE the
 * queue goes up — the boot receiver restarts the engine from a saved flag,
 * and only the server knows whether the shift survived the reboot.
 */
const native = NativeModules.SmartraysTracking;

function respond(config, status, data) {
  return Promise.resolve({ status, statusText: String(status), headers: {}, config, data });
}

const calls = [];

beforeEach(async () => {
  calls.length = 0;
  global.mockTrackingNative.running = true;
  global.mockTrackingNative.queue = [];
  global.mockTrackingNative.flags = { disclosure: "granted|2026-09-21.1|2026-09-21T09:00:00.000Z" };
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
  refreshClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));
  await clearTokens();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function serverWhereShiftIs(open) {
  return async (config) => {
    calls.push(`${config.method} ${config.url}`);

    if (config.url.includes("/attendance/me")) {
      const record = { checkIn: { time: new Date().toISOString() }, checkOut: open ? {} : { time: new Date().toISOString() } };
      return respond(config, 200, { data: [record] });
    }
    if (config.url.includes("/location/config")) {
      return respond(config, 200, { data: { pingIntervalMinutes: 2 } });
    }
    return respond(config, 200, { data: { accepted: 0, duplicates: 0, rejected: [], results: [] } });
  };
}

test("nobody signed in → nothing asked of the server", async () => {
  apiClient.defaults.adapter = serverWhereShiftIs(true);

  await flushTask();

  expect(calls).toEqual([]);
});

test("shift closed on the server (closed from the web, or auto-closed) → the engine is stopped before the flush", async () => {
  await saveTokens({ accessToken: "a", refreshToken: "r" });
  apiClient.defaults.adapter = serverWhereShiftIs(false);

  await flushTask();

  expect(calls[0]).toMatch(/^get \/attendance\/me/);
  expect(native.stop).toHaveBeenCalled();
});

test("shift still open → the engine keeps running and the queue is pushed", async () => {
  await saveTokens({ accessToken: "a", refreshToken: "r" });
  global.mockTrackingNative.running = false;
  global.mockTrackingNative.queue = [{ id: "p1", capturedAt: Date.now(), lat: 28.6, lng: 77.2, accuracy: 10 }];
  apiClient.defaults.adapter = serverWhereShiftIs(true);

  await flushTask();

  expect(native.stop).not.toHaveBeenCalled();
  expect(native.start).toHaveBeenCalled();
  expect(calls.some((call) => call === "post /location/pings")).toBe(true);
});
