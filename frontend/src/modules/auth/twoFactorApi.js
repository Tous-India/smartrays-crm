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
 * Enrolment works with EITHER credential: a logged-in user enrolling from
 * Settings sends their session cookie, while someone stopped at the mandatory
 * gate has only a pre-auth token. Passing no token falls back to the cookie.
 */
export function startEnrolment(preAuthToken) {
  return apiClient.post("/auth/2fa/enrol/start", {}, preAuthToken ? preAuth(preAuthToken) : undefined);
}

export function confirmEnrolment(token, preAuthToken) {
  return apiClient.post(
    "/auth/2fa/enrol/confirm",
    { token },
    preAuthToken ? preAuth(preAuthToken) : undefined
  );
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
