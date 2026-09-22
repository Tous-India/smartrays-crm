import { buildRoster, groupServicesByAssignee, isStale, leaveCoveringToday, todaysRecordFor } from "./team.utils";

/** The roster is a reading of the server's answers; here is what each reading says. */
const NOW = new Date(2026, 8, 22, 12, 0, 0);
const iso = (h, m = 0) => new Date(2026, 8, 22, h, m).toISOString();
const person = (id, name) => ({ _id: id, name });

test("open shift with a fresh position → checked in; with a stale one, or none → silent", () => {
  const reports = [person("a", "Asha"), person("b", "Bala"), person("c", "Chitra")];
  const records = ["a", "b", "c"].map((id) => ({ _id: `r${id}`, employeeId: id, date: iso(0), checkIn: { time: iso(9) }, checkOut: {} }));
  const live = {
    entries: [
      { employeeId: "a", capturedAt: new Date(NOW.getTime() - 3 * 60000).toISOString(), coords: { lat: 1, lng: 2 } },
      { employeeId: "b", capturedAt: new Date(NOW.getTime() - 25 * 60000).toISOString(), coords: { lat: 1, lng: 2 } },
    ],
    unlocatable: [{ employeeId: "c", name: "Chitra", silentForMinutes: 180 }],
    openShiftCount: 3,
  };

  const roster = buildRoster({ reports, records, leaves: [], live, staleAfterMinutes: 10, now: NOW });

  expect(roster.map((row) => [row.person.name, row.status])).toEqual([
    ["Bala", "silent"],
    ["Chitra", "silent"],
    ["Asha", "checked_in"],
  ]);
  expect(roster[0].lastSeenAt).toBe(live.entries[1].capturedAt);
  expect(roster[1].lastSeenAt).toBeNull();
});

test("a closed shift → checked out; approved leave covering today → on leave; nothing → not checked in", () => {
  const reports = [person("d", "Dev"), person("e", "Esha"), person("f", "Farah")];
  const records = [{ _id: "rd", employeeId: "d", date: iso(0), checkIn: { time: iso(9) }, checkOut: { time: iso(17) } }];
  const leaves = [
    { employeeId: "e", status: "approved", startDate: new Date(2026, 8, 21).toISOString(), endDate: new Date(2026, 8, 23).toISOString() },
    { employeeId: "f", status: "pending", startDate: new Date(2026, 8, 22).toISOString(), endDate: new Date(2026, 8, 22).toISOString() },
  ];

  const roster = buildRoster({ reports, records, leaves, live: { entries: [], unlocatable: [], openShiftCount: 0 }, staleAfterMinutes: 10, now: NOW });

  expect(roster.map((row) => [row.person.name, row.status])).toEqual([
    ["Dev", "checked_out"],
    ["Esha", "on_leave"],
    ["Farah", "not_checked_in"],
  ]);
});

test("the stale rule is the server's threshold, not a constant", () => {
  const twelveMinutesAgo = new Date(NOW.getTime() - 12 * 60000).toISOString();

  expect(isStale(twelveMinutesAgo, 10, NOW)).toBe(true);
  expect(isStale(twelveMinutesAgo, 15, NOW)).toBe(false);
});

test("today's record is the latest of today's; yesterday's does not count", () => {
  const records = [
    { _id: "old", employeeId: "a", date: new Date(2026, 8, 21).toISOString(), checkIn: { time: new Date(2026, 8, 21, 9).toISOString() } },
    { _id: "first", employeeId: "a", date: iso(0), checkIn: { time: iso(8) } },
    { _id: "second", employeeId: "a", date: iso(0), checkIn: { time: iso(13) } },
  ];

  expect(todaysRecordFor(records, "a", NOW)._id).toBe("second");
  expect(todaysRecordFor(records, "zzz", NOW)).toBeNull();
  expect(leaveCoveringToday([], "a", NOW)).toBeNull();
});

test("open services group by assignee, groups by name, names from the directory", () => {
  const nameById = new Map([
    ["u2", "Zara"],
    ["u1", "Amit"],
  ]);
  const services = [
    { _id: "s1", assignedToId: "u2", title: "x" },
    { _id: "s2", assignedToId: "u1", title: "y" },
    { _id: "s3", assignedToId: "u2", title: "z" },
  ];

  const groups = groupServicesByAssignee(services, nameById);

  expect(groups.map((group) => [group.name, group.services.length])).toEqual([
    ["Amit", 1],
    ["Zara", 2],
  ]);
});
