import { useState } from "react";
import dayjs from "dayjs";
import { Space, Tooltip, Typography } from "antd";
import { computeTimelineSegments, computeAttendanceDurations, formatDuration } from "../utils/attendanceTimeline";

const { Text } = Typography;

const SEGMENT_COLOR_CLASS = {
  green: "bg-green-400",
  red: "bg-red-500",
  amber: "bg-amber-400",
};

// What each colour actually means (2026-08-05) — the bar was legible only
// to someone who already knew the legend, which lived in a source comment.
const SEGMENT_LABEL = {
  green: "Connected — checked in and tracking normally",
  red: "Connectivity issue — no tracking signal received",
  amber: "On break",
};

// The GRAY base band's own meaning — "nothing here" is a real state, not an
// absence of information.
const BASE_LABEL = "Not tracked — outside the checked-in period for this day";

function formatClock(ms) {
  return dayjs(ms).format("h:mm A");
}

function segmentTooltip(segment) {
  return `${SEGMENT_LABEL[segment.color]} · ${formatClock(segment.startMs)} – ${formatClock(segment.endMs)}`;
}

/**
 * §7.4e (2026-08-04) — replaces the old separate "Connectivity Gap" and
 * "Shift Timing" (Check-In/Check-Out/Working Hours) columns with a single
 * 24-hour visual timeline per row, plus calculated duration stats. See
 * `utils/attendanceTimeline.js`'s own docblock for the investigation this
 * replacement was built on (those columns were reading genuinely different
 * fields, not duplicate data — the *columns* were redundant, not the
 * underlying data) and the midnight-crossing edge case this bar clamps to
 * its own day's boundary rather than overflowing.
 *
 * GRAY (the bar's own background) = not checked in that day at all, or
 * before check-in/after check-out; GREEN = checked in, connected normally;
 * RED = a connectivity gap; AMBER = the break period. A record with no
 * check-in renders a fully gray bar with no segments at all.
 */
function AttendanceTimelineBar({ record }) {
  const segments = computeTimelineSegments(record);
  const { shiftMs, connectedMs, issueMs, isOpen, isClamped } = computeAttendanceDurations(record);

  // Which band the cursor is over; `null` means the GRAY base.
  const [activeIndex, setActiveIndex] = useState(null);

  const activeSegment = activeIndex == null ? null : segments[activeIndex];
  const title = activeSegment ? segmentTooltip(activeSegment) : BASE_LABEL;

  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      {/*
        ONE tooltip for the whole bar, its content keyed by the hovered band
        (2026-08-06). Previously the bar had a Tooltip AND each segment had
        its own; since the bar is an ANCESTOR of every segment, its
        mouseenter fired by bubbling on every hover and two tooltips opened
        together — reproduced in a real browser on every coloured band, not
        just at boundaries.

        Removing the outer tooltip alone would have cost the gray base its
        explanation, which is a real state (before check-in, after
        check-out, or never checked in at all) and the one band that used to
        have none. Swapping the content of a single tooltip keeps all four
        meanings and makes two-at-once structurally impossible rather than
        merely unlikely.
      */}
      <Tooltip title={title}>
        <div
          className="relative h-3 w-full overflow-hidden rounded bg-gray-200"
          data-testid="attendance-timeline-bar"
          // Leaving the bar entirely resets to the base band. Moving from a
          // segment onto the base fires that segment's own mouseleave below.
          onMouseLeave={() => setActiveIndex(null)}
        >
          {segments.map((segment, index) => (
            <div
              key={index}
              className={`absolute top-0 h-full ${SEGMENT_COLOR_CLASS[segment.color]}`}
              data-testid={`attendance-timeline-segment-${segment.color}`}
              style={{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }}
              onMouseEnter={() => setActiveIndex(index)}
              // Ordering is safe when moving between two segments: the DOM
              // fires the outgoing element's mouseleave before the incoming
              // element's mouseenter, so the incoming index wins.
              onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
            />
          ))}
        </div>
      </Tooltip>
      <Space size={8} wrap>
        {/*
          §7.45 — these numbers describe THIS DAY and match the bar exactly.
          A shift crossing midnight contributes only its slice to each day it
          touches, and an open shift reports elapsed-so-far, so the label is
          qualified rather than silently reading as a final total.
        */}
        <Tooltip
          title={
            isOpen
              ? "Time since check-in — this shift is still open"
              : isClamped
                ? "This day's portion of a shift that crosses midnight"
                : "Total Shift Time"
          }
        >
          <Text className="text-xs text-gray-500">
            Shift: {formatDuration(shiftMs)}
            {isOpen && shiftMs != null && " so far"}
          </Text>
        </Tooltip>
        <Tooltip title="Total Connected/Normal Time">
          <Text className="text-xs text-gray-500">Connected: {formatDuration(connectedMs)}</Text>
        </Tooltip>
        {/* Renamed from "Issues"/"Total Connectivity Issue Time"
            (2026-08-05) — "Not Tracked" describes what the number actually
            measures (time with no signal) without implying fault. */}
        <Tooltip title="Total time with no tracking signal during the shift">
          <Text className="text-xs text-gray-500">Not Tracked: {formatDuration(issueMs)}</Text>
        </Tooltip>
      </Space>
    </div>
  );
}

export default AttendanceTimelineBar;
