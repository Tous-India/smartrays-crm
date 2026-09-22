import apiClient from "../../api/apiClient";
import { API_PATHS } from "../../constants/api.constants";

/** `POST /notifications/devices` — this install's FCM token, idempotent by token. */
export function registerPushDevice({ token, deviceId, appVersion }) {
  return apiClient.post(API_PATHS.PUSH_DEVICES, { token, platform: "android", deviceId, appVersion });
}

/** `DELETE /notifications/devices/:token` — no more pushes to this install. */
export function unregisterPushDevice(token) {
  return apiClient.delete(`${API_PATHS.PUSH_DEVICES}/${encodeURIComponent(token)}`);
}
