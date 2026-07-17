import axios from "axios";

/**
 * The one shared Axios instance for the whole app — every module's
 * `src/modules/<feature>/api.js` imports this instead of creating its own
 * axios instance, per `.context/final-plan.md` §9's module pattern.
 *
 * `withCredentials: true` is required for the httpOnly auth cookie to be
 * sent/received — the JWT itself is never stored or read on the client, only
 * the backend and the browser's cookie jar ever see it (§3, §4.1).
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1",
  withCredentials: true,
});

/**
 * Registered by the session store at app startup so a 401 anywhere can clear
 * session state before the redirect below fires. Avoids a circular import
 * between this file and the store (the store imports `apiClient`, not the
 * other way around).
 */
let onUnauthorized = null;

export function registerUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isUnauthorized = error.response?.status === 401;
    const isLoginRequest = error.config?.url?.includes("/auth/login");

    // A failed login attempt is an expected 401, not a session expiring —
    // redirecting away from /login on a wrong password would be wrong.
    if (isUnauthorized && !isLoginRequest) {
      onUnauthorized?.();

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
