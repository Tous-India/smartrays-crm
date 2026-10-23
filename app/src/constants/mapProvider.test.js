import fs from "fs";
import path from "path";

/**
 * 2026-10-23: the app's maps are Google Maps (react-native-maps, Google
 * provider), keyed from the untracked env file. No tile URLs, no MapLibre,
 * and the key never written into a source file.
 */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

test("maps are Google only: no raster tile URLs, no MapLibre, no hard-coded key", () => {
  const src = path.join(__dirname, "..");
  const offenders = sourceFiles(src)
    .map((file) => [path.relative(src, file), fs.readFileSync(file, "utf8")])
    .filter(([, text]) => /cartocdn|tile\.openstreetmap|\{z\}\/\{x\}\/\{y\}|maplibre|AIza[0-9A-Za-z_-]{20,}/.test(text))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test("every map uses the Google provider", () => {
  const src = path.join(__dirname, "..");
  const maps = sourceFiles(src).filter((file) => /from "react-native-maps"/.test(fs.readFileSync(file, "utf8")));
  expect(maps.length).toBeGreaterThan(0);
  maps.forEach((file) => expect(fs.readFileSync(file, "utf8")).toMatch(/provider=\{PROVIDER_GOOGLE\}/));
});
