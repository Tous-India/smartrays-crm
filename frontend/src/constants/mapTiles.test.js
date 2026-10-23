import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAP_TILES } from "./mapTiles.constants";

// 2026-10-23: the CARTO tiles showed "API KEY REQUIRED" over every map. All
// maps now use OpenStreetMap's standard tiles from ONE constant, so the source
// can be changed in one place.
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const SRC = path.join(process.cwd(), "src");

describe("map tiles", () => {
  it("are OpenStreetMap's standard tiles, credited to OpenStreetMap", () => {
    expect(MAP_TILES.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(MAP_TILES.attribution).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(MAP_TILES.attribution).toContain("OpenStreetMap");
  });

  it("no source file uses CARTO tiles or hard-codes a tile URL", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith("mapTiles.constants.js"))
      .filter((file) => /cartocdn|basemaps\.|\{z\}\/\{x\}\/\{y\}/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
