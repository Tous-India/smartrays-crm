import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TwoFactorChallenge from "./TwoFactorChallenge";

vi.mock("../twoFactorApi", () => ({
  verifyTwoFactor: vi.fn(() => Promise.resolve({ data: { data: {} } })),
}));

const { verifyTwoFactor } = await import("../twoFactorApi");

function renderChallenge(props = {}) {
  return render(
    <TwoFactorChallenge
      preAuthToken="pre-auth-token"
      onVerified={vi.fn()}
      onRestart={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * §7.40 — "Remember this device" skips the CODE, never the password. These
 * assert the two things that make it safe to offer at all: it is opt-in, and
 * the flag genuinely reaches the server rather than being a decorative
 * checkbox.
 */
describe("TwoFactorChallenge — remember this device", () => {
  it("is unchecked by default", () => {
    renderChallenge();

    expect(screen.getByRole("checkbox", { name: /remember this device/i })).not.toBeChecked();
  });

  it("sends rememberDevice=false when the box is left alone", async () => {
    renderChallenge();

    await userEvent.type(screen.getByLabelText(/verification or recovery code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalled());
    expect(verifyTwoFactor).toHaveBeenCalledWith("pre-auth-token", "123456", false);
  });

  it("sends rememberDevice=true once ticked", async () => {
    renderChallenge();

    await userEvent.type(screen.getByLabelText(/verification or recovery code/i), "123456");
    await userEvent.click(screen.getByRole("checkbox", { name: /remember this device/i }));
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalled());
    expect(verifyTwoFactor).toHaveBeenCalledWith("pre-auth-token", "123456", true);
  });

  it("says plainly that the password is still required", () => {
    renderChallenge();

    expect(screen.getByText(/still enter your password/i)).toBeInTheDocument();
  });

  it("hides the option entirely once the attempt is locked", async () => {
    verifyTwoFactor.mockRejectedValueOnce({ response: { status: 429, data: { message: "Too many" } } });
    renderChallenge();

    await userEvent.type(screen.getByLabelText(/verification or recovery code/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /start again/i })).toBeInTheDocument());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
