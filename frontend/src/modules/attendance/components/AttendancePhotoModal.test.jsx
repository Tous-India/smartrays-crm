import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePhotoModal from "./AttendancePhotoModal";

const RECORD_WITH_PHOTOS = {
  _id: "att-1",
  date: "2026-06-03T00:00:00.000Z",
  status: "present",
  checkIn: {
    time: "2026-06-03T09:00:00.000Z",
    photoUrl: "https://fake.cloudinary.test/checkin.jpg",
    coords: { lat: 12.9716, lng: 77.5946 },
  },
  checkOut: {
    time: "2026-06-03T17:00:00.000Z",
    photoUrl: "https://fake.cloudinary.test/checkout.jpg",
    coords: { lat: 12.9716, lng: 77.5946 },
  },
  connectivityGaps: [],
};

const MANUAL_RECORD_NO_PHOTOS = {
  _id: "att-2",
  date: "2026-06-05T00:00:00.000Z",
  status: "absent",
  checkIn: { time: null },
  checkOut: { time: null },
  connectivityGaps: [],
  isManuallyAdjusted: true,
};

const RECORD_WITH_GEOFENCE_VIOLATION = {
  ...RECORD_WITH_PHOTOS,
  _id: "att-3",
  geofenceViolations: [
    { start: "2026-06-03T12:00:00.000Z", end: "2026-06-03T12:15:00.000Z", maxDistanceMeters: 950 },
  ],
};

describe("AttendancePhotoModal", () => {
  it("renders nothing when there is no record", () => {
    const { container } = render(<AttendancePhotoModal open record={null} onCancel={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows check-in and check-out photos with their coords when both showPhotos/showLocation are granted", () => {
    render(
      <AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} showPhotos showLocation />
    );

    expect(screen.getByAltText("Check-In photo")).toHaveAttribute("src", RECORD_WITH_PHOTOS.checkIn.photoUrl);
    expect(screen.getByAltText("Check-Out photo")).toHaveAttribute("src", RECORD_WITH_PHOTOS.checkOut.photoUrl);
    expect(screen.getAllByText(/Lat 12.97160, Lng 77.59460/)).toHaveLength(2);
  });

  it("gracefully shows a 'No photo' state for a manually-created record with no photos, when showPhotos is granted", () => {
    render(
      <AttendancePhotoModal open record={MANUAL_RECORD_NO_PHOTOS} onCancel={vi.fn()} showPhotos showLocation />
    );

    expect(screen.getAllByText("No photo")).toHaveLength(2);
    expect(screen.getAllByText("No coordinates captured")).toHaveLength(2);
    expect(screen.getByText(/Manually adjusted by admin/)).toBeInTheDocument();
  });

  it("does not show the manually-adjusted tag for a real check-in", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} showPhotos showLocation />);

    expect(screen.queryByText(/Manually adjusted by admin/)).not.toBeInTheDocument();
  });

  it("shows an Edit Record button and calls onEdit when provided (admin only)", async () => {
    const onEdit = vi.fn();
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: /Edit Record/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("hides the Edit Record button when onEdit is not provided (non-admin)", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Edit Record/ })).not.toBeInTheDocument();
  });

  it("shows a plain green Location bar with no violation when none occurred", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} showLocation />);

    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByTestId("geofence-violation-bar")).toHaveClass("bg-green-400");
    expect(screen.queryByTestId("geofence-violation-segment")).not.toBeInTheDocument();
  });

  it("shows the geofence violation info alongside connectivity gaps when a violation occurred", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_GEOFENCE_VIOLATION} onCancel={vi.fn()} showLocation />);

    const violationSegment = screen.getByTestId("geofence-violation-segment");
    expect(violationSegment).toHaveClass("bg-orange-500");
    expect(screen.getByText("Connectivity Gaps")).toBeInTheDocument();
  });

  describe("permission-gated photo/location visibility (§7.4c)", () => {
    it("omits the photo AND the Location section entirely when neither is granted (e.g. a manager with no grants at all)", () => {
      render(
        <AttendancePhotoModal
          open
          record={RECORD_WITH_PHOTOS}
          onCancel={vi.fn()}
          showPhotos={false}
          showLocation={false}
        />
      );

      expect(screen.queryByAltText("Check-In photo")).not.toBeInTheDocument();
      expect(screen.queryByAltText("Check-Out photo")).not.toBeInTheDocument();
      expect(screen.queryByText(/Lat 12.97160/)).not.toBeInTheDocument();
      expect(screen.queryByText("No photo")).not.toBeInTheDocument();
      expect(screen.queryByText("No coordinates captured")).not.toBeInTheDocument();
      expect(screen.queryByText("Location")).not.toBeInTheDocument();
      // Time is never gated — still visible either way.
      expect(screen.getByText(new Date(RECORD_WITH_PHOTOS.checkIn.time).toLocaleString())).toBeInTheDocument();
    });

    it("shows the photo but hides coords/Location when only showPhotos is granted", () => {
      render(
        <AttendancePhotoModal
          open
          record={RECORD_WITH_PHOTOS}
          onCancel={vi.fn()}
          showPhotos
          showLocation={false}
        />
      );

      expect(screen.getByAltText("Check-In photo")).toBeInTheDocument();
      expect(screen.queryByText(/Lat 12.97160/)).not.toBeInTheDocument();
      expect(screen.queryByText("Location")).not.toBeInTheDocument();
    });

    it("shows coords/Location but hides the photo when only showLocation is granted", () => {
      render(
        <AttendancePhotoModal
          open
          record={RECORD_WITH_PHOTOS}
          onCancel={vi.fn()}
          showPhotos={false}
          showLocation
        />
      );

      expect(screen.queryByAltText("Check-In photo")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Lat 12.97160, Lng 77.59460/)).toHaveLength(2);
      expect(screen.getByText("Location")).toBeInTheDocument();
    });
  });
});
