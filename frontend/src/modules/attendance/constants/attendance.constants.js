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
