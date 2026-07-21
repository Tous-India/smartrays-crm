import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PayrollStatusWidget from "./PayrollStatusWidget";
import useSessionStore from "../../../store/sessionStore";
import * as payrollApi from "../../payroll/api/payrollApi";

vi.mock("../../payroll/api/payrollApi", () => ({
  listPayroll: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <PayrollStatusWidget />
    </MemoryRouter>
  );
}

describe("PayrollStatusWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("shows 'Not yet' and no processed count when no payroll records exist for this month", async () => {
    payrollApi.listPayroll.mockResolvedValue({ data: { data: [] } });

    renderWidget();

    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.queryByText(/Employees processed/)).not.toBeInTheDocument();
  });

  it("shows 'Yes' and the processed count when payroll records exist for this month", async () => {
    payrollApi.listPayroll.mockResolvedValue({
      data: { data: [{ _id: "pr1" }, { _id: "pr2" }, { _id: "pr3" }] },
    });

    renderWidget();

    expect(await screen.findByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    payrollApi.listPayroll.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with no payroll.run grant", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(payrollApi.listPayroll).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
