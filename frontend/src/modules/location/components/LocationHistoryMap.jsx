import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Empty, Segmented, Select, Spin, Tag, Typography } from "antd";
import LeafletMapView from "../../../components/LeafletMapView";
import useLocationHistoryRange from "../hooks/useLocationHistoryRange";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import employeeColor from "../employeeColor";
import { canViewOtherPeoplesLocation } from "../locationAccess";
import { formatDateTime } from "../../../utils/date.utils";

const { Text } = Typography;

/**
 * Location history map (§7.67).
 *
 * TWO MODES, because the data volumes are two orders of magnitude apart:
 *
 * - EVERYONE — check-in/check-out endpoints only, clustered. Twenty people over
 *   45 days is ~1,800 endpoints, which clusters comfortably. The same span of
 *   TRAILS would be ~216,000 pings at the observed 2-minute cadence; the server
 *   refuses them outright rather than trusting the client to ask nicely.
 * - SINGLE EMPLOYEE — endpoints AND the ping trail, one polyline per day.
 *
 * 45 DAYS IS THE CEILING, and it is the server's rule, not this component's.
 * `LocationPing` TTL-purges at 45 days while `Attendance.*.coords` persist
 * forever, so without one shared cap the two halves of this view would disagree
 * about how far back "history" goes.
 *
 * COLOUR IS IDENTITY, SHAPE IS EVENT. Colour comes from the employee id
 * (`employeeColor`), so a person is the same colour here, on the Live Map, and
 * after a reload. Check-in is a flag pointing one way, check-out the other, and
 * a ping is a plain dot. Colour is never reused to mean event type — a red dot
 * would otherwise be ambiguous between "Priya" and "problem".
 *
 * NO STALENESS HERE. Stale marking belongs to the Live Map, where a frozen
 * marker could be mistaken for a current position. Every point on this map is
 * historical by definition.
 */

const RANGES = {
  yesterday: {
    label: "Yesterday",
    resolve: () => ({ from: dayjs().subtract(1, "day").startOf("day"), to: dayjs().subtract(1, "day").endOf("day") }),
  },
  week: { label: "This week", resolve: () => ({ from: dayjs().startOf("week"), to: dayjs().endOf("day") }) },
  month: { label: "This month", resolve: () => ({ from: dayjs().startOf("month"), to: dayjs().endOf("day") }) },
  // The hard maximum. There is deliberately no custom range: anything wider
  // would return endpoints with no possible trail beside them.
  max: { label: "Last 45 days", resolve: () => ({ from: dayjs().subtract(45, "day").startOf("day"), to: dayjs().endOf("day") }) },
};

const EVERYONE = "all";

function LocationHistoryMap() {
  const currentUser = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const canSeeOthers = canViewOtherPeoplesLocation(currentUser);

  // An employee holding only `location.view` can never see anyone else, so
  // Everyone mode is not offered to them at all rather than offered and refused.
  const [selectedEmployee, setSelectedEmployee] = useState(canSeeOthers ? EVERYONE : currentUser?._id);
  const [rangeKey, setRangeKey] = useState("week");

  const range = useMemo(() => RANGES[rangeKey].resolve(), [rangeKey]);
  const from = range.from.toISOString();
  const to = range.to.toISOString();

  const { data, isLoading, error } = useLocationHistoryRange({
    employeeIds: selectedEmployee,
    from,
    to,
  });

  const nameById = useMemo(
    () => new Map(users.map((user) => [String(user._id), user.name])),
    [users]
  );

  const isEveryone = selectedEmployee === EVERYONE;

  /** Endpoint markers — colour by employee, shape by event. */
  const clusteredMarkers = useMemo(() => {
    if (!data?.endpoints) {
      return [];
    }

    return data.endpoints.map((point, index) => {
      const id = String(point.employeeId);

      return {
        key: `${point.attendanceId}-${point.kind}-${index}`,
        employeeId: id,
        lat: point.coords.lat,
        lng: point.coords.lng,
        color: employeeColor(id),
        shape: point.kind === "checkIn" ? "checkin" : "checkout",
        title: `${nameById.get(id) || "Unknown"} — ${point.kind === "checkIn" ? "Check-in" : "Check-out"}`,
        point,
      };
    });
  }, [data, nameById]);

  /** One polyline per day, single-employee mode only. */
  const trails = useMemo(() => {
    if (!data?.pings?.length) {
      return [];
    }

    const byDay = new Map();

    data.pings.forEach((ping) => {
      const key = dayjs(ping.capturedAt).format("YYYY-MM-DD");

      if (!byDay.has(key)) {
        byDay.set(key, []);
      }

      byDay.get(key).push({ lat: ping.coords.lat, lng: ping.coords.lng });
    });

    return [...byDay.entries()].map(([day, points]) => ({
      key: day,
      color: employeeColor(String(selectedEmployee)),
      points,
    }));
  }, [data, selectedEmployee]);

  /** Everyone-mode legend: who is which colour. */
  const legend = useMemo(() => {
    const seen = new Map();

    clusteredMarkers.forEach((marker) => {
      if (!seen.has(marker.employeeId)) {
        seen.set(marker.employeeId, {
          id: marker.employeeId,
          name: nameById.get(marker.employeeId) || "Unknown",
          color: marker.color,
        });
      }
    });

    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clusteredMarkers, nameById]);

  /**
   * The popup is built as HTML because clustered markers are plain Leaflet
   * markers, not React components. The photo appears only when the SERVER sent
   * one — it withholds `photoUrl` unless the viewer holds
   * `attendance.view_photos`, so this never has to make that decision itself.
   */
  const renderPopup = (marker) => {
    const point = marker.point;
    const name = nameById.get(String(point.employeeId)) || "Unknown";
    const label = point.kind === "checkIn" ? "Check-in" : "Check-out";
    const when = point.time ? formatDateTime(point.time) : "Time not recorded";
    const coords = `${point.coords.lat.toFixed(5)}, ${point.coords.lng.toFixed(5)}`;
    const breach = point.geofenceBreachMeters
      ? `<div style="color:#b45309;font-weight:600;margin-bottom:4px">Outside geofence (max ${point.geofenceBreachMeters}m)</div>`
      : "";
    const photo = point.photoUrl
      ? `<img src="${point.photoUrl}" alt="" style="width:150px;border-radius:6px;margin-top:6px" />`
      : "";

    return `<div style="font-size:12px">
      <div style="font-weight:600;margin-bottom:2px">${name}</div>
      <div style="margin-bottom:2px">${label}</div>
      <div style="color:#4b5563;margin-bottom:2px">${when}</div>
      ${breach}
      <div style="color:#6b7280">${coords}</div>
      ${photo}
    </div>`;
  };

  // Clicking a person in Everyone mode focuses them. UI state only — no route,
  // no second permission gate; the same request is simply narrowed.
  const focusEmployee = (marker) => {
    if (isEveryone) {
      setSelectedEmployee(marker.employeeId);
    }
  };

  const employeeOptions = [
    ...(canSeeOthers ? [{ value: EVERYONE, label: "Everyone" }] : []),
    ...users.map((user) => ({ value: String(user._id), label: user.name })),
  ];

  const hasAnything = clusteredMarkers.length > 0 || trails.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* A plain flex-wrap row, not an AntD `Space`: a Space item is sized to
          its content, so the Segmented's scroll wrapper could never shrink
          inside one (measured 356px in a 310px column at 390). */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedEmployee}
          options={employeeOptions}
          style={{ width: 240 }}
          showSearch
          optionFilterProp="label"
          onChange={setSelectedEmployee}
          aria-label="Employee"
        />
        <div className="app-segmented-scroll">
          <Segmented
            value={rangeKey}
            onChange={setRangeKey}
            options={Object.entries(RANGES).map(([value, config]) => ({ value, label: config.label }))}
          />
        </div>
        {data?.cappedToMaxDays && <Tag color="warning">Capped to 45 days</Tag>}
        {isEveryone && (
          <Text type="secondary" className="text-xs">
            Endpoints only — trails are shown for one employee at a time.
          </Text>
        )}
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load location history"
          description={error.response?.status === 404 ? "That employee isn't visible to you." : "Please try again."}
        />
      ) : isLoading ? (
        <div className="flex h-[480px] items-center justify-center">
          <Spin />
        </div>
      ) : !hasAnything ? (
        <Empty description="No location history in this range" />
      ) : (
        <>
          <LeafletMapView
            clusteredMarkers={clusteredMarkers}
            renderClusterPopup={renderPopup}
            onClusterMarkerClick={focusEmployee}
            paths={trails}
          />

          {isEveryone && legend.length > 0 && (
            <div
              className="flex flex-wrap gap-x-4 gap-y-2 rounded border border-gray-200 p-3"
              data-testid="employee-color-legend"
            >
              {legend.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="flex items-center gap-2 text-xs"
                  onClick={() => setSelectedEmployee(entry.id)}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default LocationHistoryMap;
