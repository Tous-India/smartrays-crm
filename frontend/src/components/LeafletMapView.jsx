import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// India centroid — a reasonable default center when there's nothing to plot
// yet (no live employees checked in, or no history for the selected day).
const DEFAULT_CENTER = [20.5937, 78.9629];

// Same semantic colors this app already used for Google Maps' classic
// colored-pin icons (§7.4d) — red for connectivity issues, orange for
// geofence issues — now rendered as inline SVG `L.divIcon`s instead of
// depending on an external icon asset URL. `default` matches the brand navy
// (`#163b78`) already used for the history-trail polyline stroke.
const MARKER_COLORS = {
  red: "#e03131",
  orange: "#f08c00",
  blue: "#1971c2",
  green: "#2f9e44",
  yellow: "#f4c72f",
  purple: "#9c36b5",
  default: "#163b78",
};

const iconCache = new Map();

/**
 * A small teardrop-pin SVG rendered via `L.divIcon` — deliberately not
 * Leaflet's default `L.Icon` (whose bundled marker images famously don't
 * resolve correctly under Vite/webpack without extra config, §11.6's own
 * migration note). An inline SVG string needs no image asset at all, so
 * every marker (colored or default) goes through this same path — no
 * separate "default icon" workaround needed.
 */
function buildPinIcon(color) {
  const hex = MARKER_COLORS[color] || MARKER_COLORS.default;

  if (!iconCache.has(hex)) {
    iconCache.set(
      hex,
      L.divIcon({
        className: "smartrays-leaflet-pin",
        html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 0C5.8 0 0 5.8 0 13c0 9.75 13 23 13 23s13-13.25 13-23C26 5.8 20.2 0 13 0z" fill="${hex}"/>
          <circle cx="13" cy="13" r="5.5" fill="#fff"/>
        </svg>`,
        iconSize: [26, 36],
        iconAnchor: [13, 36],
      })
    );
  }

  return iconCache.get(hex);
}

/**
 * Re-fits the map's viewport to the given points whenever they change —
 * `MapContainer`'s own `bounds` prop only applies on initial mount, so this
 * imperative-via-`useMap()` child is the standard react-leaflet pattern for
 * keeping the view in sync with data that changes after mount (e.g. Live's
 * ~12s poll, or History's employee/date picker changing).
 */
function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    map.fitBounds(
      L.latLngBounds(points.map((point) => [point.lat, point.lng])),
      { padding: [30, 30] }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(points)]);

  return null;
}

/**
 * Generic marker(s) + optional polyline map, built on `react-leaflet` +
 * OpenStreetMap tiles (§11.6, 2026-08-04 — replaces the earlier Google Maps
 * JS SDK integration, which was never actually functional in production
 * since no billing/API key was ever configured; Leaflet + OSM tiles need
 * neither). Deliberately basic per this module's own stated scope: no
 * clustering, no custom controls — just plot what's given and fit the
 * bounds, matching the old `GoogleMapView`'s scope exactly.
 *
 * `markers`: [{ lat, lng, label, color? }] — rendered as pin markers, with
 * `label` shown as a native hover tooltip (matching the old Google Maps
 * `title` behavior) rather than a click-to-open popup.
 * `path`: [{ lat, lng }] — rendered as one polyline, for the history trail
 * view.
 */
function LeafletMapView({ markers = [], path = [], height = 480 }) {
  const allPoints = [...markers, ...path];

  return (
    <div data-testid="leaflet-map-container" style={{ height, width: "100%" }}>
      <MapContainer center={DEFAULT_CENTER} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((marker, index) => (
          <Marker
            key={`${marker.lat}-${marker.lng}-${index}`}
            position={[marker.lat, marker.lng]}
            icon={buildPinIcon(marker.color)}
            title={marker.label}
          />
        ))}
        {path.length > 0 && (
          <Polyline positions={path.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#163b78", weight: 3 }} />
        )}
        <FitBounds points={allPoints} />
      </MapContainer>
    </div>
  );
}

export default LeafletMapView;
