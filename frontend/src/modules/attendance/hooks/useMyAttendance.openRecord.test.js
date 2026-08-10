import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * What counts as an OPEN SHIFT (2026-08-09).
 *
 * `useMyAttendance` derived it as "has no checkOut", which was fine while every
 * record an employee had came from their own device. §7.4g introduced records
 * with checkIn.time AND checkOut.time both null — manual roster marks and
 * leave-approval records — and those matched, so an employee who had merely
 * been MARKED present saw "Checked In / Tracking active" in the header and an
 * elapsed timer of NaN:NaN:NaN computed from a null check-in.
 *
 * The predicate is exercised directly: the hook itself needs a mounted
 * component and a network layer, and the bug was entirely in this one line.
 */

/** Mirrors `useMyAttendance.js`'s own derivation. */
function findOpenRecord(records) {
  return records.find((record) => record.checkIn?.time && !record.checkOut?.time) || null;
}

const REAL_OPEN = { _id: "r1", checkIn: { time: "2026-08-09T04:00:00.000Z" }, checkOut: { time: null } };
const REAL_CLOSED = {
  _id: "r2",
  checkIn: { time: "2026-08-08T04:00:00.000Z" },
  checkOut: { time: "2026-08-08T12:00:00.000Z" },
};
const MANUAL_MARK = { _id: "m1", status: "present", checkIn: { time: null }, checkOut: { time: null } };
const LEAVE_RECORD = { _id: "l1", status: "on_leave", checkIn: { time: null }, checkOut: { time: null } };

describe("an open shift requires a real check-in", () => {
  it("does NOT treat a manual mark as an open shift", () => {
    // The one that broke: present, no checkOut, but nobody ever checked in.
    expect(findOpenRecord([MANUAL_MARK])).toBeNull();
  });

  it("does NOT treat a leave-approval record as an open shift", () => {
    expect(findOpenRecord([LEAVE_RECORD])).toBeNull();
  });

  it("DOES still find a genuine open shift", () => {
    expect(findOpenRecord([REAL_OPEN])?._id).toBe("r1");
  });

  it("ignores a completed shift", () => {
    expect(findOpenRecord([REAL_CLOSED])).toBeNull();
  });

  it("finds the real open shift even when a manual mark is also present", () => {
    // Both can exist for one employee across a month, and the manual mark must
    // not shadow the genuine one.
    expect(findOpenRecord([MANUAL_MARK, REAL_OPEN])?._id).toBe("r1");
  });

  it("never yields a record whose checkIn.time would produce NaN elapsed", () => {
    const open = findOpenRecord([MANUAL_MARK, LEAVE_RECORD]);

    // Nothing to render a timer from, so the header must not claim a shift.
    expect(open).toBeNull();

    const stillFine = findOpenRecord([REAL_OPEN]);
    expect(Number.isNaN(new Date(stillFine.checkIn.time).getTime())).toBe(false);
  });
});

/**
 * The block above pins the RULE, but it re-declares the predicate, so on its
 * own it would keep passing even if the hook drifted back. This reads the hook
 * itself and fails if the check-in condition is ever dropped again — which is
 * exactly how the bug got in.
 */
describe("the hook itself still applies the rule", () => {
  it("derives openRecord from checkIn.time, not from the absence of a checkOut alone", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "./useMyAttendance.js"), "utf8");
    const line = source
      .split(/\r?\n/)
      .find((candidate) => candidate.includes("const openRecord"));

    expect(line).toBeTruthy();
    expect(line).toMatch(/checkIn\?\.time/);
    expect(line).toMatch(/checkOut\?\.time/);
  });
});
