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
});
