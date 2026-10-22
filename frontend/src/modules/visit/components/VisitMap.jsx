import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * A site visit on the map (2026-10-22): the site and its geofence circle,
 * that day's actual route (location pings), and where Arrived, Done and each
 * photo happened. With `onPick`, a click places the site instead (assigning a
 * visit). Free OpenStreetMap tiles, the same provider as the Live Map (§11.11).
 */
const COLORS = { site: "#163b78", route: "#64748b", arrived: "#1971c2", done: "#2f9e44", photo: "#9c36b5" };

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 16);
    else if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 16 });
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

function VisitMap({ site, radiusMeters = 200, route = [], arrival, completion, photos = [], onPick, height = 320 }) {
  const routePoints = route.map((point) => [point.lat, point.lng]);
  const fitPoints = [...(site ? [[site.lat, site.lng]] : []), ...routePoints];
  const center = site ? [site.lat, site.lng] : [28.55, 77.2]; // Delhi NCR

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border border-gray-200" data-testid="visit-map">
      <MapContainer center={center} zoom={site ? 15 : 10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {onPick && <ClickToPick onPick={onPick} />}
        {!onPick && <FitTo points={fitPoints} />}
        {routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: COLORS.route, weight: 3, opacity: 0.8 }} />}
        {site && (
          <>
            <Circle center={[site.lat, site.lng]} radius={radiusMeters} pathOptions={{ color: COLORS.site, fillOpacity: 0.12 }} />
            <CircleMarker center={[site.lat, site.lng]} radius={6} pathOptions={{ color: COLORS.site, fillColor: COLORS.site, fillOpacity: 1 }}>
              <Tooltip>Site</Tooltip>
            </CircleMarker>
          </>
        )}
        {arrival?.coords && (
          <CircleMarker center={[arrival.coords.lat, arrival.coords.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: COLORS.arrived, fillOpacity: 1 }}>
            <Tooltip>Arrived</Tooltip>
          </CircleMarker>
        )}
        {completion?.coords && (
          <CircleMarker center={[completion.coords.lat, completion.coords.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: COLORS.done, fillOpacity: 1 }}>
            <Tooltip>Done</Tooltip>
          </CircleMarker>
        )}
        {photos.filter((photo) => photo.coords).map((photo, index) => (
          <CircleMarker key={photo._id || index} center={[photo.coords.lat, photo.coords.lng]} radius={5} pathOptions={{ color: "#fff", weight: 1, fillColor: COLORS.photo, fillOpacity: 1 }}>
            <Tooltip>Photo {index + 1}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export default VisitMap;
