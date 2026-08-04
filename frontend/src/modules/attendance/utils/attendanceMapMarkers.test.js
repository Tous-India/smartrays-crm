import { describe, it, expect } from "vitest";
import { deriveAttendanceMapMarkers } from "./attendanceMapMarkers";

const PINGS = [
  { coords: { lat: 1, lng: 1 }, capturedAt: "2026-06-01T09:00:00.000Z" },
  { coords: { lat: 2, lng: 2 }, capturedAt: "2026-06-01T09:05:00.000Z" }, // last before gap
  // gap: 09:10 - 09:20, no pings in between
  { coords: { lat: 3, lng: 3 }, capturedAt: "2026-06-01T09:20:00.000Z" }, // first after gap
  { coords: { lat: 4, lng: 4 }, capturedAt: "2026-06-01T10:00:00.000Z" }, // during violation
  { coords: { lat: 5, lng: 5 }, capturedAt: "2026-06-01T10:05:00.000Z" }, // during violation
  { coords: { lat: 6, lng: 6 }, capturedAt: "2026-06-01T10:10:00.000Z" }, // after violation ends
];

describe("deriveAttendanceMapMarkers", () => {
  it("returns nothing for a record with no gaps and no violations", () => {
    const record = { connectivityGaps: [], geofenceViolations: [] };

    expect(deriveAttendanceMapMarkers(record)(PINGS)).toEqual([]);
  });

  it("returns nothing when there are no pings at all, regardless of gaps/violations", () => {
    const record = {
      connectivityGaps: [{ start: "2026-06-01T09:10:00.000Z", end: "2026-06-01T09:20:00.000Z" }],
      geofenceViolations: [],
    };

    expect(deriveAttendanceMapMarkers(record)([])).toEqual([]);
  });

  it("marks a connectivity gap's two boundaries — last known position before, first reconnect after — in red", () => {
    const record = {
      connectivityGaps: [{ start: "2026-06-01T09:10:00.000Z", end: "2026-06-01T09:20:00.000Z" }],
      geofenceViolations: [],
    };

    const markers = deriveAttendanceMapMarkers(record)(PINGS);

    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ lat: 2, lng: 2, color: "red" });
    expect(markers[0].label).toMatch(/gap started/i);
    expect(markers[1]).toMatchObject({ lat: 3, lng: 3, color: "red" });
    expect(markers[1].label).toMatch(/gap ended/i);
  });

  it("marks every ping captured during a geofence violation window in orange", () => {
    const record = {
      connectivityGaps: [],
      geofenceViolations: [{ start: "2026-06-01T09:59:00.000Z", end: "2026-06-01T10:06:00.000Z", maxDistanceMeters: 823 }],
    };

    const markers = deriveAttendanceMapMarkers(record)(PINGS);

    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ lat: 4, lng: 4, color: "orange" });
    expect(markers[0].label).toMatch(/outside geofence/i);
    expect(markers[0].label).toMatch(/823m/);
    expect(markers[1]).toMatchObject({ lat: 5, lng: 5, color: "orange" });
    // The ping at 10:10 is outside the violation window — never marked.
    expect(markers.some((marker) => marker.lat === 6)).toBe(false);
  });

  it("treats a still-open violation (end: null) as having no upper bound, rather than crashing", () => {
    const record = {
      connectivityGaps: [],
      geofenceViolations: [{ start: "2026-06-01T09:59:00.000Z", end: null, maxDistanceMeters: 900 }],
    };

    const markers = deriveAttendanceMapMarkers(record)(PINGS);

    // Every ping from the violation's start onward gets marked.
    expect(markers).toHaveLength(3);
    expect(markers.map((marker) => marker.lat)).toEqual([4, 5, 6]);
  });

  it("combines gap and violation markers together when a record has both", () => {
    const record = {
      connectivityGaps: [{ start: "2026-06-01T09:10:00.000Z", end: "2026-06-01T09:20:00.000Z" }],
      geofenceViolations: [{ start: "2026-06-01T09:59:00.000Z", end: "2026-06-01T10:06:00.000Z", maxDistanceMeters: 500 }],
    };

    const markers = deriveAttendanceMapMarkers(record)(PINGS);

    expect(markers.filter((marker) => marker.color === "red")).toHaveLength(2);
    expect(markers.filter((marker) => marker.color === "orange")).toHaveLength(2);
  });

  it("handles missing connectivityGaps/geofenceViolations arrays gracefully", () => {
    expect(deriveAttendanceMapMarkers({})(PINGS)).toEqual([]);
  });
});
