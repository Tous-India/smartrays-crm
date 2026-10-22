import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useCustomerDirectory from "./useCustomerDirectory";
import * as customerApi from "../../customer/api/customerApi";

vi.mock("../../customer/api/customerApi", () => ({ listCustomers: vi.fn() }));

// 2026-10-22: an employee opening /payments by address got a 403 here, which
// surfaced as an uncaught promise rejection and a loading state that never ended.
describe("useCustomerDirectory", () => {
  it("settles to an empty list, not an unhandled rejection, when the fetch is refused", async () => {
    const forbidden = Object.assign(new Error("Request failed with status code 403"), { response: { status: 403 } });
    customerApi.listCustomers.mockRejectedValue(forbidden);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const { result } = renderHook(() => useCustomerDirectory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(result.current.customers).toEqual([]);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
