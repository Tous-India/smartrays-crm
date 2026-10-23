import { describe, it, expect } from "vitest";
import { deriveAttendanceMapMarkers } from "./attendanceMapMarkers";
import { formatDateTime } from "../../../utils/date.utils";

/**
 * §7.66 — the shift's own endpoints on the Attendance location map.
 *
 * These are derived from the RECORD, not the pings, which is the whole point:
 * the case that used to render nothing at all is a record that has coordinates
 * but no trail.
 */
const IN = { lat: 28.6139, lng: 77.209 };
const OUT = { lat: 28.6262, lng: 77.2295 };

const BASE = {
  checkIn: { time: "2026-08-24T09:00:00.000Z", coords: IN },
  checkOut: { time: "2026-08-24T17:00:00.000Z", coords: OUT },
  connectivityGaps: [],
  geofenceViolations: [],
};

const endpoints = (markers) => markers.filter((m) => m.shape === "checkin" || m.shape === "checkout");

describe("shift endpoint markers", () => {
  it("marks check-in and check-out distinctly, even with NO pings at all", () => {
    const markers = deriveAttendanceMapMarkers(BASE)([]);
    const [start, end] = endpoints(markers);

    expect(markers).toHaveLength(2);
    expect(start).toMatchObject({ shape: "checkin", color: "green", label: "Check-in", lat: IN.lat, lng: IN.lng });
    expect(end).toMatchObject({ shape: "checkout", color: "purple", label: "Check-out", lat: OUT.lat, lng: OUT.lng });
    // Distinct from each other AND from every ping shape (pin/start/current/violation).
    expect(start.shape).not.toBe(end.shape);
  });

  it("carries the timestamp on each marker so the popup can show it", () => {
    const [start, end] = endpoints(deriveAttendanceMapMarkers(BASE)([]));

    expect(start.detail).toBe(formatDateTime(BASE.checkIn.time));
    expect(end.detail).toBe(formatDateTime(BASE.checkOut.time));
  });

  it("renders ONLY check-in when the shift is still open — it never invents an end point", () => {
    const openShift = { ...BASE, checkOut: { time: null, coords: null } };
    const markers = endpoints(deriveAttendanceMapMarkers(openShift)([]));

    expect(markers).toHaveLength(1);
    expect(markers[0].shape).toBe("checkin");
  });

  it("surfaces a geofence breach ON the endpoint it happened at", () => {
    const breached = {
      ...BASE,
      geofenceViolations: [
        { start: "2026-08-24T16:30:00.000Z", end: "2026-08-24T17:30:00.000Z", maxDistanceMeters: 1840 },
      ],
    };
    const [start, end] = endpoints(deriveAttendanceMapMarkers(breached)([]));

    // The violation window covers check-OUT only.
    expect(start.note).toBeUndefined();
    expect(end.note).toMatch(/Outside geofence.*1840m/);
  });

  it("still returns the ping-derived markers alongside the endpoints", () => {
    const withGap = {
      ...BASE,
      connectivityGaps: [{ start: "2026-08-24T11:00:00.000Z", end: "2026-08-24T12:00:00.000Z" }],
    };
    const pings = [
      { coords: { lat: 28.62, lng: 77.21 }, capturedAt: "2026-08-24T10:00:00.000Z" },
      { coords: { lat: 28.621, lng: 77.212 }, capturedAt: "2026-08-24T13:00:00.000Z" },
    ];
    const markers = deriveAttendanceMapMarkers(withGap)(pings);

    expect(endpoints(markers)).toHaveLength(2);
    expect(markers.filter((m) => m.color === "red")).toHaveLength(2);
  });
});
