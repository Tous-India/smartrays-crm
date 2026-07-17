import apiClient from "../../services/apiClient";

/**
 * Auth module's API calls, per §9's "API file per feature" convention. All
 * of these go through the one shared `apiClient` instance — never a
 * separate axios instance.
 */

export function loginRequest({ email, password }) {
  return apiClient.post("/auth/login", { email, password });
}

export function logoutRequest() {
  return apiClient.post("/auth/logout");
}

export function fetchCurrentUser() {
  return apiClient.get("/auth/me");
}

export function forgotPasswordRequest({ email }) {
  return apiClient.post("/auth/forgot-password", { email });
}

export function resetPasswordRequest({ token, newPassword }) {
  return apiClient.post("/auth/reset-password", { token, newPassword });
}
