import { detailLine, duration, todayKey } from "./live.utils";

describe("live.utils", () => {
  test("todayKey is the date in India: 20:00 UTC is already the next day there", () => {
    expect(todayKey(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24");
    expect(todayKey(new Date("2026-10-23T18:29:00Z"))).toBe("2026-10-23");
  });

  test("duration in plain words", () => {
    expect(duration(7)).toBe("7 min");
    expect(duration(135)).toBe("2 h 15 min");
  });

  test("the line under a name says what the status means right now", () => {
    const now = Date.parse("2026-10-23T10:00:00Z");
    expect(detailLine({ status: "moving", speedKmh: 22 }, now)).toBe("about 22 km/h");
    expect(detailLine({ status: "stationary", since: "2026-10-23T09:20:00Z" }, now)).toBe("at the same place for 40 min");
    expect(detailLine({ status: "at_site", place: "Sharma Residence" }, now)).toBe("Sharma Residence");
    expect(detailLine({ status: "disconnected", lastSyncAt: "2026-10-23T09:15:00Z" }, now)).toBe("last synced 45 min ago");
  });
});
