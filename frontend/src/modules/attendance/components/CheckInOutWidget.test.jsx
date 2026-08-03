import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckInOutWidget from "./CheckInOutWidget";
import * as attendanceApi from "../api/attendanceApi";
import * as locationApi from "../../location/api/locationApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/attendanceApi", () => ({
  getMyAttendance: vi.fn(),
  checkIn: vi.fn(),
  checkOut: vi.fn(),
  breakIn: vi.fn(),
  breakOut: vi.fn(),
  heartbeat: vi.fn(),
}));

// useCheckedInHeartbeatLoop reaches into the location module's API the
// moment `isCheckedIn` becomes true (to resolve the ping cadence via
// GET /location/config) — mocked here so these widget tests never fire a
// real, unmocked axios call just because a test happens to render in the
// checked-in state. The interval mechanics themselves (heartbeat/ping
// actually firing, resuming, cleaning up) are covered in
// useCheckedInHeartbeatLoop.test.js with fake timers, not here.
vi.mock("../../location/api/locationApi", () => ({
  submitLocationPing: vi.fn(),
  fetchLocationConfig: vi.fn(),
}));

/**
 * jsdom implements neither `HTMLCanvasElement#getContext` nor `#toDataURL`
 * (no real rendering engine) — `useCamera#capturePhoto` needs both to
 * produce a photo. Stubbed once here, same "mock the browser API at the
 * boundary" discipline as `getUserMedia`/`getCurrentPosition` below.
 */
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/jpeg;base64,FAKE_PHOTO_DATA");

const FAKE_STREAM = { getTracks: () => [{ stop: vi.fn() }] };

function mockGetUserMedia(implementation) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(implementation || (() => Promise.resolve(FAKE_STREAM))) },
  });
}

function mockGeolocation(implementation) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(
        implementation ||
          ((success) => success({ coords: { latitude: 12.34, longitude: 56.78 } }))
      ),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserMedia();
  mockGeolocation();
  attendanceApi.heartbeat.mockResolvedValue({ data: { data: {} } });
  locationApi.submitLocationPing.mockResolvedValue({ data: { data: {} } });
  locationApi.fetchLocationConfig.mockResolvedValue({ data: { data: { pingIntervalMinutes: 2 } } });
});

describe("CheckInOutWidget — not checked in", () => {
  beforeEach(() => {
    attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: [] } });
  });

  it("shows the Not Checked In state after fetching current status", async () => {
    render(<CheckInOutWidget />);

    expect(await screen.findByText("Not Checked In")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check In" })).toBeInTheDocument();
  });

  it("keeps Confirm Check In disabled until both a photo and location are captured", async () => {
    render(<CheckInOutWidget />);
    await screen.findByText("Not Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Check In" }));

    // Geolocation resolves synchronously in this mock, but the photo does
    // not exist until an explicit capture click — so Confirm must still be
    // disabled right after entering the capture flow.
    expect(await screen.findByRole("button", { name: /Confirm Check In/ })).toBeDisabled();

    await userEvent.click(await screen.findByRole("button", { name: /Capture Photo/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Confirm Check In/ })).toBeEnabled();
    });
  });

  it("submits check-in with the captured photo and coords once confirmed", async () => {
    attendanceApi.checkIn.mockResolvedValue({ data: { data: {} } });
    // Initial mount sees no records; the post-check-in refetch sees the new
    // open record — simulating the real backend rather than a static mock,
    // so this also proves the tracking indicator turns on once the UI
    // actually reflects "checked in," not just that the API call fired.
    attendanceApi.getMyAttendance
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({
        data: { data: [{ _id: "att-new", checkIn: { time: new Date().toISOString() }, checkOut: { time: null } }] },
      });
    render(<CheckInOutWidget />);
    await screen.findByText("Not Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Check In" }));
    await userEvent.click(await screen.findByRole("button", { name: /Capture Photo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirm Check In/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /Confirm Check In/ }));

    await waitFor(() => {
      expect(attendanceApi.checkIn).toHaveBeenCalledWith({
        coords: { lat: 12.34, lng: 56.78 },
        photo: "data:image/jpeg;base64,FAKE_PHOTO_DATA",
      });
    });

    expect(await screen.findByTestId("tracking-indicator")).toHaveTextContent("Tracking active");
  });

  it("shows a clear error and does not silently fail when location access is denied", async () => {
    mockGeolocation((_success, failure) =>
      failure({ code: 1, PERMISSION_DENIED: 1, message: "denied" })
    );
    render(<CheckInOutWidget />);
    await screen.findByText("Not Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Check In" }));

    expect(await screen.findByText(/Location access was denied/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Check In/ })).toBeDisabled();
  });
});

describe("CheckInOutWidget — already checked in (page loaded mid-shift)", () => {
  it("fetches current status and shows Checked In + elapsed time rather than assuming Not Checked In", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { time: new Date().toISOString() },
            checkOut: { time: null },
          },
        ],
      },
    });

    render(<CheckInOutWidget />);

    expect(await screen.findByText("Checked In")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Out" })).toBeInTheDocument();
    expect(screen.getByTestId("elapsed-time")).toHaveTextContent(/Elapsed: \d{2}:\d{2}:\d{2}/);
    // The tracking indicator (and, underneath it, the heartbeat/ping loop —
    // see useCheckedInHeartbeatLoop.test.js) must appear immediately here
    // too, not just after a fresh check-in — this is the resume-on-reload
    // case, driven by the same `isCheckedIn` boolean already true on mount.
    expect(screen.getByTestId("tracking-indicator")).toHaveTextContent("Tracking active");
  });

  it("submits check-out (not check-in) once confirmed", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [{ _id: "att-1", checkIn: { time: new Date().toISOString() }, checkOut: { time: null } }],
      },
    });
    attendanceApi.checkOut.mockResolvedValue({ data: { data: {} } });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Check Out" }));
    await userEvent.click(await screen.findByRole("button", { name: /Capture Photo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirm Check Out/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /Confirm Check Out/ }));

    await waitFor(() => {
      expect(attendanceApi.checkOut).toHaveBeenCalledWith({
        coords: { lat: 12.34, lng: 56.78 },
        photo: "data:image/jpeg;base64,FAKE_PHOTO_DATA",
      });
    });
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
});

describe("CheckInOutWidget — Break In/Out (§7.4c)", () => {
  it("shows a Break In button while checked in and not on break, with no camera/photo step", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: { data: [{ _id: "att-1", checkIn: { time: new Date().toISOString() }, checkOut: { time: null } }] },
    });
    attendanceApi.breakIn.mockResolvedValue({ data: { data: {} } });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    const breakInButton = screen.getByRole("button", { name: "Break In" });
    expect(breakInButton).toBeInTheDocument();
    // No camera preview/capture button appears for a break action.
    expect(screen.queryByRole("button", { name: /Capture Photo/ })).not.toBeInTheDocument();

    await userEvent.click(breakInButton);

    await waitFor(() => {
      expect(attendanceApi.breakIn).toHaveBeenCalledWith({ coords: { lat: 12.34, lng: 56.78 } });
    });
  });

  it("shows 'On Break since ...' and a Break Out button, and hides Break In, once on break", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { time: new Date().toISOString() },
            checkOut: { time: null },
            breakIn: { time: new Date().toISOString() },
            breakOut: { time: null },
          },
        ],
      },
    });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    expect(screen.getByTestId("on-break-tag")).toHaveTextContent("On Break since");
    expect(screen.getByRole("button", { name: "Break Out" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Break In" })).not.toBeInTheDocument();
  });

  it("disables the Check Out button while on break", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { time: new Date().toISOString() },
            checkOut: { time: null },
            breakIn: { time: new Date().toISOString() },
            breakOut: { time: null },
          },
        ],
      },
    });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    expect(screen.getByRole("button", { name: "Check Out" })).toBeDisabled();
  });

  it("hides both Break In and Break Out once the shift's one break has already been used", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { time: new Date().toISOString() },
            checkOut: { time: null },
            breakIn: { time: new Date().toISOString() },
            breakOut: { time: new Date().toISOString() },
          },
        ],
      },
    });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    expect(screen.queryByRole("button", { name: "Break In" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Break Out" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Out" })).toBeEnabled();
  });

  it("submits Break Out and refetches", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { time: new Date().toISOString() },
            checkOut: { time: null },
            breakIn: { time: new Date().toISOString() },
            breakOut: { time: null },
          },
        ],
      },
    });
    attendanceApi.breakOut.mockResolvedValue({ data: { data: {} } });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Break Out" }));

    await waitFor(() => {
      expect(attendanceApi.breakOut).toHaveBeenCalledWith({ coords: { lat: 12.34, lng: 56.78 } });
    });
    // getMyAttendance called once on mount, once again by the post-break-out refetch.
    expect(attendanceApi.getMyAttendance).toHaveBeenCalledTimes(2);
  });

  it("shows a clear error when location access is denied for a break action", async () => {
    mockGeolocation((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1, message: "denied" }));
    attendanceApi.getMyAttendance.mockResolvedValue({
      data: { data: [{ _id: "att-1", checkIn: { time: new Date().toISOString() }, checkOut: { time: null } }] },
    });

    render(<CheckInOutWidget />);
    await screen.findByText("Checked In");

    await userEvent.click(screen.getByRole("button", { name: "Break In" }));

    await waitFor(() => {
      expect(attendanceApi.breakIn).not.toHaveBeenCalled();
    });
  });

  it("does not show any break button when not checked in at all", async () => {
    attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: [] } });

    render(<CheckInOutWidget />);
    await screen.findByText("Not Checked In");

    expect(screen.queryByRole("button", { name: "Break In" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Break Out" })).not.toBeInTheDocument();
  });
});
