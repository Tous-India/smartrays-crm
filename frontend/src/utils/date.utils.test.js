import { describe, it, expect, afterEach, vi } from "vitest";
import dayjs from "dayjs";
import {
  toLocalDateKey,
  resolveDateRange,
  monthKeysInRange,
  isWithinRange,
  DATE_RANGE_PRESETS,
} from "./date.utils";

afterEach(() => {
  vi.useRealTimers();
});

describe("toLocalDateKey", () => {
  it("keeps the LOCAL calendar day — the whole reason this helper exists", () => {
    // Local midnight. `toISOString()` on this yields the previous day at
    // any UTC+ offset; the helper must not.
    const localMidnight = new Date(2026, 7, 5, 0, 0, 0);

    expect(toLocalDateKey(localMidnight)).toBe("2026-08-05");
  });

  it("returns a bare YYYY-MM-DD with no time component", () => {
    expect(toLocalDateKey(new Date(2026, 0, 31, 23, 59))).toBe("2026-01-31");
    expect(toLocalDateKey(new Date(2026, 0, 31))).not.toContain("T");
  });

  it("returns null for an empty value rather than a bogus date", () => {
    expect(toLocalDateKey(null)).toBeNull();
    expect(toLocalDateKey(undefined)).toBeNull();
  });
});

describe("resolveDateRange", () => {
  it("Today spans that single local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 14, 0, 0));

    const { from, to } = resolveDateRange(DATE_RANGE_PRESETS.today);

    expect(toLocalDateKey(from)).toBe("2026-08-05");
    expect(toLocalDateKey(to)).toBe("2026-08-05");
  });

  it("Yesterday spans the previous local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 14, 0, 0));

    const { from, to } = resolveDateRange(DATE_RANGE_PRESETS.yesterday);

    expect(toLocalDateKey(from)).toBe("2026-08-04");
    expect(toLocalDateKey(to)).toBe("2026-08-04");
  });

  it("This Month spans the whole calendar month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));

    const { from, to } = resolveDateRange(DATE_RANGE_PRESETS.thisMonth);

    expect(toLocalDateKey(from)).toBe("2026-08-01");
    expect(toLocalDateKey(to)).toBe("2026-08-31");
  });

  it("Custom returns null until both ends are chosen, so callers can skip fetching", () => {
    expect(resolveDateRange(DATE_RANGE_PRESETS.custom, null)).toBeNull();
    expect(resolveDateRange(DATE_RANGE_PRESETS.custom, [dayjs("2026-08-01"), null])).toBeNull();
  });

  it("Custom uses the chosen range once complete", () => {
    const range = [dayjs("2026-03-10"), dayjs("2026-04-02")];

    const { from, to } = resolveDateRange(DATE_RANGE_PRESETS.custom, range);

    expect(toLocalDateKey(from)).toBe("2026-03-10");
    expect(toLocalDateKey(to)).toBe("2026-04-02");
  });
});

describe("monthKeysInRange", () => {
  it("returns a single month for a same-month range", () => {
    expect(monthKeysInRange(dayjs("2026-08-01"), dayjs("2026-08-31"))).toEqual(["2026-08"]);
  });

  it("returns every month a straddling range touches", () => {
    expect(monthKeysInRange(dayjs("2026-03-28"), dayjs("2026-05-02"))).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });
});

describe("isWithinRange", () => {
  const from = dayjs("2026-08-05").startOf("day");
  const to = dayjs("2026-08-05").endOf("day");

  it("includes both ends of the day", () => {
    expect(isWithinRange("2026-08-05T00:00:00", from, to)).toBe(true);
    expect(isWithinRange("2026-08-05T23:59:00", from, to)).toBe(true);
  });

  it("excludes neighbouring days", () => {
    expect(isWithinRange("2026-08-04T23:59:00", from, to)).toBe(false);
    expect(isWithinRange("2026-08-06T00:01:00", from, to)).toBe(false);
  });
});
