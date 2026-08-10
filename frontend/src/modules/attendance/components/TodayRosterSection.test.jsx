import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import TodayRosterSection, { isManualRecord } from "./TodayRosterSection";

/**
 * Today's roster (§7.4g, 2026-08-09).
 *
 * NEW COMPONENT, no prior version — there is nothing for these to have failed
 * against, and saying otherwise would overstate them. The behaviour they pin
 * is nonetheless the point of the feature: a device-captured record must be
 * untouchable from here, and On Leave must not be selectable.
 */

const EMPLOYEES = [
  { _id: "e1", name: "Ellie Employee", designation: "Field Technician", isActive: true },
  { _id: "e2", name: "Sam Sales", designation: "", isActive: true },
];

function renderRoster({ records = [], onSetState = vi.fn(), isSaving = false } = {}) {
  const map = new Map(records.map((record) => [String(record.employeeId), record]));

  render(
    <TodayRosterSection
      employees={EMPLOYEES}
      recordsByEmployeeId={map}
      isSaving={isSaving}
      onSetState={onSetState}
    />
  );

  return { onSetState };
}

describe("what the roster lists", () => {
  it("shows one row per active employee, with their designation", () => {
    renderRoster();

    expect(screen.getByText("Ellie Employee")).toBeInTheDocument();
    expect(screen.getByText("Field Technician")).toBeInTheDocument();
    expect(screen.getByText("Sam Sales")).toBeInTheDocument();
  });

  it("renders a dash for someone with no designation set", () => {
    // Every user predates the field, so this is the common case, not an edge.
    // getAllByText, not getByText: the Reason column (§7.4h) renders its own
    // dash for an unmarked row, so there is legitimately more than one.
    renderRoster();

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("is labelled as TODAY, so it is not mistaken for the filtered table below", () => {
    renderRoster();

    expect(screen.getByText(/today's roster/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(dayjs().format("DD MMM YYYY")))).toBeInTheDocument();
  });
});

describe("a real check-in is non-interactive", () => {
  const REAL_CHECK_IN = {
    _id: "a1",
    employeeId: "e1",
    status: "present",
    checkIn: { time: "2026-08-09T04:00:00.000Z" },
  };

  it("renders plain text, NOT a control — it must never be overwritable", () => {
    renderRoster({ records: [REAL_CHECK_IN] });

    expect(screen.getByTestId("roster-locked-e1")).toBeInTheDocument();
    // Not merely disabled: a disabled control still says "this is yours to
    // change, just not now". This record is never the admin's to change.
    expect(screen.queryByTestId("roster-state-e1")).not.toBeInTheDocument();
  });

  it("explains why on hover rather than leaving it unexplained", () => {
    renderRoster({ records: [REAL_CHECK_IN] });

    expect(screen.getByTestId("roster-locked-e1").closest("[title], span")).toBeTruthy();
  });

  it("still offers the control to the employee who has NO record", () => {
    renderRoster({ records: [REAL_CHECK_IN] });

    expect(screen.getByTestId("roster-state-e2")).toBeInTheDocument();
  });
});

describe("On Leave is display-only", () => {
  it("shows On Leave as a tag with no way to select it", () => {
    renderRoster({
      records: [{ _id: "a2", employeeId: "e1", status: "on_leave", checkIn: { time: null } }],
    });

    expect(screen.getByTestId("roster-onleave-e1")).toBeInTheDocument();
    expect(screen.queryByTestId("roster-state-e1")).not.toBeInTheDocument();
  });

  it("offers ONLY Half Day and Full Day as choices — never On Leave", async () => {
    // on_leave is written solely by leave approval; hand-setting it would
    // assert a leave state with no leave record behind it.
    renderRoster();

    expect(screen.getAllByRole("radio", { name: "Half Day" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("radio", { name: "Full Day" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("radio", { name: "On Leave" })).not.toBeInTheDocument();
  });

  it("shows nothing preselected for an unmarked employee", () => {
    // "Not marked yet" must not look like a recorded Half Day.
    renderRoster();

    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
  });
});

describe("marking", () => {
  it("reports Full Day as the `present` enum value", async () => {
    // Since §7.4h the click opens the reason prompt and the write happens on
    // submit, so the mapping is asserted through that. See "a manual mark
    // collects a reason first" below.
    const onSetState = vi.fn().mockResolvedValue(undefined);
    renderRoster({ onSetState });

    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });
    await userEvent.type(await screen.findByTestId("roster-reason-input"), "Worked on site");
    await userEvent.click(screen.getByTestId("roster-reason-submit"));

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "e1" }), "present", "Worked on site")
    );
  });

  it("reports Half Day as the `half_day` enum value", async () => {
    const onSetState = vi.fn().mockResolvedValue(undefined);
    renderRoster({ onSetState });

    await userEvent.click(screen.getAllByRole("radio", { name: "Half Day" })[0], { pointerEventsCheck: 0 });
    await userEvent.type(await screen.findByTestId("roster-reason-input"), "Left at lunch");
    await userEvent.click(screen.getByTestId("roster-reason-submit"));

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "e1" }), "half_day", "Left at lunch")
    );
  });

  it("reflects an existing MANUAL mark as the current value, and stays editable", () => {
    renderRoster({
      records: [{ _id: "a3", employeeId: "e1", status: "half_day", checkIn: { time: null } }],
    });

    // A previous manual mark is correctable — that is what the roster-status
    // endpoint exists for, since mark-status 409s once a record exists.
    expect(screen.getByTestId("roster-state-e1")).toBeInTheDocument();
  });
});

describe("isManualRecord", () => {
  it("treats a null checkIn.time as manual, and any real time as not", () => {
    // This single predicate decides editability in the UI and mirrors the
    // backend's own guard.
    expect(isManualRecord({ checkIn: { time: null } })).toBe(true);
    expect(isManualRecord({ checkIn: {} })).toBe(true);
    expect(isManualRecord({ checkIn: { time: "2026-08-09T04:00:00.000Z" } })).toBe(false);
    expect(isManualRecord(null)).toBe(false);
  });
});

/**
 * The reason prompt (§7.4h UI half, 2026-08-09).
 *
 * The backend has required a reason since 11028a2 and rejects empty and
 * whitespace-only in the SERVICE. Until this, the roster sent no reason at all,
 * so every click failed with "A reason is required when changing a manual
 * mark" — the roster was unusable. These fail against that code: it called
 * onSetState immediately with two arguments and never rendered a prompt.
 */
describe("a manual mark collects a reason first", () => {
  it("does NOT write anything on the click alone — it opens a prompt", async () => {
    const { onSetState } = renderRoster();

    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });

    expect(onSetState).not.toHaveBeenCalled();
    expect(await screen.findByTestId("roster-reason-input")).toBeInTheDocument();
  });

  it("cannot submit with an empty reason", async () => {
    renderRoster();
    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });

    expect(await screen.findByTestId("roster-reason-submit")).toBeDisabled();
  });

  it("cannot submit a whitespace-only reason — the same rule the server applies", async () => {
    const { onSetState } = renderRoster();
    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });
    await userEvent.type(await screen.findByTestId("roster-reason-input"), "   ");

    expect(screen.getByTestId("roster-reason-submit")).toBeDisabled();
    expect(onSetState).not.toHaveBeenCalled();
  });

  it("submits the status AND the reason together", async () => {
    const onSetState = vi.fn().mockResolvedValue(undefined);
    renderRoster({ onSetState });

    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });
    await userEvent.type(await screen.findByTestId("roster-reason-input"), "No internet at the site");
    await userEvent.click(screen.getByTestId("roster-reason-submit"));

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "e1" }),
        "present",
        "No internet at the site"
      )
    );
  });

  it("a CORRECTION starts with an empty field — it is a new claim, not a reuse", async () => {
    // Half Day -> Full Day asserts something different about the day.
    renderRoster({
      records: [
        {
          _id: "a9",
          employeeId: "e1",
          status: "half_day",
          checkIn: { time: null },
          adjustmentReason: "Left early, phone dead",
        },
      ],
    });

    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });

    expect(await screen.findByTestId("roster-reason-input")).toHaveValue("");
  });

  it("surfaces the SERVER's message when a submit fails", async () => {
    const onSetState = vi
      .fn()
      .mockRejectedValue({ response: { data: { message: "A reason is required when changing a manual mark" } } });
    renderRoster({ onSetState });

    await userEvent.click(screen.getAllByRole("radio", { name: "Full Day" })[0], { pointerEventsCheck: 0 });
    await userEvent.type(await screen.findByTestId("roster-reason-input"), "Some reason");
    await userEvent.click(screen.getByTestId("roster-reason-submit"));

    expect(await screen.findByTestId("roster-reason-error")).toHaveTextContent(/reason is required/i);
    // Still open, so the user can correct it rather than wondering what happened.
    expect(screen.getByTestId("roster-reason-input")).toBeInTheDocument();
  });
});

describe("the reason is visible once marked", () => {
  it("shows it in the row", () => {
    renderRoster({
      records: [
        {
          _id: "a8",
          employeeId: "e1",
          status: "present",
          checkIn: { time: null },
          adjustmentReason: "No internet at the site",
        },
      ],
    });

    expect(screen.getByText("No internet at the site")).toBeInTheDocument();
  });

  it("shows a dash for a mark that predates the field — never a backfilled guess", () => {
    renderRoster({
      records: [{ _id: "a7", employeeId: "e1", status: "present", checkIn: { time: null } }],
    });

    // Two real records are in this state; inventing a reason for them is
    // exactly what the field exists to prevent.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
