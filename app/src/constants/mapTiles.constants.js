/**
 * The one place the app's map tile source is set (2026-10-23), matching the
 * web's frontend/src/constants/mapTiles.constants.js: OpenStreetMap's
 * standard raster tiles, free and keyless, credited to OpenStreetMap as its
 * tile policy requires. Change the source here only.
 */
export const MAP_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  tileSize: 256,
};
