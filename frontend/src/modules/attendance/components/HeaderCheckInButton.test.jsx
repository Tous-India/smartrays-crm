import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HeaderCheckInButton from "./HeaderCheckInButton";
import * as attendanceApi from "../api/attendanceApi";

vi.mock("../api/attendanceApi", () => ({
  getMyAttendance: vi.fn(),
  checkIn: vi.fn(),
  checkOut: vi.fn(),
}));

// The capture step is covered end-to-end by CheckInOutWidget.test.jsx (both
// render the same `AttendanceCaptureFlow`); here it's stubbed so these tests
// stay about the header control's own two states.
vi.mock("./AttendanceCaptureFlow", () => ({
  default: ({ isCheckedIn }) => <div data-testid="capture-flow">{isCheckedIn ? "checkout-flow" : "checkin-flow"}</div>,
}));

const OPEN_RECORD = {
  _id: "att-open",
  checkIn: { time: "2026-08-05T04:00:00.000Z" },
  checkOut: { time: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HeaderCheckInButton — not checked in", () => {
  beforeEach(() => {
    attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: [] } });
  });

  it("shows a compact Check In button, and no timer", async () => {
    render(<HeaderCheckInButton />);

    expect(await screen.findByRole("button", { name: /Check In/ })).toBeInTheDocument();
    expect(screen.queryByTestId("header-elapsed-timer")).not.toBeInTheDocument();
  });

  it("opens the check-in flow in a modal when clicked", async () => {
    render(<HeaderCheckInButton />);

    await userEvent.click(await screen.findByRole("button", { name: /Check In/ }));

    expect(await screen.findByTestId("capture-flow")).toHaveTextContent("checkin-flow");
  });
});

describe("HeaderCheckInButton — checked in", () => {
  beforeEach(() => {
    attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: [OPEN_RECORD] } });
  });

  it("replaces the button with a live elapsed-time badge", async () => {
    render(<HeaderCheckInButton />);

    expect(await screen.findByTestId("header-elapsed-timer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Check In$/ })).not.toBeInTheDocument();
  });

  it("the elapsed time ticks every second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    render(<HeaderCheckInButton />);
    await vi.waitFor(() => expect(screen.getByTestId("header-elapsed-timer")).toBeInTheDocument());

    const before = screen.getByTestId("header-elapsed-timer").textContent;
    await vi.advanceTimersByTimeAsync(2000);
    const after = screen.getByTestId("header-elapsed-timer").textContent;

    expect(after).not.toBe(before);
  });

  it("clicking the timer opens the check-OUT flow, not check-in", async () => {
    render(<HeaderCheckInButton />);

    await userEvent.click(await screen.findByTestId("header-elapsed-timer"));

    expect(await screen.findByTestId("capture-flow")).toHaveTextContent("checkout-flow");
  });
});
