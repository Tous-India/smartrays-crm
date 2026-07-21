import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CustomersOverviewWidget from "./CustomersOverviewWidget";
import useSessionStore from "../../../store/sessionStore";
import * as customerApi from "../../customer/api/customerApi";

vi.mock("../../customer/api/customerApi", () => ({
  listCustomers: vi.fn(),
  listContracts: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <CustomersOverviewWidget />
    </MemoryRouter>
  );
}

describe("CustomersOverviewWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders active customer count and contract-type counts derived from mocked data", async () => {
    customerApi.listCustomers.mockResolvedValue({
      data: { data: [{ _id: "c1" }, { _id: "c2" }] },
    });
    customerApi.listContracts.mockImplementation((customerId) => {
      if (customerId === "c1") {
        return Promise.resolve({ data: { data: [{ type: "monthly" }] } });
      }
      return Promise.resolve({ data: { data: [{ type: "monthly" }, { type: "onetime" }] } });
    });

    renderWidget();

    expect(await screen.findByText("2")).toBeInTheDocument(); // active count
    expect(screen.getByText("Monthly: 2")).toBeInTheDocument();
    expect(screen.getByText("One-time: 1")).toBeInTheDocument();
    expect(screen.getByText("Yearly: 0")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the customer list fetch rejects", async () => {
    customerApi.listCustomers.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });
});
