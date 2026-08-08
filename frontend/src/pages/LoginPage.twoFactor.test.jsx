import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import useSessionStore from "../store/sessionStore";
import * as authApi from "../modules/auth/api";
import * as twoFactorApi from "../modules/auth/twoFactorApi";

vi.mock("../modules/auth/api", () => ({
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));
vi.mock("../modules/auth/twoFactorApi", () => ({
  verifyTwoFactor: vi.fn(),
  startEnrolment: vi.fn(),
  confirmEnrolment: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  changePassword: vi.fn(),
  adminResetTwoFactor: vi.fn(),
}));
// jsdom has no canvas, which qrcode needs.
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

async function submitCredentials() {
  await userEvent.type(screen.getByLabelText(/email/i), "admin@test.local");
  await userEvent.type(screen.getByLabelText(/password/i), "Password123");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

/**
 * §7.38 — the frontend counterpart of the backend's "no cookie before the
 * second factor" guarantee: the app must not consider anyone signed in on the
 * strength of a password alone.
 */
describe("LoginPage — two-factor challenge", () => {
  it("does NOT mark the session authenticated when a second factor is outstanding", async () => {
    authApi.loginRequest.mockResolvedValue({
      data: { data: { requiresTwoFactor: true, preAuthToken: "pre-auth-123" } },
    });

    renderLogin();
    await submitCredentials();

    expect(await screen.findByTestId("two-factor-challenge")).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(useSessionStore.getState().user).toBeNull();
  });

  it("verifies the code with the pre-auth token, then loads the real session", async () => {
    authApi.loginRequest.mockResolvedValue({
      data: { data: { requiresTwoFactor: true, preAuthToken: "pre-auth-123" } },
    });
    twoFactorApi.verifyTwoFactor.mockResolvedValue({ data: { data: {} } });
    authApi.fetchCurrentUser.mockResolvedValue({
      data: { data: { _id: "u1", name: "Admin", role: "admin" } },
    });

    renderLogin();
    await submitCredentials();

    await userEvent.type(await screen.findByLabelText(/verification or recovery code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    // The third argument is "remember this device" (§7.40) — false here
    // because the box was left alone, which is its default.
    await waitFor(() =>
      expect(twoFactorApi.verifyTwoFactor).toHaveBeenCalledWith("pre-auth-123", "123456", false)
    );
    await waitFor(() => expect(useSessionStore.getState().isAuthenticated).toBe(true));
  });

  it("offers a restart instead of a retry once the attempt is rate-limited", async () => {
    authApi.loginRequest.mockResolvedValue({
      data: { data: { requiresTwoFactor: true, preAuthToken: "pre-auth-123" } },
    });
    twoFactorApi.verifyTwoFactor.mockRejectedValue({
      response: { status: 429, data: { message: "Too many incorrect codes." } },
    });

    renderLogin();
    await submitCredentials();
    await userEvent.type(await screen.findByLabelText(/verification or recovery code/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(await screen.findByRole("button", { name: /start again/i })).toBeInTheDocument();
    // The code field is gone — retrying it cannot succeed.
    expect(screen.queryByLabelText(/verification or recovery code/i)).not.toBeInTheDocument();
  });

  it("shows NO enrolment screen for an admin without 2FA — the mandate is gone", async () => {
    // Inverted 2026-08-08. This used to assert a BLOCKING enrolment screen for
    // admin/manager. 2FA is opt-in for every role now, so an admin without it
    // signs straight in and turns it on from Settings if they want it.
    authApi.loginRequest.mockResolvedValue({
      data: { data: { _id: "a1", name: "Admin", role: "admin" } },
    });

    renderLogin();
    await submitCredentials();

    await waitFor(() => expect(useSessionStore.getState().isAuthenticated).toBe(true));
    expect(screen.queryByTestId("enrolment-step")).not.toBeInTheDocument();
    expect(twoFactorApi.startEnrolment).not.toHaveBeenCalled();
  });

  // The "I've saved these" recovery-code confirmation used to be asserted here,
  // reached through the blocking login enrolment screen. Enrolment now only
  // happens from Settings → Account, so that assertion moved with it — see
  // AccountSecurityPage.twoFactor.test.jsx.

  it("signs in normally, with no 2FA step, when no second factor is required", async () => {
    authApi.loginRequest.mockResolvedValue({
      data: { data: { _id: "u1", name: "Employee", role: "employee" } },
    });

    renderLogin();
    await submitCredentials();

    await waitFor(() => expect(useSessionStore.getState().isAuthenticated).toBe(true));
    expect(screen.queryByTestId("two-factor-challenge")).not.toBeInTheDocument();
  });
});
