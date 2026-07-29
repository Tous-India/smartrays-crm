import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import AttendanceCorrectionModal from "./AttendanceCorrectionModal";

describe("AttendanceCorrectionModal", () => {
  it("always shows the unverified-record warning", () => {
    render(<AttendanceCorrectionModal open mode="create" onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText(/This creates an unverified, manually-adjusted record/)).toBeInTheDocument();
  });

  it("create mode shows a required Date field; edit mode does not", () => {
    const { rerender } = render(
      <AttendanceCorrectionModal open mode="create" onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />
    );
    expect(screen.getByText("Date")).toBeInTheDocument();

    rerender(
      <AttendanceCorrectionModal
        open
        mode="edit"
        record={{ status: "present", checkIn: { time: null }, checkOut: { time: null } }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );
    expect(screen.queryByText("Date")).not.toBeInTheDocument();
  });

  it("pre-fills status/times from the given record in edit mode", () => {
    render(
      <AttendanceCorrectionModal
        open
        mode="edit"
        record={{
          status: "half_day",
          checkIn: { time: "2026-06-03T09:00:00.000Z" },
          checkOut: { time: "2026-06-03T13:00:00.000Z" },
        }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.getByText("Half Day")).toBeInTheDocument();
  });

  it("submits status/checkIn/checkOut on save", async () => {
    const onSubmit = vi.fn();
    render(
      <AttendanceCorrectionModal
        open
        mode="edit"
        record={{ status: "present", checkIn: { time: null }, checkOut: { time: null } }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "present",
        checkIn: { time: null },
        checkOut: { time: null },
      })
    );
  });

  it("pre-fills the Date field from initialDate in create mode", async () => {
    render(
      <AttendanceCorrectionModal
        open
        mode="create"
        initialDate={dayjs("2026-06-10")}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.getByDisplayValue("2026-06-10")).toBeInTheDocument();
  });
});
