import * as Keychain from "react-native-keychain";
import {
  saveTokens,
  loadTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  saveTrustedDeviceToken,
  getTrustedDeviceToken,
  getDeviceId,
  getDeviceLabel,
} from "./tokenStorage";

/**
 * The keychain is the ONLY place a token is written. The mock in
 * jest.setup.js records every call, so "never AsyncStorage" is not an
 * assertion here — there is no AsyncStorage module in the app at all — but
 * "every write goes through Keychain.setGenericPassword" is.
 */

beforeEach(async () => {
  Keychain.__entries.clear();
  jest.clearAllMocks();
  await clearTokens();
});

test("a saved pair round-trips through the keychain, and the access token is also in memory", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });

  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    expect.any(String),
    JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1" }),
    expect.objectContaining({ service: "com.smartrays.crm.session" })
  );
  expect(getAccessToken()).toBe("access-1");
  expect(await loadTokens()).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
  expect(await getRefreshToken()).toBe("refresh-1");
});

test("clearing forgets the pair in memory and in the keychain, but keeps the trusted-device token", async () => {
  await saveTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  await saveTrustedDeviceToken("trusted-1");

  await clearTokens();

  expect(getAccessToken()).toBeNull();
  expect(await loadTokens()).toBeNull();
  expect(await getTrustedDeviceToken()).toBe("trusted-1");
});

test("an unreadable session entry counts as signed out rather than crashing the launch", async () => {
  await Keychain.setGenericPassword("session", "not json", { service: "com.smartrays.crm.session" });

  expect(await loadTokens()).toBeNull();
});

test("the device id is minted once and then stable", async () => {
  const first = await getDeviceId();
  const second = await getDeviceId();

  expect(first).toBeTruthy();
  expect(second).toBe(first);
  expect(getDeviceLabel()).toMatch(/Android/);
});
