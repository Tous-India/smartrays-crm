import { Linking, PermissionsAndroid } from "react-native";

/**
 * Runtime permissions, reduced to the three outcomes a screen has to handle
 * (app-plan.md §1.2's table): granted, denied once (explain and ask again),
 * or blocked ("don't ask again" — only the system settings can change it).
 */
export const PERMISSION_STATUS = {
  GRANTED: "granted",
  DENIED: "denied",
  BLOCKED: "blocked",
};

const RESULT_TO_STATUS = {
  [PermissionsAndroid.RESULTS.GRANTED]: PERMISSION_STATUS.GRANTED,
  [PermissionsAndroid.RESULTS.DENIED]: PERMISSION_STATUS.DENIED,
  [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN]: PERMISSION_STATUS.BLOCKED,
};

/** Asks the OS for one permission and maps its answer. */
export async function requestPermission(permission) {
  const result = await PermissionsAndroid.request(permission);

  return RESULT_TO_STATUS[result] || PERMISSION_STATUS.DENIED;
}

export async function hasPermission(permission) {
  return PermissionsAndroid.check(permission);
}

export const CAMERA_PERMISSION = PermissionsAndroid.PERMISSIONS.CAMERA;
export const FINE_LOCATION_PERMISSION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

/** The app's own page in the system settings — the only way out of "blocked". */
export function openAppSettings() {
  return Linking.openSettings();
}
