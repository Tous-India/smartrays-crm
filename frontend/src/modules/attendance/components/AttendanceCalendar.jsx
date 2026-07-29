import dayjs from "dayjs";
import { Tooltip } from "antd";
import { ExclamationCircleFilled, EnvironmentFilled } from "@ant-design/icons";
import { ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

// Tailwind pairs (background + border), not the AntD Tag `color` values
// `ATTENDANCE_STATUS_COLORS` holds — this is a filled grid cell, not a Tag,
// so it needs its own light-background/visible-border treatment rather than
// reusing that map directly. "No record" (a day nobody checked in at all —
// most commonly a weekend) is deliberately its own neutral grey, not
// treated as "absent" — that's the whole reason it needs a distinct color
// in the first place, per this task's own spec.
const STATUS_CELL_CLASSES = {
  present: "bg-green-100 border-green-400",
  absent: "bg-red-100 border-red-400",
  half_day: "bg-amber-100 border-amber-400",
  on_leave: "bg-blue-100 border-blue-400",
};
const NO_RECORD_CELL_CLASSES = "bg-gray-50 border-gray-200";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Month grid, one cell per day, color-coded by that day's Attendance
 * `status` (or neutral grey if no record exists for that day) — an
 * additional view alongside `AttendanceTimeline`'s existing list/table,
 * not a replacement for it (both remain selectable via the view-mode
 * toggle in `PersonalAttendanceView`/`TeamAttendanceView`).
 *
 * Clicking any day (record or not) calls `onDayClick(date, record)` —
 * the parent decides what that means (open the photo viewer for a real
 * record, or the admin "Add Record" form for an empty one).
 * Manually-adjusted records (§7.4's admin-correction addition) get a small
 * exclamation badge in the cell's corner so they're never confused with a
 * real verified check-in at a glance, matching the same distinction
 * `AttendancePhotoModal`'s own Tag makes in the detail view. A day with a
 * geofence violation (added later, §6.5/§7.4) gets its own small badge,
 * same treatment but in the opposite corner (top-left, not top-right) so
 * the two markers never overlap on a day that's both manually-adjusted and
 * had a violation — an orange `EnvironmentFilled` pin, matching
 * `GeofenceViolationBar`'s own orange (distinct from connectivity's red)
 * and the location icon vocabulary already established elsewhere in this
 * app (`EnvironmentOutlined` on the Location nav item/check-in widget).
 */
function AttendanceCalendar({ month, records, onDayClick }) {
  const recordsByDay = new Map(records.map((record) => [dayjs(record.date).format("YYYY-MM-DD"), record]));

  const startOfMonth = month.startOf("month");
  const daysInMonth = month.daysInMonth();
  const leadingBlanks = startOfMonth.day(); // 0 = Sunday

  const cells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => startOfMonth.date(index + 1)),
  ];

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium text-gray-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((date, index) => {
          if (!date) {
            return <div key={`blank-${index}`} />;
          }

          const dayKey = date.format("YYYY-MM-DD");
          const record = recordsByDay.get(dayKey);
          const cellClasses = record ? STATUS_CELL_CLASSES[record.status] || NO_RECORD_CELL_CLASSES : NO_RECORD_CELL_CLASSES;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onDayClick(date, record)}
              title={record ? ATTENDANCE_STATUS_LABELS[record.status] : "No record"}
              data-testid={`attendance-calendar-day-${dayKey}`}
              data-status={record?.status || "none"}
              className={`relative aspect-square rounded border p-1 text-left text-xs transition hover:opacity-75 ${cellClasses}`}
            >
              <span>{date.date()}</span>
              {record?.isManuallyAdjusted && (
                <Tooltip title="Manually adjusted by admin">
                  <ExclamationCircleFilled
                    data-testid={`attendance-manual-marker-${dayKey}`}
                    className="absolute right-1 top-1 text-amber-600"
                    style={{ fontSize: 11 }}
                  />
                </Tooltip>
              )}
              {record?.geofenceViolations?.length > 0 && (
                <Tooltip title="Location: left the geofence during this shift">
                  <EnvironmentFilled
                    data-testid={`attendance-geofence-marker-${dayKey}`}
                    className="absolute left-1 top-1 text-orange-600"
                    style={{ fontSize: 11 }}
                  />
                </Tooltip>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AttendanceCalendar;
