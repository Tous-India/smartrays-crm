import apiClient from "../../services/apiClient";

/**
 * Two-factor endpoints (§7.38, 2026-08-05).
 *
 * The pre-auth token is passed explicitly as an `Authorization: Bearer`
 * header rather than relying on a cookie — it deliberately isn't one, so the
 * browser never sends it automatically anywhere. It lives only in React state
 * for the few seconds between password and code, and is never persisted.
 */
function preAuth(preAuthToken) {
  return { headers: { Authorization: `Bearer ${preAuthToken}` } };
}

export function verifyTwoFactor(preAuthToken, token, rememberDevice = false) {
  return apiClient.post("/auth/2fa/verify", { token, rememberDevice }, preAuth(preAuthToken));
}

/**
 * Trusted devices (§7.40, 2026-08-05). The device token itself is an httpOnly
 * cookie, so it is never readable here — these endpoints deal only in the
 * server's own safe view of the list (label and dates, never the hash).
 */
export function fetchTrustedDevices() {
  return apiClient.get("/auth/trusted-devices");
}

export function revokeTrustedDevice(deviceId) {
  return apiClient.delete(`/auth/trusted-devices/${deviceId}`);
}

export function revokeAllTrustedDevices() {
  return apiClient.delete("/auth/trusted-devices");
}

/**
 * Enrolment is session-only as of 2026-08-08. It used to accept a pre-auth
 * token too, for an admin/manager held at the mandatory-enrolment gate; 2FA is
 * opt-in for every role now, so enrolling is always something an already
 * signed-in user chooses to do.
 */
export function startEnrolment() {
  return apiClient.post("/auth/2fa/enrol/start", {});
}

export function confirmEnrolment(token) {
  return apiClient.post("/auth/2fa/enrol/confirm", { token });
}

/**
 * Turning your OWN 2FA off. BOTH the current password and a live second factor
 * (TOTP or recovery code) are required — the session cookie alone is
 * deliberately not enough, since a stolen session is exactly what 2FA exists
 * to defeat. The backend also revokes every trusted device.
 */
export function disableTwoFactor({ password, token }) {
  return apiClient.post("/auth/2fa/disable", { password, token });
}

export function regenerateRecoveryCodes() {
  return apiClient.post("/auth/2fa/recovery-codes");
}

export function adminResetTwoFactor({ targetUserId, password, token }) {
  return apiClient.post("/auth/2fa/admin-reset", { targetUserId, password, token });
}

export function changePassword({ currentPassword, newPassword }) {
  return apiClient.post("/auth/change-password", { currentPassword, newPassword });
}
