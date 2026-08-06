import { useState } from "react";
import dayjs from "dayjs";
import { Tooltip } from "antd";
import { computeTimelineSegments } from "../utils/attendanceTimeline";

/**
 * Connectivity over the day, inside `AttendancePhotoModal` (§7.4h,
 * 2026-08-06).
 *
 * This was the last surviving instance of the old bar style — its own
 * check-in→check-out scaling, a green base covering the full width, and
 * native `title` attributes — and it sat directly above the new Geofence
 * chip, which made it read as the thing that column used to be.
 *
 * It now derives its bands from **`computeTimelineSegments`, the exact
 * function the Timeline column uses**, dropping only the break band (this
 * section is about connectivity, and an amber break here would answer a
 * question nobody asked at this point in the modal). Sharing the function
 * rather than the axis helper alone makes alignment true by construction: a
 * gap cannot land at a different offset here than in the table, because
 * there is only one piece of code deciding where it goes.
 *
 * Palette is deliberately identical to the Timeline column — gray base,
 * `green-400` connected, `red-500` gap — so a connectivity gap looks the same
 * everywhere it appears. It stays well clear of the sky/violet family, which
 * now means geofence: keeping the two failure types visually separate is the
 * entire point of that earlier palette split.
 *
 * One controlled AntD Tooltip, content keyed by the hovered band. The native
 * `title` attributes it used before could put a browser tooltip on screen
 * beside an AntD one — two visible tooltips at once, the failure mode that
 * was structurally eliminated everywhere else.
 */

const SEGMENT_CLASS = {
  green: "bg-green-400",
  red: "bg-red-500",
};

const SEGMENT_LABEL = {
  green: "Connected — checked in and tracking normally",
  red: "Connectivity issue — no tracking signal received",
};

const BASE_LABEL = "Not tracked — outside the checked-in period for this day";

function formatClock(ms) {
  return dayjs(ms).format("h:mm A");
}

function segmentTooltip(segment) {
  return `${SEGMENT_LABEL[segment.color]} · ${formatClock(segment.startMs)} – ${formatClock(segment.endMs)}`;
}

function ConnectivityGapBar({ record }) {
  // The break band is dropped; everything else is exactly what the Timeline
  // column draws for this record.
  const segments = computeTimelineSegments(record).filter((segment) => segment.color !== "amber");
  const [activeIndex, setActiveIndex] = useState(null);

  const activeSegment = activeIndex == null ? null : segments[activeIndex];
  const title = activeSegment ? segmentTooltip(activeSegment) : BASE_LABEL;

  return (
    <Tooltip title={title}>
      <div
        className="relative h-3 w-full overflow-hidden rounded bg-gray-200"
        data-testid="connectivity-gap-bar"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`absolute top-0 h-full ${SEGMENT_CLASS[segment.color]}`}
            data-testid={
              segment.color === "red" ? "connectivity-gap-segment" : "connectivity-connected-segment"
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

export default ConnectivityGapBar;
