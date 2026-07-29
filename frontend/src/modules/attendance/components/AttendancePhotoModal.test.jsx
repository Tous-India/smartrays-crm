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

describe("AttendancePhotoModal", () => {
  it("renders nothing when there is no record", () => {
    const { container } = render(<AttendancePhotoModal open record={null} onCancel={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows check-in and check-out photos with their coords", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} />);

    expect(screen.getByAltText("Check-In photo")).toHaveAttribute("src", RECORD_WITH_PHOTOS.checkIn.photoUrl);
    expect(screen.getByAltText("Check-Out photo")).toHaveAttribute("src", RECORD_WITH_PHOTOS.checkOut.photoUrl);
    expect(screen.getAllByText(/Lat 12.97160, Lng 77.59460/)).toHaveLength(2);
  });

  it("gracefully shows a 'No photo' state for a manually-created record with no photos", () => {
    render(<AttendancePhotoModal open record={MANUAL_RECORD_NO_PHOTOS} onCancel={vi.fn()} />);

    expect(screen.getAllByText("No photo")).toHaveLength(2);
    expect(screen.getAllByText("No coordinates captured")).toHaveLength(2);
    expect(screen.getByText(/Manually adjusted by admin/)).toBeInTheDocument();
  });

  it("does not show the manually-adjusted tag for a real check-in", () => {
    render(<AttendancePhotoModal open record={RECORD_WITH_PHOTOS} onCancel={vi.fn()} />);

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
});
