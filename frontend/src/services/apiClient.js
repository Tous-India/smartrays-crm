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

/**
 * The backend's marker for "the credential identifying you is gone" — see
 * `backend/src/middlewares/authenticate.middleware.js`, which is the only
 * place that sets it.
 */
const SESSION_EXPIRED = "SESSION_EXPIRED";

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    /*
     * A 401 means two different things, and until 2026-08-08 this could not
     * tell them apart:
     *
     *   - your session is dead        -> sign out and redirect
     *   - the secret you typed is wrong -> show the message, stay put
     *
     * It used to redirect on EVERY 401 except a hard-coded `/auth/login`
     * exemption. So a mistyped password on 2FA-disable, change-password or
     * admin re-authentication signed the user out — and the modal unmounted
     * before the server's message could render, which is why it read as "the
     * feature doesn't work" with no error at all.
     *
     * Now the server says which kind it is, and this redirects ONLY on the
     * marked kind. The direction is the point: an endpoint that checks a
     * credential is safe by default and needs no entry here, whereas the old
     * exemption list quietly mis-handled every endpoint nobody remembered to
     * add. Note this deliberately keys off the RESPONSE, never the URL — a
     * session that dies while the disable modal is open still signs the user
     * out, because the server marks that too.
     */
    const isUnauthorized = error.response?.status === 401;
    const isSessionExpired = (error.response?.data?.errors || []).some(
      (entry) => entry?.code === SESSION_EXPIRED
    );

    if (isUnauthorized && isSessionExpired) {
      onUnauthorized?.();

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    // Everything else — including every credential rejection — reaches the
    // caller, which already knows how to render `error.response.data.message`.
    return Promise.reject(error);
  }
);

export default apiClient;
