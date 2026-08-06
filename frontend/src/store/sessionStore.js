import { create } from "zustand";
import { registerUnauthorizedHandler } from "../services/apiClient";
import { loginRequest, logoutRequest, fetchCurrentUser } from "../modules/auth/api";

/**
 * The one piece of genuine cross-page state in this app (per §3/smartrays.md's
 * "Zustand only for genuine cross-page state" rule) — who the current user
 * is, their role, and their permissions. Nothing else belongs in here.
 *
 * Session identity always comes from a real `GET /auth/me` request, never
 * decoded from the JWT — the token lives in an httpOnly cookie invisible to
 * JS anyway, and the backend's DB is the single source of truth for who a
 * user is (§4.1). `isLoading` covers the initial `/auth/me` call so
 * `ProtectedRoute` can show a loading state instead of flashing a redirect.
 */
export const useSessionStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  async initializeSession() {
    try {
      const response = await fetchCurrentUser();
      set({ user: response.data.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  /**
   * §7.38 — login no longer always produces a session. When a second factor
   * is outstanding the backend returns `preAuthToken` and sets NO cookie, so
   * this must NOT mark the store authenticated; it returns the challenge and
   * lets `LoginPage` render the code or enrolment step. Treating that
   * response as a session would show a logged-in shell to someone who has
   * only supplied a password.
   */
  async login(email, password) {
    const response = await loginRequest({ email, password });
    const data = response.data.data;

    if (data?.preAuthToken) {
      return data;
    }

    set({ user: data, isAuthenticated: true, isLoading: false });
    return data;
  },

  /**
   * Called once the second factor has verified and the real cookie exists.
   * Re-reads `/auth/me` rather than trusting the verify response, keeping the
   * store's "identity always comes from the server" rule intact.
   */
  async completeTwoFactor() {
    const response = await fetchCurrentUser();
    set({ user: response.data.data, isAuthenticated: true, isLoading: false });
    return response.data.data;
  },

  async logout() {
    try {
      await logoutRequest();
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  async refetchSession() {
    const response = await fetchCurrentUser();
    set({ user: response.data.data, isAuthenticated: true, isLoading: false });
  },

  clearSession() {
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

// Wired to apiClient's response interceptor so a 401 from ANY request (not
// just /auth/me) clears session state before the redirect fires.
registerUnauthorizedHandler(() => useSessionStore.getState().clearSession());

export default useSessionStore;
