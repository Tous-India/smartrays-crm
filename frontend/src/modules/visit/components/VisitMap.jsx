import { useEffect } from "react";
import { APIProvider, Circle, Map, Marker, Polyline, useMap } from "@vis.gl/react-google-maps";
import MapNotConfigured from "../../../components/googleMap/MapNotConfigured";
import { googleMapsApiKey, mapsConfigured } from "../../../components/googleMap/mapsConfig";

/**
 * A site visit on the map (2026-10-22): the site and its geofence circle,
 * that day's actual route (location pings), and where Arrived, Done and each
 * photo happened. With `onPick`, a click places the site instead (assigning a
 * visit). Google Maps since 2026-10-23 (the same as every other map); no key
 * → "Map not configured".
 */
const COLORS = { site: "#163b78", route: "#64748b", arrived: "#1971c2", done: "#2f9e44", photo: "#9c36b5" };

function dotIcon(color, scale) {
  const maps = window.google?.maps;
  return maps
    ? { path: maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }
    : undefined;
}

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 24);
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function VisitMap({ site, radiusMeters = 200, route = [], arrival, completion, photos = [], onPick, height = 320 }) {
  if (!mapsConfigured()) {
    return <MapNotConfigured height={height} />;
  }

  const routePoints = route.map((point) => ({ lat: point.lat, lng: point.lng }));
  const fitPoints = [...(site ? [{ lat: site.lat, lng: site.lng }] : []), ...routePoints];
  const center = site ? { lat: site.lat, lng: site.lng } : { lat: 28.55, lng: 77.2 }; // Delhi NCR

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border border-gray-200" data-testid="visit-map">
      <APIProvider apiKey={googleMapsApiKey()}>
        <Map
          defaultCenter={center}
          defaultZoom={site ? 15 : 10}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          clickableIcons={false}
          onClick={onPick ? (event) => event.detail.latLng && onPick({ lat: event.detail.latLng.lat, lng: event.detail.latLng.lng }) : undefined}
          style={{ height: "100%", width: "100%" }}
        >
          {!onPick && <FitTo points={fitPoints} />}
          {routePoints.length > 1 && <Polyline path={routePoints} strokeColor={COLORS.route} strokeWeight={3} strokeOpacity={0.8} />}
          {site && (
            <>
              <Circle center={{ lat: site.lat, lng: site.lng }} radius={radiusMeters} strokeColor={COLORS.site} strokeWeight={2} fillColor={COLORS.site} fillOpacity={0.12} clickable={false} />
              <Marker position={{ lat: site.lat, lng: site.lng }} icon={dotIcon(COLORS.site, 6)} title="Site" />
            </>
          )}
          {arrival?.coords && <Marker position={{ lat: arrival.coords.lat, lng: arrival.coords.lng }} icon={dotIcon(COLORS.arrived, 7)} title="Arrived" />}
          {completion?.coords && <Marker position={{ lat: completion.coords.lat, lng: completion.coords.lng }} icon={dotIcon(COLORS.done, 7)} title="Done" />}
          {photos
            .filter((photo) => photo.coords)
            .map((photo, index) => (
              <Marker key={photo._id || index} position={{ lat: photo.coords.lat, lng: photo.coords.lng }} icon={dotIcon(COLORS.photo, 5)} title={`Photo ${index + 1}`} />
            ))}
        </Map>
      </APIProvider>
    </div>
  );
}

export default VisitMap;
