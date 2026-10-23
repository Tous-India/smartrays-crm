import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// 2026-10-23: every map is Google Maps (the official Maps JavaScript API via
// @vis.gl/react-google-maps). No Leaflet, no raster tile URLs (never Google
// tiles in Leaflet either), and the key only from the env file.
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const SRC = path.join(process.cwd(), "src");

describe("maps", () => {
  it("no Leaflet, no tile URLs, no hard-coded Google key in any source file", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => [path.relative(SRC, file), fs.readFileSync(file, "utf8")])
      .filter(([, text]) => /from "(react-)?leaflet|cartocdn|tile\.openstreetmap|\{z\}\/\{x\}\/\{y\}|mt\d?\.google\.com\/vt|AIza[0-9A-Za-z_-]{20,}/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("the key is read only through mapsConfig (VITE_GOOGLE_MAPS_API_KEY)", () => {
    const readers = sourceFiles(SRC)
      .filter((file) => !file.includes(`${path.sep}test${path.sep}`))
      .filter((file) => /VITE_GOOGLE_MAPS_API_KEY/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file).split(path.sep).join("/"));
    expect(readers).toEqual(["components/googleMap/mapsConfig.js"]);
  });
});
