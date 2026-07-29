import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeaveDeclineModal from "./LeaveDeclineModal";

describe("LeaveDeclineModal", () => {
  it("submits undefined when no reason is entered", async () => {
    const onSubmit = vi.fn();
    render(<LeaveDeclineModal open onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });

  it("submits the typed reason", async () => {
    const onSubmit = vi.fn();
    render(<LeaveDeclineModal open onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.type(screen.getByPlaceholderText("Reason (optional)"), "Insufficient coverage");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(onSubmit).toHaveBeenCalledWith("Insufficient coverage");
  });
});
