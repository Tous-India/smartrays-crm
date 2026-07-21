import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CustomersRecentWidget from "./CustomersRecentWidget";
import useSessionStore from "../../../store/sessionStore";
import * as customerApi from "../../customer/api/customerApi";

vi.mock("../../customer/api/customerApi", () => ({
  listCustomers: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <CustomersRecentWidget />
    </MemoryRouter>
  );
}

describe("CustomersRecentWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the most recently created customers from mocked (already server-sorted) data", async () => {
    customerApi.listCustomers.mockResolvedValue({
      data: { data: [{ _id: "c1", companyName: "Newest Co" }, { _id: "c2", companyName: "Older Co" }] },
    });

    renderWidget();

    expect(await screen.findByText("Newest Co")).toBeInTheDocument();
    expect(screen.getByText("Older Co")).toBeInTheDocument();
  });

  it("shows the empty state when there are no customers", async () => {
    customerApi.listCustomers.mockResolvedValue({ data: { data: [] } });

    renderWidget();

    expect(await screen.findByText("No customers yet")).toBeInTheDocument();
  });
});
