import { useEffect, useMemo, useState } from "react";
import { APIProvider, InfoWindow, Map, Marker, Polyline, useMap, useMarkerRef } from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import MapNotConfigured from "./googleMap/MapNotConfigured";
import { googleMapsApiKey, mapsConfigured } from "./googleMap/mapsConfig";

// India centroid — a reasonable default center when there's nothing to plot
// yet (no live employees checked in, or no history for the selected day).
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

// The marker palette: red for connectivity issues, orange for geofence
// issues (§7.4d), the brand navy by default; a raw hex is used as given
// (employee colours, §7.67, are derived from an id and cannot be names).
const MARKER_COLORS = {
  red: "#e03131",
  orange: "#f08c00",
  blue: "#1971c2",
  green: "#2f9e44",
  yellow: "#f4c72f",
  purple: "#9c36b5",
  // Geofence family (§B6) — kept deliberately separate from the timeline's
  // green/amber/red so a violation never reads as a timeline band.
  sky: "#0284c7",
  // "This position is old" — grey, because a stale point must not look live.
  grey: "#6b7280",
  violet: "#7c3aed",
  default: "#163b78",
};

/**
 * The marker shapes (2026-08-09), so the Live Map reads at a glance rather
 * than by comparing hues — shape is the primary signal, colour reinforces it:
 *
 *   pin       — the teardrop, the default for everything ordinary
 *   start     — a hollow ring: where the shift BEGAN
 *   current   — a filled disc with a halo: where the person is NOW
 *   violation — a diamond: a geofence breach
 *   dot       — a ping: a breadcrumb, not a place someone chose to be
 *   checkin / checkout — the two shift endpoints (§7.66), flags pointing
 *               opposite ways so they differ in greyscale too
 *
 * Each is an inline SVG with its anchor point; `pinIcon` turns it into a
 * Google Maps icon.
 */
const SHAPES = {
  pin: (hex) => ({
    svg: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.75 13 23 13 23s13-13.25 13-23C26 5.8 20.2 0 13 0z" fill="${hex}"/><circle cx="13" cy="13" r="5.5" fill="#fff"/></svg>`,
    size: [26, 36],
    anchor: [13, 36],
  }),
  start: (hex) => ({
    svg: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" fill="#fff" stroke="${hex}" stroke-width="4"/></svg>`,
    size: [22, 22],
    anchor: [11, 11],
  }),
  current: (hex) => ({
    svg: `<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="13" fill="${hex}" fill-opacity="0.22"/><circle cx="15" cy="15" r="7" fill="${hex}" stroke="#fff" stroke-width="2.5"/></svg>`,
    size: [30, 30],
    anchor: [15, 15],
  }),
  violation: (hex) => ({
    svg: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><rect x="11" y="1" width="14" height="14" transform="rotate(45 11 1)" fill="${hex}" stroke="#fff" stroke-width="2"/></svg>`,
    size: [22, 22],
    anchor: [11, 11],
  }),
  dot: (hex) => ({
    svg: `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3.5" fill="${hex}" stroke="#fff" stroke-width="1.5"/></svg>`,
    size: [10, 10],
    anchor: [5, 5],
  }),
  checkin: (hex) => ({
    svg: `<svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg"><path d="M5 31V1" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M5 31V1" stroke="${hex}" stroke-width="2.5" stroke-linecap="round"/><path d="M6.5 3h15l-4 5 4 5h-15z" fill="${hex}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    size: [26, 32],
    anchor: [5, 31],
  }),
  checkout: (hex) => ({
    svg: `<svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg"><path d="M21 31V1" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M21 31V1" stroke="${hex}" stroke-width="2.5" stroke-linecap="round"/><path d="M19.5 3h-15l4 5-4 5h15z" fill="${hex}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    size: [26, 32],
    anchor: [21, 31],
  }),
};

function markerHex(color) {
  return typeof color === "string" && color.startsWith("#") ? color : MARKER_COLORS[color] || MARKER_COLORS.default;
}

/** The SVG (and its size/anchor) for a marker. */
function pinShape(color, shape = "pin") {
  return (SHAPES[shape] || SHAPES.pin)(markerHex(color));
}

/** A Google Maps icon for the shape; only called once the Maps API has loaded. */
function pinIcon(color, shape) {
  const { svg, size, anchor } = pinShape(color, shape);
  const maps = window.google?.maps;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    ...(maps ? { scaledSize: new maps.Size(size[0], size[1]), anchor: new maps.Point(anchor[0], anchor[1]) } : {}),
  };
}

/** Hands the coordinates to Google when someone wants to inspect the real place. */
function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Re-fits the view whenever the points change (Live's poll, History's
 * picker). One point gets street level (16) rather than rooftops; several
 * are framed with padding and never closer than 16 either.
 */
function FitBounds({ points }) {
  const map = useMap();
  const signature = JSON.stringify(points);

  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(16);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
    map.fitBounds(bounds, 30);
    const listener = window.google.maps.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 16) map.setZoom(16);
    });
    return () => listener.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

/** One marker; a click opens its card (label, detail, note, coordinates, Google Maps link). */
function MapMarker({ marker }) {
  const [markerRef, markerInstance] = useMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Marker
        ref={markerRef}
        position={{ lat: Number(marker.lat), lng: Number(marker.lng) }}
        icon={pinIcon(marker.color, marker.shape)}
        title={marker.label}
        onClick={() => setOpen(true)}
      />
      {open && (
        <InfoWindow anchor={markerInstance} onCloseClick={() => setOpen(false)}>
          <div className="text-xs">
            {marker.label && <div className="mb-1 font-medium">{marker.label}</div>}
            {marker.detail && <div className="mb-1 text-gray-600">{marker.detail}</div>}
            {marker.note && <div className="mb-1 font-medium text-amber-600">{marker.note}</div>}
            <div className="mb-1 text-gray-500">
              {Number(marker.lat).toFixed(5)}, {Number(marker.lng).toFixed(5)}
            </div>
            <a href={googleMapsUrl(marker.lat, marker.lng)} target="_blank" rel="noreferrer" data-testid="google-maps-link">
              View in Google Maps
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

/**
 * Marker clustering for the history map (§7.67): everyone × 45 days is
 * ~1,800 endpoints — too many for individual markers, and overlapping pins
 * hide each other. @googlemaps/markerclusterer (Google's own library) groups
 * them; a click opens `renderPopup(marker)` (an HTML string) and calls
 * `onMarkerClick`. Rebuilt when the set changes; removed on unmount.
 */
function ClusterLayer({ markers, renderPopup, onMarkerClick }) {
  const map = useMap();
  const signature = useMemo(() => markers.map((m) => `${m.key}:${m.lat}:${m.lng}`).join("|"), [markers]);

  useEffect(() => {
    if (!map || markers.length === 0) return undefined;
    const { maps } = window.google;
    const info = new maps.InfoWindow();
    const googleMarkers = markers.map((marker) => {
      const googleMarker = new maps.Marker({
        position: { lat: marker.lat, lng: marker.lng },
        icon: pinIcon(marker.color, marker.shape),
        title: marker.title || "",
      });
      googleMarker.addListener("click", () => {
        if (renderPopup) {
          info.setContent(renderPopup(marker));
          info.open({ map, anchor: googleMarker });
        }
        onMarkerClick?.(marker);
      });
      return googleMarker;
    });
    const clusterer = new MarkerClusterer({ map, markers: googleMarkers });

    return () => {
      info.close();
      clusterer.clearMarkers();
      clusterer.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

/**
 * Generic marker(s) + polyline map — Google Maps (2026-10-23; it replaced
 * react-leaflet + OpenStreetMap tiles, which had replaced an unconfigured
 * Google integration in 2026-08). Same props as before, so every caller is
 * unchanged:
 *
 * `markers`: [{ lat, lng, label, color?, shape?, detail?, note? }] — a click
 * opens the marker's card with a "View in Google Maps" link.
 * `path`: [{ lat, lng }] — one polyline (the history trail).
 * `paths`: [{ points: [{lat,lng}], color?, key? }] — several polylines (the
 * live map's trails).
 * `clusteredMarkers` + `renderClusterPopup` + `onClusterMarkerClick` — the
 * clustered history endpoints.
 *
 * No key in this build → "Map not configured", and the Maps script is never
 * loaded.
 */
function GoogleMapView({ markers = [], path = [], paths = [], height = 480, clusteredMarkers = null, renderClusterPopup, onClusterMarkerClick }) {
  if (!mapsConfigured()) {
    return <MapNotConfigured height={height} />;
  }

  const allPoints = [...markers, ...path, ...paths.flatMap((entry) => entry.points || []), ...(clusteredMarkers || [])];

  return (
    <div data-testid="google-map-container" style={{ height, width: "100%" }}>
      <APIProvider apiKey={googleMapsApiKey()}>
        <Map
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={5}
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          {markers.map((marker, index) => (
            <MapMarker key={`${marker.lat}-${marker.lng}-${index}`} marker={marker} />
          ))}
          {path.length > 0 && <Polyline path={path.map((point) => ({ lat: point.lat, lng: point.lng }))} strokeColor="#163b78" strokeWeight={3} />}
          {paths.map((entry, index) => (
            <Polyline
              key={entry.key || index}
              path={(entry.points || []).map((point) => ({ lat: point.lat, lng: point.lng }))}
              strokeColor={entry.color || "#163b78"}
              strokeWeight={3}
            />
          ))}
          {clusteredMarkers && clusteredMarkers.length > 0 && (
            <ClusterLayer markers={clusteredMarkers} renderPopup={renderClusterPopup} onMarkerClick={onClusterMarkerClick} />
          )}
          <FitBounds points={allPoints} />
        </Map>
      </APIProvider>
    </div>
  );
}

export default GoogleMapView;
