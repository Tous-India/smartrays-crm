import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RootRedirect from "./RootRedirect";
import useSessionStore from "../store/sessionStore";

function renderRootRedirect() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/dashboard" element={<div>Dashboard Shell</div>} />
        <Route path="/portal" element={<div>Customer Portal</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RootRedirect", () => {
  beforeEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it("routes a customer to /portal", () => {
    useSessionStore.setState({ user: { role: "customer" } });

    renderRootRedirect();

    expect(screen.getByText("Customer Portal")).toBeInTheDocument();
  });

  it.each(["admin", "manager", "sales_associate", "employee"])(
    "routes a %s to the main dashboard shell",
    (role) => {
      useSessionStore.setState({ user: { role } });

      renderRootRedirect();

      expect(screen.getByText("Dashboard Shell")).toBeInTheDocument();
    }
  );
});
