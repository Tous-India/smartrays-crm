/**
 * The one place the map tile source is set (2026-10-23) — every web map reads
 * this. OpenStreetMap's standard tiles: free, no key, no account. They replace
 * CARTO Voyager, which began drawing "API KEY REQUIRED" over every map.
 *
 * OpenStreetMap's tile usage policy asks for visible attribution (below) and
 * modest use — fine for an internal CRM. If usage grows or a styled map is
 * wanted, change it here only (e.g. a paid provider, or a self-hosted server).
 * https://operations.osmfoundation.org/policies/tiles/
 */
export const MAP_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};
