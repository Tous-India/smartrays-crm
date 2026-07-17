import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PermissionGate from "./PermissionGate";
import useSessionStore from "../store/sessionStore";

describe("PermissionGate", () => {
  beforeEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it("hides its children when the user lacks the grant", () => {
    useSessionStore.setState({
      user: { role: "employee", permissions: { leads: { view: false } } },
    });

    render(
      <PermissionGate module="leads" action="view">
        <div>Leads Table</div>
      </PermissionGate>
    );

    expect(screen.queryByText("Leads Table")).not.toBeInTheDocument();
  });

  it("renders a fallback when provided and the grant is missing", () => {
    useSessionStore.setState({ user: { role: "employee", permissions: {} } });

    render(
      <PermissionGate module="leads" action="view" fallback={<div>No access</div>}>
        <div>Leads Table</div>
      </PermissionGate>
    );

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("Leads Table")).not.toBeInTheDocument();
  });

  it("shows its children when the user holds the grant", () => {
    useSessionStore.setState({
      user: { role: "sales_associate", permissions: { leads: { view: true } } },
    });

    render(
      <PermissionGate module="leads" action="view">
        <div>Leads Table</div>
      </PermissionGate>
    );

    expect(screen.getByText("Leads Table")).toBeInTheDocument();
  });

  it("always shows its children for an admin, regardless of the permissions object", () => {
    useSessionStore.setState({ user: { role: "admin", permissions: {} } });

    render(
      <PermissionGate module="leads" action="delete">
        <div>Delete Lead</div>
      </PermissionGate>
    );

    expect(screen.getByText("Delete Lead")).toBeInTheDocument();
  });
});
