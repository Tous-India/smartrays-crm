import { describe, it, expect } from "vitest";
import employeeColor, { EMPLOYEE_COLOR_PALETTE } from "./employeeColor";

describe("employeeColor", () => {
  it("is deterministic — the same id always yields the same colour", () => {
    const id = "6a6c4c86aed1541553db4201";

    expect(employeeColor(id)).toBe(employeeColor(id));
  });

  it("does not depend on position in any list", () => {
    const a = "6a6c4c86aed1541553db4201";
    const b = "6a7195787ce48914129090d4";

    // Whatever order a caller happens to hold them in, each keeps its colour.
    expect([a, b].map(employeeColor)).toEqual([b, a].map(employeeColor).reverse());
  });

  it("separates ObjectIds that differ only in their last characters", () => {
    // Ids created in the same second share a long prefix; a character-sum hash
    // collides on exactly this case.
    const near = ["6a6c4c86aed1541553db4201", "6a6c4c86aed1541553db4202", "6a6c4c86aed1541553db4203"];
    const colors = near.map(employeeColor);

    expect(new Set(colors).size).toBe(near.length);
  });

  it("spreads across the WHOLE palette rather than favouring a few slots", () => {
    // The property that matters is that the hash uses every bucket. Perfect
    // uniqueness at N employees is not achievable from a hash alone — 24 ids
    // into 24 slots collides by the birthday problem regardless of the hash —
    // so this asserts distribution, not injectivity.
    const ids = Array.from({ length: 600 }, (_unused, index) => `emp-${index}-${index * 7717}`);
    const used = new Set(ids.map(employeeColor));

    expect(EMPLOYEE_COLOR_PALETTE.length).toBeGreaterThanOrEqual(24);
    expect(used.size).toBe(EMPLOYEE_COLOR_PALETTE.length);
  });

  it("is not a red/green scale — those hues carry other meanings in this app", () => {
    const isRedGreenOnly = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return b < 60 && (r > 150 || g > 150);
    };

    const redGreen = EMPLOYEE_COLOR_PALETTE.filter(isRedGreenOnly);

    // A few warm hues are fine; the palette must not be BUILT on them.
    expect(redGreen.length).toBeLessThan(EMPLOYEE_COLOR_PALETTE.length / 3);
  });

  it("never returns undefined for a missing id", () => {
    expect(employeeColor(null)).toBe(EMPLOYEE_COLOR_PALETTE[0]);
    expect(employeeColor(undefined)).toBe(EMPLOYEE_COLOR_PALETTE[0]);
  });
});
