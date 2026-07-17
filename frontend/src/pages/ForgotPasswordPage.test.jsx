import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { forgotPasswordRequest } from "../modules/auth/api";

vi.mock("../modules/auth/api", () => ({
  forgotPasswordRequest: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the request form", () => {
    renderPage();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("shows the same generic success message whether or not the request succeeds", async () => {
    forgotPasswordRequest.mockResolvedValue({ data: {} });

    renderPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@test.local");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByTestId("forgot-password-success")).toBeInTheDocument();
    expect(forgotPasswordRequest).toHaveBeenCalledWith({ email: "someone@test.local" });
  });

  it("shows the same generic message even when the request errors, never leaking account existence", async () => {
    forgotPasswordRequest.mockRejectedValue(new Error("network error"));

    renderPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@test.local");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByTestId("forgot-password-success")).toBeInTheDocument();
  });

  it("links back to the login page", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Back to login" })).toBeInTheDocument();
  });
});
