import { useState } from "react";
import dayjs from "dayjs";
import { Tooltip } from "antd";
import { computeGeofenceSegments } from "../utils/attendanceGeofence";

/**
 * The "Location" column: where the person was, on the SAME 24-hour
 * midnight→midnight axis as the "Timeline" column beside it (§7.4f,
 * 2026-08-06).
 *
 * **Shared axis.** This used to stretch check-in → check-out across the full
 * width while the timeline measured the whole calendar day, so the same
 * x-offset meant different clock times in two columns of one row — a band at
 * the halfway mark was noon in one and mid-shift in the other. Both now draw
 * through `createDayAxis`, so the columns are readable against each other and
 * a violation lines up vertically with whatever the timeline shows at that
 * moment.
 *
 * **Its own colour family.** `green-400` previously meant "connected and
 * tracking" on the timeline AND "inside the geofence" here, which invited
 * reading the two columns as the same measurement; and `orange-500` sat close
 * enough to the timeline's `red-500` that a connectivity gap and a geofence
 * violation looked like one problem reported twice. Location is now blue/
 * violet throughout: SKY = inside the geofence, VIOLET = outside it. Gray
 * stays the shared "nothing here" base in both columns.
 *
 * **One controlled tooltip**, matching `AttendanceTimelineBar`. This column
 * previously used native `title` attributes, which a browser can show at the
 * same time as an AntD tooltip from the neighbouring column — two visible
 * tooltips again, by a different route than the nested-Tooltip bug that
 * prompted the pattern.
 */

const SEGMENT_CLASS = {
  inside: "bg-sky-300",
  outside: "bg-violet-600",
};

const BASE_LABEL = "Off shift — no location tracking outside the checked-in period";

function formatClock(ms) {
  return dayjs(ms).format("h:mm A");
}

function segmentTooltip(segment) {
  const range = `${formatClock(segment.startMs)} – ${formatClock(segment.endMs)}`;

  if (segment.kind === "inside") {
    return `Within the geofence · ${range}`;
  }

  const distance =
    segment.maxDistanceMeters == null ? null : `${Math.round(segment.maxDistanceMeters)} m`;

  return distance
    ? `Outside the geofence · ${range} · up to ${distance} from check-in`
    : `Outside the geofence · ${range}`;
}

function GeofenceViolationBar({ record }) {
  const segments = computeGeofenceSegments(record);
  const [activeIndex, setActiveIndex] = useState(null);

  const activeSegment = activeIndex == null ? null : segments[activeIndex];
  const title = activeSegment ? segmentTooltip(activeSegment) : BASE_LABEL;

  return (
    <Tooltip title={title}>
      <div
        className="relative h-3 w-full overflow-hidden rounded bg-gray-200"
        data-testid="geofence-violation-bar"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`absolute top-0 h-full ${SEGMENT_CLASS[segment.kind]}`}
            data-testid={
              segment.kind === "outside" ? "geofence-violation-segment" : "geofence-inside-segment"
            }
            style={{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
          />
        ))}
      </div>
    </Tooltip>
  );
}

export default GeofenceViolationBar;
