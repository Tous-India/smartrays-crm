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

  // BUG 1 regression (2026-08-04) — the shared app-elevated-card shadow
  // class was requested twice but never actually applied (confirmed via
  // `git log`: this file was only ever touched by its original
  // feature-build commit). Asserts on the real rendered className.
  it("applies the shared app-elevated-card shadow class", async () => {
    leaveApi.getLeaveBalance.mockResolvedValue({
      data: { data: { paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 } },
    });

    render(<LeaveBalanceCard />);

    await screen.findByText("/ 1 used");
    expect(document.querySelector(".ant-card")).toHaveClass("app-elevated-card");
  });
});
