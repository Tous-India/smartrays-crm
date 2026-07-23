import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useLeadStatusChangeFlow from "./useLeadStatusChangeFlow";
import { changeLeadStatus, convertLeadToCustomer } from "../api/leadApi";
import { createContract } from "../../customer/api/customerApi";

vi.mock("../api/leadApi", () => ({
  changeLeadStatus: vi.fn(),
  convertLeadToCustomer: vi.fn(),
}));

vi.mock("../../customer/api/customerApi", () => ({
  createContract: vi.fn(),
}));

const lead = { _id: "lead-1", name: "Acme Co" };

describe("useLeadStatusChangeFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("changes status immediately for a plain transition, no modal involved", async () => {
    changeLeadStatus.mockResolvedValue({});
    const onChanged = vi.fn();
    const { result } = renderHook(() => useLeadStatusChangeFlow({ onChanged }));

    await act(async () => {
      result.current.requestStatusChange(lead, "contacted");
    });

    expect(changeLeadStatus).toHaveBeenCalledWith("lead-1", { status: "contacted" });
    expect(result.current.lostTarget).toBeNull();
    expect(result.current.wonTarget).toBeNull();
  });

  it("requires a lost reason before calling the status-change endpoint", async () => {
    changeLeadStatus.mockResolvedValue({});
    const onChanged = vi.fn();
    const { result } = renderHook(() => useLeadStatusChangeFlow({ onChanged }));

    act(() => {
      result.current.requestStatusChange(lead, "lost");
    });

    // The API must NOT be called yet — a reason hasn't been collected.
    expect(changeLeadStatus).not.toHaveBeenCalled();
    expect(result.current.lostTarget).toEqual(lead);

    await act(async () => {
      await result.current.confirmLost("Budget too small");
    });

    expect(changeLeadStatus).toHaveBeenCalledWith("lead-1", {
      status: "lost",
      lostReason: "Budget too small",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("cancelling the lost modal never calls the status-change endpoint", () => {
    const { result } = renderHook(() => useLeadStatusChangeFlow({ onChanged: vi.fn() }));

    act(() => {
      result.current.requestStatusChange(lead, "lost");
    });
    act(() => {
      result.current.cancelLost();
    });

    expect(changeLeadStatus).not.toHaveBeenCalled();
    expect(result.current.lostTarget).toBeNull();
  });

  it("moving to won opens the convert flow instead of changing status directly", async () => {
    convertLeadToCustomer.mockResolvedValue({ data: { data: { _id: "customer-1" } } });
    createContract.mockResolvedValue({});
    changeLeadStatus.mockResolvedValue({});
    const onChanged = vi.fn();
    const { result } = renderHook(() => useLeadStatusChangeFlow({ onChanged }));

    act(() => {
      result.current.requestStatusChange(lead, "won");
    });

    expect(changeLeadStatus).not.toHaveBeenCalled();
    expect(result.current.wonTarget).toEqual(lead);

    let returnedCustomer;
    await act(async () => {
      returnedCustomer = await result.current.confirmWon({ projectManagerId: "pm-1", contractAmount: 250000 });
    });

    expect(convertLeadToCustomer).toHaveBeenCalledWith("lead-1", { projectManagerId: "pm-1" });
    expect(createContract).toHaveBeenCalledWith("customer-1", { type: "onetime", amount: 250000 });
    expect(changeLeadStatus).toHaveBeenCalledWith("lead-1", { status: "won" });
    expect(returnedCustomer).toEqual({ _id: "customer-1" });
    expect(onChanged).toHaveBeenCalled();
  });
});
