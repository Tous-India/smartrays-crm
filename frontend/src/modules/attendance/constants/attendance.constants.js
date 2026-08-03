/**
 * Mirrors backend/src/modules/attendance/attendance.model.js's `status` enum
 * exactly.
 */
export const ATTENDANCE_STATUSES = ["present", "absent", "half_day", "on_leave"];

export const ATTENDANCE_STATUS_LABELS = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  on_leave: "On Leave",
};

// Ant Design Tag `color` prop values.
export const ATTENDANCE_STATUS_COLORS = {
  present: "green",
  absent: "red",
  half_day: "orange",
  on_leave: "blue",
};

/**
 * Team Attendance's Status filter (§7.4c) — a DERIVED shift-lifecycle state,
 * not the raw `status` field above. `status` only ever distinguishes
 * present/absent/half_day/on_leave at the record level (set once, rarely
 * changed after creation); this answers "where is this employee in their
 * shift right now," computed from the same checkIn/checkOut/breakIn/
 * breakOut timestamps the rest of this module already reads. A record with
 * `status: "half_day"`/`"on_leave"` and no real check-in at all matches none
 * of these four and is simply excluded when a specific filter is selected —
 * it still shows up under "All statuses".
 */
export const ATTENDANCE_LIFECYCLE_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "on-break", label: "On Break" },
  { value: "checked-out", label: "Checked Out" },
  { value: "absent", label: "Absent" },
];

export function deriveAttendanceLifecycleState(record) {
  if (record.status === "absent") {
    return "absent";
  }

  if (record.checkOut?.time) {
    return "checked-out";
  }

  if (record.checkIn?.time && record.breakIn?.time && !record.breakOut?.time) {
    return "on-break";
  }

  if (record.checkIn?.time) {
    return "present";
  }

  return null;
}
