import { create } from "zustand";

/**
 * Session state — the ONE piece of global state (the same rule as the web's
 * sessionStore: Zustand only where state is genuinely global, and a signed-in
 * user is read by every screen and by the navigator).
 *
 * `status` drives the root navigator:
 *   restoring   — launch: reading the keychain, asking the server who we are
 *   unreachable — tokens exist but the server could not be reached; retry
 *   signedOut   — the auth stack
 *   signedIn    — the role's app stack, `user` populated
 *
 * Nothing here calls the API or the keychain; modules/auth/session.service.js
 * does, and writes the outcome here.
 */
export const SESSION_STATUS = {
  RESTORING: "restoring",
  UNREACHABLE: "unreachable",
  SIGNED_OUT: "signedOut",
  SIGNED_IN: "signedIn",
};

const useSessionStore = create((set) => ({
  status: SESSION_STATUS.RESTORING,
  user: null,

  setRestoring: () => set({ status: SESSION_STATUS.RESTORING }),
  setUnreachable: () => set({ status: SESSION_STATUS.UNREACHABLE, user: null }),
  setSignedIn: (user) => set({ status: SESSION_STATUS.SIGNED_IN, user }),
  setSignedOut: () => set({ status: SESSION_STATUS.SIGNED_OUT, user: null }),
}));

export default useSessionStore;
