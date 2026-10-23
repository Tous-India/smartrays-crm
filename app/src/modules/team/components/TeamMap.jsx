import { StyleSheet, Text, View } from "react-native";
import { Camera, Map as MapLibreMap, Marker } from "@maplibre/maplibre-react-native";
import { colors, radius, spacing, typography } from "../../../theme";
import { MAP_TILES } from "../../../constants/mapTiles.constants";

/**
 * The team on one map (app-plan.md §2): last-known positions from
 * `GET /location/live`, a stale one — older than the server's threshold —
 * drawn grey. Tiles are OpenStreetMap raster through MapLibre (free, no key;
 * OSM's tile policy allows light use like this and asks heavier apps to use
 * a tile provider). No Google Maps SDK, no CARTO.
 *
 * `markers` is `[{ id, name, coords: { lat, lng }, capturedAt, stale, color? }]` —
 * `color`, when given, is the person's live-status colour (2026-10-23);
 * `selectedId` is drawn larger; tapping one calls `onSelect(marker)`.
 *
 * Markers, not ViewAnnotations (2026-10-23): on Android a ViewAnnotation
 * draws its view onto a bitmap, and on the emulator nothing appeared at all;
 * a Marker is a real view placed on the map. The press goes on the Marker
 * itself — a Pressable inside it never sees the touch on Android.
 */
const OSM_STYLE = {
  version: 8,
  sources: {
    // Tile source: constants/mapTiles.constants.js (one place, 2026-10-23).
    osm: {
      type: "raster",
      tiles: [MAP_TILES.url],
      tileSize: MAP_TILES.tileSize,
      attribution: MAP_TILES.attribution,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** A camera that shows every marker, with room around them; one marker gets a city-level zoom. */
export function initialViewFor(markers) {
  if (markers.length === 0) {
    // Nothing to show: India, wide.
    return { center: [78.9629, 20.5937], zoom: 3.5 };
  }

  if (markers.length === 1) {
    return { center: [markers[0].coords.lng, markers[0].coords.lat], zoom: 13 };
  }

  const lngs = markers.map((marker) => marker.coords.lng);
  const lats = markers.map((marker) => marker.coords.lat);

  return {
    bounds: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    padding: { top: 60, right: 60, bottom: 60, left: 60 },
  };
}

function TeamMap({ markers, selectedId, onSelect, style }) {
  return (
    <View style={[styles.wrap, style]} testID="team-map">
      <MapLibreMap style={styles.map} mapStyle={OSM_STYLE} attribution logo={false} compass={false}>
        <Camera initialViewState={initialViewFor(markers)} />
        {markers.map((marker) => (
          <Marker key={marker.id} id={marker.id} lngLat={[marker.coords.lng, marker.coords.lat]} anchor="bottom" onPress={() => onSelect(marker)}>
            <View style={styles.pin} testID={`team-map-marker-${marker.id}`} accessibilityLabel={`${marker.name}${marker.stale ? ", stale" : ""}`}>
              <Text style={[styles.pinLabel, marker.stale && styles.pinLabelStale]} numberOfLines={1}>
                {marker.name}
              </Text>
              <View
                style={[styles.dot, marker.stale && styles.dotStale, marker.color && { backgroundColor: marker.color }, marker.id === selectedId && styles.dotSelected]}
                testID={`team-map-dot-${marker.id}`}
              />
            </View>
          </Marker>
        ))}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  pin: { alignItems: "center" },
  pinLabel: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: "600",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: 2,
    overflow: "hidden",
    maxWidth: 140,
  },
  pinLabelStale: { color: colors.textSecondary },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brandNavy, borderWidth: 3, borderColor: colors.card },
  dotStale: { backgroundColor: colors.disabled },
  dotSelected: { width: 24, height: 24, borderRadius: 12 },
});

export default TeamMap;
