import { useMemo } from "react";
import dayjs from "dayjs";
import { Alert, Empty, List, Spin, Tag, Tooltip, Typography } from "antd";
import LeafletMapView from "../../../components/LeafletMapView";
import useLiveTrails from "../hooks/useLiveTrails";
import useUserDirectory from "../../../hooks/useUserDirectory";

const { Text } = Typography;

// A ping older than this is treated as STALE rather than current. Browser
// geolocation stops entirely when a tab is backgrounded or a phone locks, so
// the most dangerous failure mode here is a frozen marker that still looks
// live — someone reading it would believe they know where a person is when
// the app simply stopped hearing from them.
const STALE_AFTER_MINUTES = 10;

/**
 * Live tracking map (§B6, 2026-08-05) — every currently-checked-in, visible
 * employee on one map: their check-in point, the trail of pings since, and
 * their latest position.
 *
 * Renders through the shared `LeafletMapView` (OpenStreetMap tiles, set in constants/mapTiles.constants.js) rather
 * than a second map component, so there is exactly one `TileLayer` in the
 * app and no way for a tile source to drift. `LeafletMapView` gained an
 * additive `paths` prop for this — `HistoryMapView` plots ONE employee's
 * single polyline and could not show several at once.
 *
 * Marker colours carry meaning, matching the app's existing semantics:
 * blue = check-in start, green = current position (fresh), red = current
 * position but STALE, orange = a ping recorded during a geofence violation.
 *
 * Checked-out employees disappear on their own: `GET /location/live` only
 * returns open attendance records. Their trail stays in the History view.
 */
/** "3h 07m", not "187 minutes" — the reader is judging urgency, not doing arithmetic. */
function formatSilence(minutes) {
  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * On shift, no position at all (§7.69).
 *
 * Named, and ordered longest-silent first, because that is the one to chase.
 * Deliberately an `Alert type="warning"` and not an `Empty`: an empty state
 * reads as "nothing here, carry on", which is the opposite of what this means.
 *
 * A minute or two of silence is normal — the first ping is one interval after
 * check-in — so the duration is shown per person rather than the whole list
 * being framed as an incident.
 */
function UnlocatableWarning({ people }) {
  return (
    <Alert
      type="warning"
      showIcon
      data-testid="unlocatable-warning"
      message={`${people.length} checked in with no location data`}
      description={
        <div className="flex flex-col gap-1">
          {people.map((person) => (
            <div key={person.attendanceId} className="text-xs">
              <span className="font-medium">{person.name}</span>
              <span className="text-gray-600">
                {" — silent "}
                {formatSilence(person.silentForMinutes)}
                {person.checkInAt && `, checked in ${dayjs(person.checkInAt).format("h:mm A")}`}
              </span>
            </div>
          ))}
        </div>
      }
    />
  );
}

function LiveTrackingMap() {
  const { entries, unlocatable, isLoading, error } = useLiveTrails();
  const { users } = useUserDirectory();

  const employeeNameById = useMemo(() => new Map(users.map((user) => [String(user._id), user.name])), [users]);

  const { markers, paths } = useMemo(() => {
    const allMarkers = [];
    const allPaths = [];

    entries.forEach((entry) => {
      const name = employeeNameById.get(String(entry.employeeId)) || "Unknown";
      const stale = isStale(entry.capturedAt);

      if (entry.checkInCoords) {
        allMarkers.push({
          lat: entry.checkInCoords.lat,
          lng: entry.checkInCoords.lng,
          // A hollow ring: a fixed historical point, not where anyone is now.
          shape: "start",
          color: "default",
          label: `${name} — checked in here`,
        });
      }

      // Geofence pings get their own markers so a violation is visible as a
      // POINT on the trail, not just a colour on the line.
      entry.pings
        .filter((ping) => ping.isGeofenceViolation)
        .forEach((ping) => {
          allMarkers.push({
            lat: ping.coords.lat,
            lng: ping.coords.lng,
            // Diamond, in the geofence family (sky/violet) — deliberately NOT
            // the timeline's green/amber/red, which mean something else
            // entirely on the attendance bar. `orange` sat far too close to
            // the timeline's amber.
            shape: "violation",
            color: "violet",
            label: `${name} — outside the geofence at ${dayjs(ping.capturedAt).format("h:mm A")}`,
          });
        });

      allMarkers.push({
        lat: entry.coords.lat,
        lng: entry.coords.lng,
        // Haloed disc = where they are NOW. Was red/green, which is the
        // TIMELINE's family (connected / gap / break) and meant a live marker
        // and a timeline band could be read as the same signal. Grey for stale
        // says "old" without borrowing any other vocabulary.
        shape: "current",
        color: stale ? "grey" : "blue",
        label: `${name} — ${stale ? "STALE, " : ""}last updated ${relativeTime(entry.capturedAt)}`,
      });

      if (entry.pings.length > 1) {
        allPaths.push({
          key: String(entry.attendanceId),
          points: entry.pings.map((ping) => ({ lat: ping.coords.lat, lng: ping.coords.lng })),
          color: stale ? "#e03131" : "#163b78",
        });
      }
    });

    return { markers: allMarkers, paths: allPaths };
  }, [entries, employeeNameById]);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load live locations"
        description="Please try again."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spin />
      </div>
    );
  }

  /**
   * §7.69 — THREE states, not two.
   *
   * The old code had one empty state for two opposite situations: nobody on
   * shift (fine) and somebody on shift who cannot be located (not fine). Both
   * rendered the same reassuring sentence.
   */
  if (entries.length === 0 && unlocatable.length === 0) {
    // (a) Genuinely nobody working. Calm, neutral — nothing is wrong.
    return <Empty description="No one is currently checked in" />;
  }

  if (entries.length === 0) {
    // (b) People ARE on shift and none of them is reporting a position. This is
    // the failure this feature exists to surface, so it is a warning with
    // names, not an empty state — "2 employees" tells an admin something is
    // wrong; "Ramesh, silent 3h 07m" tells them who to call and how worried to
    // be.
    return <UnlocatableWarning people={unlocatable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Someone unlocatable while others report is still the warning case —
          it must not be hidden just because the map has something to draw. */}
      {unlocatable.length > 0 && <UnlocatableWarning people={unlocatable} />}

      <LeafletMapView markers={markers} paths={paths} />

      {/* Doubles as a legend and stays useful before tiles load. Staleness is
          stated in words here, not only as a marker colour. */}
      <List
        size="small"
        bordered
        dataSource={entries}
        renderItem={(entry) => {
          const stale = isStale(entry.capturedAt);
          const violations = entry.pings.filter((ping) => ping.isGeofenceViolation).length;

          return (
            <List.Item data-testid={`live-entry-${entry.employeeId}`}>
              <span className="font-medium">
                {employeeNameById.get(String(entry.employeeId)) || "Unknown"}
              </span>
              <span className="flex items-center gap-2">
                {violations > 0 && (
                  <Tooltip title="Pings recorded outside the geofence during this shift">
                    <Tag color="orange">{violations} outside geofence</Tag>
                  </Tooltip>
                )}
                {stale ? (
                  <Tooltip title="Location tracking stops when the app is backgrounded or the phone locks. This position may no longer be accurate.">
                    <Tag color="red" data-testid={`stale-${entry.employeeId}`}>
                      Stale · last updated {relativeTime(entry.capturedAt)}
                    </Tag>
                  </Tooltip>
                ) : (
                  <Text type="secondary" className="text-xs">
                    last updated {relativeTime(entry.capturedAt)}
                  </Text>
                )}
              </span>
            </List.Item>
          );
        }}
      />
    </div>
  );
}

function isStale(capturedAt) {
  return dayjs().diff(dayjs(capturedAt), "minute") >= STALE_AFTER_MINUTES;
}

function relativeTime(capturedAt) {
  const minutes = dayjs().diff(dayjs(capturedAt), "minute");

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}

export default LiveTrackingMap;
export { isStale, STALE_AFTER_MINUTES };
