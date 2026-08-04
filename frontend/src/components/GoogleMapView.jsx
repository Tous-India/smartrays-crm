import { useEffect, useRef } from "react";
import { Alert, Spin } from "antd";
import useGoogleMapsScript from "../hooks/useGoogleMapsScript";

// India centroid — a reasonable default center when there's nothing to plot
// yet (no live employees checked in, or no history for the selected day).
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

/**
 * Generic marker(s) + optional polyline map, talking to `window.google.maps`
 * directly (no wrapper library — see `useGoogleMapsScript.js`'s reasoning).
 * Deliberately basic per §7.4b's stated scope: no clustering, no info
 * windows, no custom controls — just plot what's given and fit the bounds.
 *
 * `markers`: [{ lat, lng, label, color? }] — rendered as `google.maps.Marker`s.
 * `color` (added later, Attendance map integration) selects one of Google's
 * standard colored pin icons (`red`/`orange`/`blue`/`green`/`yellow`/
 * `purple`/`ltblue`/`pink`) instead of the default red pin — lets a caller
 * visually distinguish marker *types* on the same map (e.g. a connectivity-
 * gap boundary vs. a geofence-violation point), not just plot generic
 * points. Omitting it keeps the default marker look, unchanged from before.
 * `path`: [{ lat, lng }] — rendered as one `google.maps.Polyline`, for the
 * history trail view. A view only ever supplies one or the other in
 * practice (live view: markers only; history view: path only, plus a
 * marker at the latest point), but both are supported simultaneously.
 */
function GoogleMapView({ markers = [], path = [], height = 480 }) {
  const { isLoaded, error } = useGoogleMapsScript();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjectsRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new window.google.maps.Map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 5,
    });
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) {
      return;
    }

    markerObjectsRef.current.forEach((marker) => marker.setMap(null));
    markerObjectsRef.current = markers.map(
      (marker) =>
        new window.google.maps.Marker({
          position: { lat: marker.lat, lng: marker.lng },
          map: mapRef.current,
          title: marker.label,
          icon: marker.color ? { url: `https://maps.google.com/mapfiles/ms/icons/${marker.color}-dot.png` } : undefined,
        })
    );

    fitBoundsToPoints(mapRef.current, [...markers, ...path]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, markers]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) {
      return;
    }

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (path.length > 0) {
      polylineRef.current = new window.google.maps.Polyline({
        path: path.map((point) => ({ lat: point.lat, lng: point.lng })),
        map: mapRef.current,
        strokeColor: "#163b78",
        strokeWeight: 3,
      });

      fitBoundsToPoints(mapRef.current, path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, path]);

  if (error) {
    return <Alert type="error" message="Could not load Google Maps" description={error.message} />;
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Spin />
      </div>
    );
  }

  return <div ref={containerRef} data-testid="google-map-container" style={{ height, width: "100%" }} />;
}

function fitBoundsToPoints(map, points) {
  if (points.length === 0) {
    return;
  }

  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
  map.fitBounds(bounds);
}

export default GoogleMapView;
