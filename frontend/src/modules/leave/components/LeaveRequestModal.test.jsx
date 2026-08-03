import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeaveRequestModal from "./LeaveRequestModal";

describe("LeaveRequestModal — half day", () => {
  it("shows the End Date field by default (not a half-day request)", () => {
    render(<LeaveRequestModal open onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />);

    expect(screen.getByLabelText("End Date")).toBeInTheDocument();
  });

  it("hides the End Date field once Half Day is checked", async () => {
    render(<LeaveRequestModal open onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Half Day" }));

    expect(screen.queryByLabelText("End Date")).not.toBeInTheDocument();
  });

  it("submits isHalfDay:true with endDate forced equal to startDate", async () => {
    const onSubmit = vi.fn();
    render(<LeaveRequestModal open onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Half Day" }));
    await userEvent.type(screen.getByLabelText("Start Date"), "2026-08-10");
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByLabelText("Reason"), "Doctor appointment");

    await userEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        isHalfDay: true,
      })
    );
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.startDate).toBe(payload.endDate);
  });

  it("submits isHalfDay:false when the checkbox is left unchecked", async () => {
    const onSubmit = vi.fn();
    render(<LeaveRequestModal open onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.type(screen.getByLabelText("Start Date"), "2026-08-10");
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByLabelText("End Date"), "2026-08-12");
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByLabelText("Reason"), "Family event");

    await userEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isHalfDay: false }));
  });

  it("blocks submission when Reason is left blank", async () => {
    const onSubmit = vi.fn();
    render(<LeaveRequestModal open onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.type(screen.getByLabelText("Start Date"), "2026-08-10");
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByLabelText("End Date"), "2026-08-12");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(await screen.findByText("A reason is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
