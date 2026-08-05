import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HeaderAttendanceControl from "./HeaderAttendanceControl";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as geolocation from "../modules/attendance/hooks/useGeolocation";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../modules/attendance/api/attendanceApi", () => ({
  getMyAttendance: vi.fn(),
  breakIn: vi.fn(),
  breakOut: vi.fn(),
  checkIn: vi.fn(),
  checkOut: vi.fn(),
}));

vi.mock("../modules/attendance/hooks/useGeolocation", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requestGeolocationOnce: vi.fn(async () => ({ lat: 1, lng: 2 })) };
});

// The camera/geolocation capture step is covered by CheckInOutWidget's own
// suite; stubbed here so these tests stay about the state machine.
vi.mock("../modules/attendance/components/AttendanceCaptureFlow", () => ({
  default: ({ isCheckedIn }) => <div data-testid="capture-flow">{isCheckedIn ? "checkout" : "checkin"}</div>,
}));

const CHECKED_IN = {
  _id: "att-1",
  checkIn: { time: "2026-08-05T04:00:00.000Z" },
  checkOut: { time: null },
  breakIn: { time: null },
  breakOut: { time: null },
};

const ON_BREAK = {
  ...CHECKED_IN,
  breakIn: { time: "2026-08-05T06:00:00.000Z" },
  breakOut: { time: null },
};

const BREAK_USED = {
  ...CHECKED_IN,
  breakIn: { time: "2026-08-05T06:00:00.000Z" },
  breakOut: { time: "2026-08-05T06:30:00.000Z" },
};

function mockRecords(records) {
  attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: records } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * §2 (2026-08-05) — the header control drives the whole shift. Each state
 * must render exactly the right controls, and the two backend rules
 * (no checkout while on break; one break per shift) must be mirrored as
 * DISABLED controls rather than buttons that would 403/409.
 */
describe("HeaderAttendanceControl — state machine", () => {
  it("NOT CHECKED IN: shows Play only, with no timer, Pause or Stop", async () => {
    mockRecords([]);

    render(<HeaderAttendanceControl />);

    expect(await screen.findByRole("button", { name: "Check in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check out" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("header-elapsed-timer")).not.toBeInTheDocument();
  });

  it("CHECKED IN: shows the timer plus Pause and an enabled Stop, and no Play", async () => {
    mockRecords([CHECKED_IN]);

    render(<HeaderAttendanceControl />);

    expect(await screen.findByTestId("header-elapsed-timer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check out" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
  });

  it("ON BREAK: shows Play (resume) and DISABLES Stop, because checkout is rejected during a break", async () => {
    mockRecords([ON_BREAK]);

    render(<HeaderAttendanceControl />);

    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check out" })).toBeDisabled();
    expect(screen.getByTestId("header-on-break-icon")).toBeInTheDocument();
    expect(screen.getByText("On break")).toBeInTheDocument();
  });

  it("BREAK ALREADY USED: Pause is disabled — one break per shift, mirrored from the backend", async () => {
    mockRecords([BREAK_USED]);

    render(<HeaderAttendanceControl />);

    expect(await screen.findByRole("button", { name: "Pause" })).toBeDisabled();
    // Stop stays available — the shift can still end.
    expect(screen.getByRole("button", { name: "Check out" })).toBeEnabled();
  });

  it("CHECKED OUT: a closed record returns the control to the Play state", async () => {
    mockRecords([{ ...CHECKED_IN, checkOut: { time: "2026-08-05T12:00:00.000Z" } }]);

    render(<HeaderAttendanceControl />);

    expect(await screen.findByRole("button", { name: "Check in" })).toBeInTheDocument();
    expect(screen.queryByTestId("header-elapsed-timer")).not.toBeInTheDocument();
  });
});

describe("HeaderAttendanceControl — actions reuse the existing flows", () => {
  it("Play opens the existing check-in capture modal — never a quiet photo-less check-in", async () => {
    mockRecords([]);

    render(<HeaderAttendanceControl />);
    await userEvent.click(await screen.findByRole("button", { name: "Check in" }));

    expect(await screen.findByTestId("capture-flow")).toHaveTextContent("checkin");
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });

  it("Stop opens the capture modal in check-OUT mode", async () => {
    mockRecords([CHECKED_IN]);

    render(<HeaderAttendanceControl />);
    await userEvent.click(await screen.findByRole("button", { name: "Check out" }));

    expect(await screen.findByTestId("capture-flow")).toHaveTextContent("checkout");
  });

  it("Pause submits break-in with geolocation and no camera step", async () => {
    mockRecords([CHECKED_IN]);
    attendanceApi.breakIn.mockResolvedValue({ data: {} });

    render(<HeaderAttendanceControl />);
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));

    await waitFor(() => expect(attendanceApi.breakIn).toHaveBeenCalledWith({ coords: { lat: 1, lng: 2 } }));
    expect(geolocation.requestGeolocationOnce).toHaveBeenCalled();
    expect(screen.queryByTestId("capture-flow")).not.toBeInTheDocument();
  });

  it("Play while on break submits break-out (resume), not a new check-in", async () => {
    mockRecords([ON_BREAK]);
    attendanceApi.breakOut.mockResolvedValue({ data: {} });

    render(<HeaderAttendanceControl />);
    await userEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() => expect(attendanceApi.breakOut).toHaveBeenCalledWith({ coords: { lat: 1, lng: 2 } }));
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });

  it("surfaces a failed break instead of failing silently", async () => {
    mockRecords([CHECKED_IN]);
    const { message } = await import("antd");
    attendanceApi.breakIn.mockRejectedValue({ response: { data: { message: "You're already on break." } } });

    render(<HeaderAttendanceControl />);
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));

    await waitFor(() => expect(message.error).toHaveBeenCalledWith("You're already on break."));
  });
});
