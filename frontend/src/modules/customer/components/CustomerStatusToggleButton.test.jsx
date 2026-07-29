import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import CustomerStatusToggleButton from "./CustomerStatusToggleButton";
import * as customerApi from "../api/customerApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/customerApi", () => ({
  updateCustomer: vi.fn(),
}));

const ACTIVE_CUSTOMER = { _id: "cust-1", customerStatus: "active" };
const INACTIVE_CUSTOMER = { _id: "cust-1", customerStatus: "inactive" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CustomerStatusToggleButton", () => {
  it("shows Deactivate with a consequence-naming confirm for an active customer", async () => {
    customerApi.updateCustomer.mockResolvedValue({ data: { data: INACTIVE_CUSTOMER } });
    const onChanged = vi.fn();
    render(<CustomerStatusToggleButton customer={ACTIVE_CUSTOMER} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("button", { name: /Deactivate/ }));

    expect(await screen.findByText(/completes every active project for this customer/)).toBeInTheDocument();
    expect(customerApi.updateCustomer).not.toHaveBeenCalled();

    const confirmButtons = await screen.findAllByRole("button", { name: /Deactivate/ });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "inactive" });
    });
    expect(onChanged).toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith("Customer deactivated");
  });

  it("shows Activate with no confirmation for an inactive customer", async () => {
    customerApi.updateCustomer.mockResolvedValue({ data: { data: ACTIVE_CUSTOMER } });
    const onChanged = vi.fn();
    render(<CustomerStatusToggleButton customer={INACTIVE_CUSTOMER} onChanged={onChanged} />);

    expect(screen.queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Activate/ }));

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "active" });
    });
    expect(onChanged).toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith("Customer activated");
  });
});
