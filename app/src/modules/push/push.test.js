import { PermissionsAndroid } from "react-native";
import apiClient, { refreshClient } from "../../api/apiClient";
import { saveTokens, clearTokens } from "../../store/tokenStorage";
import { registerForPush, unregisterForPush, getCurrentPushToken } from "./push.service";
import { routeForNotification, navigateForNotification } from "./pushNavigation";

/**
 * Push (STEP 4): the token goes to the server on registration and again on
 * refresh; sign-out unregisters and deletes it; a build without Firebase
 * does nothing at all; a tap lands on the right screen.
 */
function respond(config, status, data) {
  return Promise.resolve({ status, statusText: String(status), headers: {}, config, data });
}

const calls = [];

beforeEach(async () => {
  calls.length = 0;
  jest.clearAllMocks();
  global.mockFirebase.apps = [{ name: "[DEFAULT]" }];
  global.mockFirebase.token = "fcm-token-1";
  global.mockFirebase.listeners.refresh.length = 0;
  global.mockFirebase.deleted = 0;
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
  refreshClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));
  apiClient.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : null });
    return respond(config, 201, { data: {} });
  };
  await clearTokens();
  await saveTokens({ accessToken: "a", refreshToken: "r" });
  await unregisterForPush();
  calls.length = 0;
  global.mockFirebase.deleted = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("registration sends the FCM token with the install's device id and app version, and re-sends a refreshed token", async () => {
  const token = await registerForPush();

  expect(token).toBe("fcm-token-1");
  expect(calls).toEqual([
    {
      method: "post",
      url: "/notifications/devices",
      body: { token: "fcm-token-1", platform: "android", deviceId: expect.any(String), appVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/) },
    },
  ]);

  global.mockFirebase.listeners.refresh.forEach((listener) => listener("fcm-token-2"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(calls[1]).toMatchObject({ method: "post", body: { token: "fcm-token-2" } });
  expect(getCurrentPushToken()).toBe("fcm-token-2");
});

test("sign-out unregisters the token on the server and deletes it on the device", async () => {
  await registerForPush();
  calls.length = 0;

  await unregisterForPush();

  expect(calls).toEqual([{ method: "delete", url: "/notifications/devices/fcm-token-1", body: null }]);
  expect(global.mockFirebase.deleted).toBe(1);
  expect(getCurrentPushToken()).toBeNull();
});

test("a build without Firebase (no google-services.json) registers nothing and never touches the server", async () => {
  global.mockFirebase.apps = [];

  expect(await registerForPush()).toBeNull();
  await unregisterForPush();

  expect(calls).toEqual([]);
});

test("the notification permission is asked only when it was never answered", async () => {
  PermissionsAndroid.check.mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

  await registerForPush();
  expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);

  PermissionsAndroid.check.mockResolvedValue(true);
  await registerForPush();
  expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
});

test("a tap lands on the screen the notification is about", () => {
  expect(routeForNotification({ type: "service_assigned", module: "services", id: "s1" })).toEqual({
    name: "ServicesTab",
    params: { screen: "ServiceDetail", params: { serviceId: "s1" }, initial: false },
  });
  expect(routeForNotification({ type: "leave_approved", module: "leave", id: "l1" })).toEqual({ name: "LeaveTab" });
  expect(routeForNotification({ type: "shift_open_reminder", module: "attendance", id: "a1" })).toEqual({ name: "Home" });
  expect(routeForNotification({})).toEqual({ name: "Home" });

  const ref = { isReady: () => true, navigate: jest.fn() };
  expect(navigateForNotification(ref, { type: "leave_declined" })).toBe(true);
  // From the root navigator a tab is reached THROUGH the tabs (2026-10-23):
  // a bare "LeaveTab" is not handled by any navigator up there.
  expect(ref.navigate).toHaveBeenCalledWith("MainTabs", { screen: "LeaveTab", params: undefined });
  expect(navigateForNotification({ isReady: () => false, navigate: jest.fn() }, {})).toBe(false);
});

// Customer complaints (2026-10-23): every complaint push opens that complaint;
// the daily summary opens the list.
test("a complaint push opens that complaint; the daily summary opens the list", () => {
  for (const type of ["complaint_new", "complaint_assigned", "complaint_status", "complaint_sent_back", "complaint_reminder"]) {
    expect(routeForNotification({ type, module: "complaints", id: "t1" })).toEqual({
      name: "ServicesTab",
      params: { screen: "ComplaintDetail", params: { ticketId: "t1" }, initial: false },
    });
  }
  expect(routeForNotification({ type: "complaint_daily_summary", module: "complaint_summary", id: "" })).toEqual({
    name: "ServicesTab",
    params: { screen: "Complaints", initial: false },
  });
});

// Live status (2026-10-23): "someone's location is off / disconnected" opens
// the Team tab's Live list filtered to the people who need attention.
test("a staff location alert opens Team → Live, filtered to who needs attention", () => {
  expect(routeForNotification({ type: "staff_location_alert", module: "users", id: "u1" })).toEqual({
    name: "TeamTab",
    params: { screen: "Team", params: { segment: "live", filter: "attention", openedAt: expect.any(Number) } },
  });
});
