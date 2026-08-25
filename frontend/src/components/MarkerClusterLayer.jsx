import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

/**
 * Marker clustering for the history map (§7.67).
 *
 * Everyone × 45 days is ~1,800 endpoint markers — enough that plain `<Marker>`
 * elements make pan and zoom visibly stutter, and enough that overlapping pins
 * hide each other entirely in any city centre.
 *
 * Uses `leaflet.markercluster` directly through `useMap()` rather than a React
 * wrapper: the popular `react-leaflet-cluster` peers on react-leaflet v4, and
 * this project is on v5. A thin imperative layer is less risk than pinning the
 * whole map library backwards.
 *
 * Markers are rebuilt whenever the input changes, which is correct here — the
 * filters replace the whole set rather than mutating it — and the group is
 * removed on unmount so a modal or tab close leaves nothing behind.
 */
function MarkerClusterLayer({ markers = [], buildIcon, onMarkerClick, renderPopup }) {
  const map = useMap();

  // Stable identity for the effect: markers are rebuilt every render by the
  // parent's `useMemo`, so comparing by value avoids re-creating the cluster
  // group on every unrelated re-render.
  const signature = useMemo(
    () => markers.map((m) => `${m.key}:${m.lat}:${m.lng}`).join("|"),
    [markers]
  );

  useEffect(() => {
    if (!markers.length) {
      return undefined;
    }

    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      // Spiderfy so co-located points (a depot everyone checks in at) can still
      // be opened individually rather than staying a permanent cluster.
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
    });

    markers.forEach((marker) => {
      const leafletMarker = L.marker([marker.lat, marker.lng], {
        icon: buildIcon(marker),
        title: marker.title || "",
      });

      if (renderPopup) {
        leafletMarker.bindPopup(renderPopup(marker), { minWidth: 200 });
      }

      if (onMarkerClick) {
        leafletMarker.on("click", () => onMarkerClick(marker));
      }

      group.addLayer(leafletMarker);
    });

    map.addLayer(group);

    return () => {
      map.removeLayer(group);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

export default MarkerClusterLayer;
