import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import CustomerStatusToggleButton from "./CustomerStatusToggleButton";
import * as customerApi from "../api/customerApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
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

  it("renders icon-only (no visible label text) for both states, while keeping the same accessible name", () => {
    const { rerender } = render(<CustomerStatusToggleButton customer={ACTIVE_CUSTOMER} onChanged={vi.fn()} />);

    const deactivateButton = screen.getByRole("button", { name: "Deactivate" });
    expect(deactivateButton).not.toHaveTextContent("Deactivate");
    expect(deactivateButton.querySelector("svg")).toBeInTheDocument();

    rerender(<CustomerStatusToggleButton customer={INACTIVE_CUSTOMER} onChanged={vi.fn()} />);

    const activateButton = screen.getByRole("button", { name: "Activate" });
    expect(activateButton).not.toHaveTextContent("Activate");
    expect(activateButton.querySelector("svg")).toBeInTheDocument();
  });

  it("shows a hover tooltip with the action's text label for both states", async () => {
    const { rerender } = render(<CustomerStatusToggleButton customer={ACTIVE_CUSTOMER} onChanged={vi.fn()} />);

    await userEvent.hover(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findAllByText("Deactivate")).not.toHaveLength(0);
    await userEvent.unhover(screen.getByRole("button", { name: "Deactivate" }));

    rerender(<CustomerStatusToggleButton customer={INACTIVE_CUSTOMER} onChanged={vi.fn()} />);

    await userEvent.hover(screen.getByRole("button", { name: "Activate" }));
    expect(await screen.findAllByText("Activate")).not.toHaveLength(0);
  });

  it("renders a visible text label (not icon-only) when iconOnly is false, for both states", () => {
    const { rerender } = render(
      <CustomerStatusToggleButton customer={ACTIVE_CUSTOMER} onChanged={vi.fn()} iconOnly={false} />
    );

    expect(screen.getByRole("button", { name: "Deactivate" })).toHaveTextContent("Deactivate");

    rerender(
      <CustomerStatusToggleButton customer={INACTIVE_CUSTOMER} onChanged={vi.fn()} iconOnly={false} />
    );

    expect(screen.getByRole("button", { name: "Activate" })).toHaveTextContent("Activate");
  });

  it("still confirms the same consequence-naming Popconfirm and calls the same API when iconOnly is false", async () => {
    customerApi.updateCustomer.mockResolvedValue({ data: { data: INACTIVE_CUSTOMER } });
    const onChanged = vi.fn();
    render(
      <CustomerStatusToggleButton customer={ACTIVE_CUSTOMER} onChanged={onChanged} iconOnly={false} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText(/completes every active project for this customer/)).toBeInTheDocument();

    const confirmButtons = await screen.findAllByRole("button", { name: /Deactivate/ });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "inactive" });
    });
    expect(onChanged).toHaveBeenCalled();
  });
});
