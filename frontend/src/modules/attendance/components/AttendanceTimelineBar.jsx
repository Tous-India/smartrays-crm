import { Space, Tooltip, Typography } from "antd";
import { computeTimelineSegments, computeAttendanceDurations, formatDuration } from "../utils/attendanceTimeline";

const { Text } = Typography;

const SEGMENT_COLOR_CLASS = {
  green: "bg-green-400",
  red: "bg-red-500",
  amber: "bg-amber-400",
};

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
  const { shiftMs, connectedMs, issueMs } = computeAttendanceDurations(record);

  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      <div className="relative h-3 w-full overflow-hidden rounded bg-gray-200" data-testid="attendance-timeline-bar">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`absolute top-0 h-full ${SEGMENT_COLOR_CLASS[segment.color]}`}
            data-testid={`attendance-timeline-segment-${segment.color}`}
            style={{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }}
          />
        ))}
      </div>
      <Space size={8} wrap>
        <Tooltip title="Total Shift Time">
          <Text className="text-xs text-gray-500">Shift: {formatDuration(shiftMs)}</Text>
        </Tooltip>
        <Tooltip title="Total Connected/Normal Time">
          <Text className="text-xs text-gray-500">Connected: {formatDuration(connectedMs)}</Text>
        </Tooltip>
        <Tooltip title="Total Connectivity Issue Time">
          <Text className="text-xs text-gray-500">Issues: {formatDuration(issueMs)}</Text>
        </Tooltip>
      </Space>
    </div>
  );
}

export default AttendanceTimelineBar;
