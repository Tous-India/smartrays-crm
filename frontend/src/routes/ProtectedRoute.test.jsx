import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import useSessionStore from "../store/sessionStore";

function renderWithGuard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it("shows a loading state while the initial session check is in flight", () => {
    useSessionStore.setState({ isLoading: true });

    renderWithGuard();

    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  it("redirects to /login when the user is not authenticated", () => {
    useSessionStore.setState({ isAuthenticated: false, isLoading: false });

    renderWithGuard();

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("renders the protected children when the user is authenticated", () => {
    useSessionStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { name: "Admin", role: "admin" },
    });

    renderWithGuard();

    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
  });
});
