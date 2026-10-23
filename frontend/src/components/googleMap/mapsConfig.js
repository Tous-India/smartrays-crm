// Google Maps (2026-10-23, owner's decision): the official Maps JavaScript API
// through @vis.gl/react-google-maps. The browser key comes ONLY from the
// untracked env file (frontend/.env.local → VITE_GOOGLE_MAPS_API_KEY); without
// one every map shows "Map not configured" and the Maps script is never
// requested. Only the basic map is used — no Places, Directions, Geocoding or
// other paid extras.

export function googleMapsApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
}

export function mapsConfigured() {
  return Boolean(googleMapsApiKey());
}
