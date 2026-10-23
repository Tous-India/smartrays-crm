import fs from "fs";
import path from "path";
import { MAP_TILES } from "./mapTiles.constants";

/** 2026-10-23: one tile source for the app, OpenStreetMap, never hard-coded in a screen. */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

test("the app's tiles are OpenStreetMap's, set in one constant", () => {
  expect(MAP_TILES.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  const src = path.join(__dirname, "..");
  const offenders = sourceFiles(src)
    .filter((file) => !file.endsWith("mapTiles.constants.js"))
    .filter((file) => /cartocdn|\{z\}\/\{x\}\/\{y\}/.test(fs.readFileSync(file, "utf8")));
  expect(offenders.map((file) => path.relative(src, file))).toEqual([]);
});
