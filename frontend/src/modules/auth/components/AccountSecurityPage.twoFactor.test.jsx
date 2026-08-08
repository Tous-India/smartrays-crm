import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import AccountSecurityPage from "./AccountSecurityPage";
import useSessionStore from "../../../store/sessionStore";
import * as twoFactorApi from "../twoFactorApi";

/**
 * Settings → Account, two-factor control (2026-08-08).
 *
 * 2FA became opt-in for every role and gained a self-service OFF switch. The
 * assertions that matter are about what the control REFUSES to do: disabling
 * must collect a password and a code, because the backend requires both, and
 * a session alone is exactly what an attacker would have.
 */

vi.mock("../twoFactorApi", () => ({
  changePassword: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  fetchTrustedDevices: vi.fn(),
  revokeTrustedDevice: vi.fn(),
  revokeAllTrustedDevices: vi.fn(),
  disableTwoFactor: vi.fn(),
  startEnrolment: vi.fn(),
  confirmEnrolment: vi.fn(),
}));

// jsdom has no canvas, which qrcode needs.
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

vi.mock("../../notification/components/PushNotificationToggle", () => ({
  default: () => null,
}));

function renderPage() {
  return render(
    <App>
      <AccountSecurityPage />
    </App>
  );
}

function signedInAs({ twoFactorEnabled }) {
  useSessionStore.setState({
    user: { _id: "u1", name: "Priya", email: "priya@test.local", role: "admin", twoFactorEnabled },
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  twoFactorApi.fetchTrustedDevices.mockResolvedValue({ data: { data: [] } });
});

describe("the on/off control reflects current state", () => {
  it("renders the switch ON when 2FA is enabled", async () => {
    signedInAs({ twoFactorEnabled: true });

    renderPage();

    expect(await screen.findByTestId("two-factor-switch")).toBeChecked();
  });

  it("renders the switch OFF when 2FA is disabled", async () => {
    signedInAs({ twoFactorEnabled: false });

    renderPage();

    expect(await screen.findByTestId("two-factor-switch")).not.toBeChecked();
  });

  it("shows the switch for an ADMIN with 2FA off, with no 'required for your role' notice", async () => {
    // Admin used to be a mandatory role: the card showed a red tag and
    // "Required for your role", and there was no way to switch it off.
    signedInAs({ twoFactorEnabled: false });

    renderPage();

    await screen.findByTestId("two-factor-switch");
    expect(screen.queryByText(/required for your role/i)).not.toBeInTheDocument();
  });
});

describe("turning 2FA OFF", () => {
  it("does NOT call the API from the switch alone — it opens a confirmation first", async () => {
    signedInAs({ twoFactorEnabled: true });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));

    // Flipping a switch must never be sufficient to remove a security control.
    expect(twoFactorApi.disableTwoFactor).not.toHaveBeenCalled();
    expect(await screen.findByTestId("disable-password")).toBeInTheDocument();
  });

  it("warns that trusted devices will be signed out", async () => {
    signedInAs({ twoFactorEnabled: true });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));

    expect(await screen.findByText(/signs out every trusted device/i)).toBeInTheDocument();
  });

  it("refuses to submit without the password", async () => {
    signedInAs({ twoFactorEnabled: true });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));
    await userEvent.type(await screen.findByTestId("disable-token"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));

    await screen.findByText(/current password is required/i);
    expect(twoFactorApi.disableTwoFactor).not.toHaveBeenCalled();
  });

  it("refuses to submit without a code", async () => {
    signedInAs({ twoFactorEnabled: true });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));
    await userEvent.type(await screen.findByTestId("disable-password"), "Password123");
    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));

    await screen.findByText(/code is required/i);
    expect(twoFactorApi.disableTwoFactor).not.toHaveBeenCalled();
  });

  it("sends BOTH the password and the code when they are supplied", async () => {
    signedInAs({ twoFactorEnabled: true });
    twoFactorApi.disableTwoFactor.mockResolvedValue({ data: { data: null } });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));
    await userEvent.type(await screen.findByTestId("disable-password"), "Password123");
    await userEvent.type(screen.getByTestId("disable-token"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));

    await waitFor(() =>
      expect(twoFactorApi.disableTwoFactor).toHaveBeenCalledWith({
        password: "Password123",
        token: "123456",
      })
    );
  });

  it("surfaces the server's refusal instead of pretending it worked", async () => {
    signedInAs({ twoFactorEnabled: true });
    twoFactorApi.disableTwoFactor.mockRejectedValue({
      response: { data: { message: "Your password is incorrect" } },
    });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));
    await userEvent.type(await screen.findByTestId("disable-password"), "WrongPassword");
    await userEvent.type(screen.getByTestId("disable-token"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /turn off two-factor/i }));

    expect(await screen.findByTestId("disable-error")).toHaveTextContent(/password is incorrect/i);
    // Still open, so the user can correct it — and the switch has not lied
    // about the account's state.
    expect(screen.getByTestId("disable-password")).toBeInTheDocument();
  });
});

describe("turning 2FA ON", () => {
  it("opens enrolment rather than enabling anything directly", async () => {
    signedInAs({ twoFactorEnabled: false });
    twoFactorApi.startEnrolment.mockResolvedValue({
      data: { data: { secret: "SECRET123", otpauthUrl: "otpauth://totp/x" } },
    });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));

    expect(await screen.findByTestId("manual-key")).toHaveTextContent("SECRET123");
  });

  it("requires the 'I've saved these' confirmation before leaving the recovery codes", async () => {
    // Moved here from LoginPage.twoFactor.test.jsx, where it used to be
    // reached through the blocking mandatory-enrolment screen. The
    // confirmation itself is unchanged — these codes are the only way back in
    // if the authenticator is lost, and they cannot be retrieved afterwards.
    signedInAs({ twoFactorEnabled: false });
    twoFactorApi.startEnrolment.mockResolvedValue({
      data: { data: { secret: "SECRET123", otpauthUrl: "otpauth://totp/x" } },
    });
    twoFactorApi.confirmEnrolment.mockResolvedValue({
      data: { data: { recoveryCodes: ["AAAA1111", "BBBB2222"] } },
    });

    renderPage();
    await userEvent.click(await screen.findByTestId("two-factor-switch"));

    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify and enable/i }));

    await screen.findByTestId("recovery-codes-step");
    expect(screen.getByText("AAAA1111")).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(continueButton).toBeEnabled();
  });
});
