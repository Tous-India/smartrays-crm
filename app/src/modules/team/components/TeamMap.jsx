import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Config from "react-native-config";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * The team on one map (app-plan.md §2) — Google Maps through
 * react-native-maps with the Google provider (2026-10-23, owner's decision;
 * it replaced MapLibre + OpenStreetMap tiles). The Android key comes from the
 * untracked env file (GOOGLE_MAPS_API_KEY → the manifest, see build.gradle);
 * without one the box says "Map not configured" and no map loads at all. The
 * map exists only where this component is drawn (the Team tab's Live
 * segment), so nothing map-related loads elsewhere. Only the basic map — no
 * Places, Directions or other paid extras.
 *
 * `markers` is `[{ id, name, coords: { lat, lng }, capturedAt, stale, color? }]` —
 * `color`, when given, is the person's live-status colour; `selectedId` is
 * drawn larger; tapping one calls `onSelect(marker)` (the press goes on the
 * Marker itself — a Pressable inside a map marker never sees the touch).
 */
export function mapsConfigured() {
  return Boolean(Config.GOOGLE_MAPS_API_KEY);
}

// Nothing to show yet: India, wide.
const INDIA = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 25, longitudeDelta: 25 };
const EDGE = { top: 60, right: 60, bottom: 60, left: 60 };

/** The first view: one marker at street level, several framed after layout. */
export function initialRegionFor(markers) {
  if (markers.length === 0) return INDIA;
  const [first] = markers;
  return { latitude: first.coords.lat, longitude: first.coords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
}

function TeamMap({ markers, selectedId, onSelect, style }) {
  const mapRef = useRef(null);
  const signature = markers.map((marker) => `${marker.id}:${marker.coords.lat}:${marker.coords.lng}`).join("|");

  function frameEveryone() {
    if (markers.length > 1) {
      mapRef.current?.fitToCoordinates(
        markers.map((marker) => ({ latitude: marker.coords.lat, longitude: marker.coords.lng })),
        { edgePadding: EDGE, animated: false }
      );
    }
  }

  // Frame everyone again whenever the set of positions changes (the 45 s refresh).
  useEffect(() => {
    frameEveryone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!mapsConfigured()) {
    return (
      <View style={[styles.wrap, styles.notConfigured, style]} testID="team-map-not-configured">
        <Text style={[typography.body, styles.notConfiguredTitle]}>Map not configured</Text>
        <Text style={[typography.small, styles.notConfiguredText]}>
          The Google Maps key is not set in this build. Everyone is still listed below.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]} testID="team-map">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegionFor(markers)}
        onMapReady={frameEveryone}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            identifier={marker.id}
            coordinate={{ latitude: marker.coords.lat, longitude: marker.coords.lng }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onSelect(marker)}
            tracksViewChanges={false}
          >
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
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  notConfigured: { alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: colors.brandPanelAlt },
  notConfiguredTitle: { fontWeight: "700" },
  notConfiguredText: { marginTop: spacing.xs, textAlign: "center" },
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
