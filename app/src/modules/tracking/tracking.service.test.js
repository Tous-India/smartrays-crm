import { NativeModules, PermissionsAndroid } from "react-native";
import apiClient, { refreshClient } from "../../api/apiClient";
import {
  getDisclosureAnswer,
  getTrackingState,
  recordDisclosureAnswer,
  requestTrackingPermissions,
  syncConsentFromServer,
  syncTrackingWithShift,
  PAUSE_REASONS,
  TRACKING_STATUS,
} from "./tracking.service";
import { DISCLOSURE_ANSWERS, DISCLOSURE_VERSION, TRACKING_FLAGS } from "../../constants/tracking.constants";

/**
 * The one rule — tracking only while a shift is open and allowed — and what
 * the card is told, against the in-memory native twin.
 */

const native = NativeModules.SmartraysTracking;
const OPEN_SHIFT = { checkIn: { time: new Date().toISOString() }, checkOut: {} };

function respond(config, status, data) {
  return Promise.resolve({ status, statusText: String(status), headers: {}, config, data });
}

/** What the fake server holds: the latest consent record, the month's attendance. */
const server = { consent: null, attendance: [], requests: [] };

function consentRecordFrom(body) {
  return {
    id: "consent-1",
    userId: "user-1",
    decision: body.decision,
    disclosureVersion: body.disclosureVersion,
    appVersion: body.appVersion,
    deviceId: body.deviceId,
    recordedAt: "2026-09-21T09:00:00.000Z",
  };
}

beforeEach(async () => {
  global.mockTrackingNative.running = false;
  global.mockTrackingNative.queue = [];
  global.mockTrackingNative.flags = {};
  server.consent = null;
  server.attendance = [];
  server.requests.length = 0;
  jest.clearAllMocks();
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  refreshClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));
  apiClient.defaults.adapter = async (config) => {
    server.requests.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : null });

    if (config.url.includes("/location/config")) {
      return respond(config, 200, { data: { pingIntervalMinutes: 2 } });
    }
    if (config.url.includes("/location/consent/me")) {
      return respond(config, 200, { data: server.consent });
    }
    if (config.url.includes("/location/consent")) {
      server.consent = consentRecordFrom(JSON.parse(config.data));
      return respond(config, 201, { data: server.consent });
    }
    if (config.url.includes("/attendance/me")) {
      return respond(config, 200, { data: server.attendance });
    }
    return respond(config, 200, { data: { accepted: 0, duplicates: 0, rejected: [], results: [] } });
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("an open shift with the disclosure accepted and both grants → the engine starts at the server's cadence", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);

  await syncTrackingWithShift(OPEN_SHIFT);

  expect(native.start).toHaveBeenCalledWith(2 * 60 * 1000);
  expect(global.mockTrackingNative.running).toBe(true);
  expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.TRACKING, reason: null });
});

test("no open shift → the engine stops and the queue is pushed; never tracks outside a shift", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);
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
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);
  PermissionsAndroid.check.mockImplementation(async (permission) => permission !== PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
  global.mockTrackingNative.running = true;

  await syncTrackingWithShift(OPEN_SHIFT);

  expect(native.stop).toHaveBeenCalled();
  expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.PAUSED, reason: PAUSE_REASONS.PERMISSION });
});

test("the queue count and last fix reach the card", async () => {
  await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);
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

describe("the consent record (final-plan.md §7.73)", () => {
  test("a decision goes to the server with the disclosure version, app version and device id, then is cached", async () => {
    await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);

    const post = server.requests.find((request) => request.method === "post" && request.url.includes("/location/consent"));
    expect(post.body).toEqual({
      decision: "granted",
      disclosureVersion: DISCLOSURE_VERSION,
      appVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      deviceId: expect.any(String),
    });
    expect(global.mockTrackingNative.flags[TRACKING_FLAGS.DISCLOSURE]).toBe(`granted|${DISCLOSURE_VERSION}|2026-09-21T09:00:00.000Z`);
    expect(await getDisclosureAnswer()).toEqual({ answer: "granted", version: DISCLOSURE_VERSION, answeredAt: "2026-09-21T09:00:00.000Z" });
  });

  test("a decision the server did not take is not kept locally either", async () => {
    apiClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));

    await expect(recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED)).rejects.toThrow("Network Error");

    expect(global.mockTrackingNative.flags[TRACKING_FLAGS.DISCLOSURE]).toBeUndefined();
    expect(await getDisclosureAnswer()).toBeNull();
  });

  test("a fresh install restores the server's decision on sync — no second prompt", async () => {
    server.consent = consentRecordFrom({ decision: "granted", disclosureVersion: DISCLOSURE_VERSION, appVersion: "0.0.1", deviceId: "old-phone" });

    expect(await getDisclosureAnswer()).toBeNull();
    await syncConsentFromServer();

    expect(await getDisclosureAnswer()).toMatchObject({ answer: "granted", version: DISCLOSURE_VERSION });
    await syncTrackingWithShift(OPEN_SHIFT);
    expect(native.start).toHaveBeenCalled();
  });

  test("a decision on an older disclosure text counts as no answer: asked again, tracking off meanwhile", async () => {
    server.consent = consentRecordFrom({ decision: "granted", disclosureVersion: "2026-01-01.1", appVersion: "0.0.1", deviceId: "d" });

    await syncConsentFromServer();

    expect(await getDisclosureAnswer()).toBeNull();
    expect(await getTrackingState(OPEN_SHIFT)).toMatchObject({ status: TRACKING_STATUS.PAUSED, reason: PAUSE_REASONS.UNANSWERED });
    expect(native.start).not.toHaveBeenCalled();
  });

  test("the server having no record clears a stale local cache (another account signed in on this phone)", async () => {
    global.mockTrackingNative.flags[TRACKING_FLAGS.DISCLOSURE] = `granted|${DISCLOSURE_VERSION}|2026-09-01T00:00:00.000Z`;

    await syncConsentFromServer();

    expect(global.mockTrackingNative.flags[TRACKING_FLAGS.DISCLOSURE]).toBeUndefined();
    expect(await getDisclosureAnswer()).toBeNull();
  });
});
