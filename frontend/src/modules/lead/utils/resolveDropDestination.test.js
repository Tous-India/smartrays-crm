import { describe, it, expect } from "vitest";
import { resolveDropDestination } from "./resolveDropDestination";

const leads = [
  { _id: "lead-1", status: "new" },
  { _id: "lead-2", status: "contacted" },
];

describe("resolveDropDestination", () => {
  it("resolves a drop directly onto a column id", () => {
    expect(resolveDropDestination(leads, "lead-1", "qualified")).toEqual({
      lead: leads[0],
      destinationStatus: "qualified",
    });
  });

  it("resolves a drop onto another card by looking up that card's column", () => {
    expect(resolveDropDestination(leads, "lead-1", "lead-2")).toEqual({
      lead: leads[0],
      destinationStatus: "contacted",
    });
  });

  it("returns null when dropped back on its own column", () => {
    expect(resolveDropDestination(leads, "lead-1", "new")).toBeNull();
  });

  it("returns null when there is no drop target", () => {
    expect(resolveDropDestination(leads, "lead-1", null)).toBeNull();
    expect(resolveDropDestination(leads, "lead-1", undefined)).toBeNull();
  });

  it("returns null when the dragged id doesn't match any lead", () => {
    expect(resolveDropDestination(leads, "missing-lead", "won")).toBeNull();
  });
});
