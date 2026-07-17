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

  async login(email, password) {
    const response = await loginRequest({ email, password });
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
