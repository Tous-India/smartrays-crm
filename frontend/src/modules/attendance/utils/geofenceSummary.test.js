import { describe, it, expect } from "vitest";
import {
  GEOFENCE_STATE,
  formatDistance,
  geofenceChipLabel,
  summarizeGeofence,
} from "./geofenceSummary";

function localDate(hour, minute = 0) {
  return new Date(2026, 5, 1, hour, minute, 0, 0);
}

const COORDS = { lat: 19.076, lng: 72.877 };

const base = (overrides = {}) => ({
  _id: "att-1",
  date: localDate(0),
  checkIn: { time: localDate(9), coords: COORDS },
  checkOut: { time: localDate(18) },
  geofenceViolations: [],
  ...overrides,
});

describe("formatDistance — metres under 1 km, km above", () => {
  it.each([
    [0, "0 m"],
    [1, "1 m"],
    [250.4, "250 m"],
    [999, "999 m"],
    // 999.6 rounds to 1000 m, which should read as 1 km rather than "1000 m".
    [999.6, "1.0 km"],
    [1000, "1.0 km"],
    [1200, "1.2 km"],
    [1249, "1.2 km"],
    [1250, "1.3 km"],
    [12345, "12.3 km"],
  ])("formats %sm as %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });

  it("returns null for missing or nonsensical input rather than 'NaN m'", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
    expect(formatDistance(-5)).toBeNull();
  });
});

describe("summarizeGeofence — the four states", () => {
  it("reports WITHIN_RANGE for a finished shift with coords and no violations", () => {
    expect(summarizeGeofence(base()).state).toBe(GEOFENCE_STATE.WITHIN_RANGE);
  });

  it("reports IN_PROGRESS for an open shift", () => {
    expect(summarizeGeofence(base({ checkOut: { time: null } })).state).toBe(
      GEOFENCE_STATE.IN_PROGRESS
    );
  });

  it("reports VIOLATIONS with the count and the LARGEST distance", () => {
    const summary = summarizeGeofence(
      base({
        geofenceViolations: [
          { start: localDate(10), end: localDate(10, 30), maxDistanceMeters: 400 },
          { start: localDate(14), end: localDate(14, 20), maxDistanceMeters: 1200 },
          { start: localDate(16), end: localDate(16, 5), maxDistanceMeters: 90 },
        ],
      })
    );

    expect(summary.state).toBe(GEOFENCE_STATE.VIOLATIONS);
    expect(summary.count).toBe(3);
    // The largest, not the last and not the sum.
    expect(summary.maxDistanceMeters).toBe(1200);
  });

  /**
   * The state the rewrite exists for. The old bar rendered this identically
   * to a clean shift, so "we never heard where they were" looked like "they
   * were where they should be".
   */
  describe("NO_DATA — never conflated with WITHIN_RANGE", () => {
    it("reports NO_DATA when there is no check-in at all", () => {
      expect(summarizeGeofence(base({ checkIn: { time: null, coords: null } })).state).toBe(
        GEOFENCE_STATE.NO_DATA
      );
    });

    it("does NOT key off missing coordinates — those are stripped by permission", () => {
      // applyVisibilityRules nulls checkIn.coords for any viewer without
      // attendance.view_location, so treating that as "no data" would label
      // a perfectly tracked month "No data" for a manager lacking the grant.
      expect(summarizeGeofence(base({ checkIn: { time: localDate(9), coords: null } })).state).toBe(
        GEOFENCE_STATE.WITHIN_RANGE
      );
    });

    it("still reports violations when coords were stripped — geofenceViolations is not stripped", () => {
      const summary = summarizeGeofence(
        base({
          checkIn: { time: localDate(9), coords: null },
          geofenceViolations: [{ start: localDate(10), end: localDate(11), maxDistanceMeters: 400 }],
        })
      );

      expect(summary.state).toBe(GEOFENCE_STATE.VIOLATIONS);
      expect(summary.count).toBe(1);
    });

    it("is a DIFFERENT state from WITHIN_RANGE, not a variant of it", () => {
      const noData = summarizeGeofence(base({ checkIn: { time: null }, checkOut: { time: null } }));
      const clean = summarizeGeofence(base());

      expect(noData.state).not.toBe(clean.state);
      expect(geofenceChipLabel(noData)).not.toBe(geofenceChipLabel(clean));
    });
  });

  it("reports violations even on an open shift rather than hiding them behind In progress", () => {
    const summary = summarizeGeofence(
      base({
        checkOut: { time: null },
        geofenceViolations: [{ start: localDate(15), end: null, maxDistanceMeters: 800 }],
      })
    );

    expect(summary.state).toBe(GEOFENCE_STATE.VIOLATIONS);
    expect(summary.count).toBe(1);
  });

  it("ignores a malformed violation entry rather than counting it", () => {
    const summary = summarizeGeofence(
      base({ geofenceViolations: [null, { end: localDate(12) }] })
    );

    expect(summary.state).toBe(GEOFENCE_STATE.WITHIN_RANGE);
    expect(summary.count).toBe(0);
  });
});

describe("geofenceChipLabel", () => {
  it.each([
    [{ state: GEOFENCE_STATE.WITHIN_RANGE }, "Within range"],
    [{ state: GEOFENCE_STATE.IN_PROGRESS }, "In progress"],
    [{ state: GEOFENCE_STATE.NO_DATA }, "No data"],
  ])("labels %o as %s", (summary, expected) => {
    expect(geofenceChipLabel(summary)).toBe(expected);
  });

  it("counts and reports the max distance, singular and plural", () => {
    expect(
      geofenceChipLabel({ state: GEOFENCE_STATE.VIOLATIONS, count: 1, maxDistanceMeters: 840 })
    ).toBe("1 excursion · max 840 m");
    expect(
      geofenceChipLabel({ state: GEOFENCE_STATE.VIOLATIONS, count: 2, maxDistanceMeters: 1200 })
    ).toBe("2 excursions · max 1.2 km");
  });

  it("omits the distance rather than printing nothing sensible when it is missing", () => {
    expect(
      geofenceChipLabel({ state: GEOFENCE_STATE.VIOLATIONS, count: 2, maxDistanceMeters: null })
    ).toBe("2 excursions");
  });
});
