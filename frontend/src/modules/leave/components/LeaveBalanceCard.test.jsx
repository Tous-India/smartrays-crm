import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaveBalanceCard from "./LeaveBalanceCard";
import * as leaveApi from "../api/leaveApi";

vi.mock("../api/leaveApi", () => ({
  getLeaveBalance: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LeaveBalanceCard", () => {
  it("shows the used/limit/remaining numbers for the caller's own balance", async () => {
    leaveApi.getLeaveBalance.mockResolvedValue({
      data: { data: { paidLeaveUsed: 0.5, paidLeaveLimit: 1, paidLeaveRemaining: 0.5 } },
    });

    render(<LeaveBalanceCard />);

    expect(await screen.findByText("/ 1 used")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "0.5 remaining this month")).toBeInTheDocument();
    expect(leaveApi.getLeaveBalance).toHaveBeenCalledWith(undefined);
  });

  it("fetches a specific employee's balance when employeeId is passed", async () => {
    leaveApi.getLeaveBalance.mockResolvedValue({
      data: { data: { paidLeaveUsed: 1, paidLeaveLimit: 1, paidLeaveRemaining: 0 } },
    });

    render(<LeaveBalanceCard employeeId="emp-1" title="Employee's Balance" />);

    expect(await screen.findByText("Employee's Balance")).toBeInTheDocument();
    expect(leaveApi.getLeaveBalance).toHaveBeenCalledWith("emp-1");
  });
});
