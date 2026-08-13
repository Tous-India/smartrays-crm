import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ResetPasswordPage from "./ResetPasswordPage";
import { resetPasswordRequest } from "../modules/auth/api";

vi.mock("../modules/auth/api", () => ({
  resetPasswordRequest: vi.fn(),
}));

function renderPage(initialEntry = "/reset-password?token=abc123") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a missing-token message when no token is present in the URL", () => {
    renderPage("/reset-password");

    expect(screen.getByTestId("reset-password-missing-token")).toBeInTheDocument();
  });

  it("renders the reset form when a token is present", () => {
    renderPage();

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("submits the token and new password, and shows a success message", async () => {
    resetPasswordRequest.mockResolvedValue({ data: {} });

    renderPage();

    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByTestId("reset-password-success")).toBeInTheDocument();
    expect(resetPasswordRequest).toHaveBeenCalledWith({
      token: "abc123",
      newPassword: "NewPassword123",
    });
  });

  it("shows an error message when the token is invalid or expired", async () => {
    resetPasswordRequest.mockRejectedValue({
      response: { data: { message: "This password reset link is invalid or has expired" } },
    });

    renderPage();

    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByTestId("reset-password-error")).toHaveTextContent(
      "This password reset link is invalid or has expired"
    );
  });

  // §7.59 — same construction as Login: `<Form disabled={isSubmitting}>` makes
  // the submit button genuinely disabled, and AntD's disabled tokens vanish
  // into AuthLayout's frosted card. See LoginPage.test.jsx for why the colors
  // themselves are verified in a browser rather than here.
  describe("while a submit is in flight", () => {
    it("carries the `auth-submit-button` hook the contrast rule targets", () => {
      renderPage();

      expect(screen.getByRole("button", { name: "Reset password" })).toHaveClass(
        "auth-submit-button"
      );
    });

    it("stays disabled, so a second click cannot fire a second reset", async () => {
      let release;
      resetPasswordRequest.mockReturnValue(new Promise((resolve) => { release = resolve; }));

      renderPage();
      await userEvent.type(screen.getByLabelText("New password"), "NewPassword123");
      await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

      const button = screen.getByRole("button", { name: /Reset password/ });
      await waitFor(() => expect(button).toBeDisabled());

      await userEvent.click(button);
      expect(resetPasswordRequest).toHaveBeenCalledTimes(1);

      release({ data: {} });
    });
  });
});
