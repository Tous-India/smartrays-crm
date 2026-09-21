import { findOpenRecord, findTodayRecord, formatAccuracy, formatElapsed, monthKey } from "./attendance.utils";

const NOW = new Date("2026-09-21T09:30:00");

test("monthKey is the YYYY-MM the endpoint takes", () => {
  expect(monthKey(NOW)).toBe("2026-09");
  expect(monthKey(new Date("2026-01-05T00:00:00"))).toBe("2026-01");
});

test("the open record needs a real check-in and no check-out — a manual mark is not a shift", () => {
  const manualMark = { date: "2026-09-21T00:00:00.000Z", checkIn: {}, checkOut: {} };
  const closed = { date: "2026-09-21T00:00:00.000Z", checkIn: { time: "2026-09-21T03:00:00Z" }, checkOut: { time: "2026-09-21T06:00:00Z" } };
  const open = { date: "2026-09-21T00:00:00.000Z", checkIn: { time: "2026-09-21T07:00:00Z" }, checkOut: {} };

  expect(findOpenRecord([manualMark])).toBeNull();
  expect(findOpenRecord([closed])).toBeNull();
  expect(findOpenRecord([manualMark, closed, open])).toBe(open);
});

test("today's record is the latest of today, and yesterday's is ignored", () => {
  const yesterday = { date: new Date("2026-09-20T00:00:00").toISOString(), checkIn: { time: "2026-09-20T03:00:00Z" }, checkOut: { time: "2026-09-20T06:00:00Z" } };
  const early = { date: new Date("2026-09-21T00:00:00").toISOString(), checkIn: { time: "2026-09-21T02:00:00Z" }, checkOut: { time: "2026-09-21T03:00:00Z" } };
  const late = { date: new Date("2026-09-21T00:00:00").toISOString(), checkIn: { time: "2026-09-21T04:00:00Z" }, checkOut: {} };

  expect(findTodayRecord([yesterday], NOW)).toBeNull();
  expect(findTodayRecord([yesterday, early, late], NOW)).toBe(late);
});

test("formatElapsed and formatAccuracy read as the card shows them", () => {
  expect(formatElapsed(new Date(NOW.getTime() - (2 * 60 + 5) * 60000).toISOString(), NOW)).toBe("2h 05m");
  expect(formatElapsed(new Date(NOW.getTime() + 60000).toISOString(), NOW)).toBe("0h 00m");
  expect(formatAccuracy(12.4)).toBe("±12 m");
  expect(formatAccuracy(undefined)).toBe("");
});
