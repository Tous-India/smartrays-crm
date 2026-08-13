import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./LoginPage";
import useSessionStore from "../store/sessionStore";
import { loginRequest } from "../modules/auth/api";

vi.mock("../modules/auth/api", () => ({
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it("renders the login form", () => {
    renderLoginPage();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("submits the form and redirects to / on success", async () => {
    loginRequest.mockResolvedValue({
      data: { data: { name: "Admin", role: "admin", permissions: {} } },
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "admin@test.local");
    await userEvent.type(screen.getByLabelText("Password"), "Password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(loginRequest).toHaveBeenCalledWith({
        email: "admin@test.local",
        password: "Password123",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Home Page")).toBeInTheDocument();
    });
  });

  it("shows an error message on a failed login", async () => {
    loginRequest.mockRejectedValue({
      response: { data: { message: "Invalid email or password" } },
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "admin@test.local");
    await userEvent.type(screen.getByLabelText("Password"), "WrongPassword");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Invalid email or password"
    );
    expect(screen.queryByText("Home Page")).not.toBeInTheDocument();
  });

  /**
   * §7.59 — the submit button used to vanish for the whole request.
   *
   * `<Form disabled={isSubmitting}>` propagates a GENUINE `disabled` to the
   * submit button, so AntD paints its disabled tokens; on AuthLayout's frosted
   * card those composite to the card's own luminance and the button disappears.
   * The `.auth-submit-button` hook in index.css restores contrast while a
   * submit is in flight.
   *
   * jsdom cannot check the colors — it applies neither index.css nor AntD's
   * CSS-in-JS, and it does not composite `backdrop-blur`. That verification was
   * done by sampling painted pixels in a real browser. What these two pin is
   * the pair of things a future edit could silently break: the hook the CSS
   * targets, and the disabled-while-submitting behaviour the fix must NOT
   * trade away to get contrast back.
   */
  describe("while a submit is in flight", () => {
    it("carries the `auth-submit-button` hook the contrast rule targets", () => {
      renderLoginPage();

      expect(screen.getByRole("button", { name: "Log in" })).toHaveClass("auth-submit-button");
    });

    it("stays disabled, so a second click cannot fire a second login", async () => {
      let release;
      loginRequest.mockReturnValue(new Promise((resolve) => { release = resolve; }));

      renderLoginPage();
      await userEvent.type(screen.getByLabelText("Email"), "admin@test.local");
      await userEvent.type(screen.getByLabelText("Password"), "Password123");
      await userEvent.click(screen.getByRole("button", { name: "Log in" }));

      const button = screen.getByRole("button", { name: /Log in/ });
      await waitFor(() => expect(button).toBeDisabled());

      await userEvent.click(button);
      expect(loginRequest).toHaveBeenCalledTimes(1);

      release({ data: { data: { name: "Admin", role: "admin", permissions: {} } } });
    });
  });
});
