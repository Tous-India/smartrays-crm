import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CustomersPage from "./CustomersPage";
import useSessionStore from "../store/sessionStore";

vi.mock("../modules/customer/components/CustomersListPage", () => ({ default: () => <div data-testid="customers-list" /> }));

// 2026-10-22: the list (and its API calls) must not mount without customers.view.
describe("CustomersPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows Not authorized, and no list, to someone without customers.view", () => {
    useSessionStore.setState({ user: { _id: "e1", role: "employee", permissions: { services: { view: true } } } });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);

    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(screen.queryByTestId("customers-list")).not.toBeInTheDocument();
  });

  it("shows the list to someone with customers.view", () => {
    useSessionStore.setState({ user: { _id: "m1", role: "manager", permissions: { customers: { view: true } } } });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);

    expect(screen.getByTestId("customers-list")).toBeInTheDocument();
  });
});
