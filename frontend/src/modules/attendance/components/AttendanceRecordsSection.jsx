import { useState } from "react";
import AttendanceTimeline from "./AttendanceTimeline";
import AttendancePhotoModal from "./AttendancePhotoModal";

/**
 * The table + read-only photo-viewer modal shared by
 * `PersonalAttendanceView`, `TeamAttendanceView` and `AdminAttendanceView` —
 * one component rather than duplicating this wiring three times.
 *
 * List/Calendar toggle removed (2026-07-31, §7.5e) — list/timeline-only now,
 * matching the same simplification applied to Leave the same day.
 * `AttendanceCalendar.jsx` is deleted outright, not just hidden (Credentials
 * Vault removal precedent); its two markers (manually-adjusted record,
 * geofence violation) were never calendar-only — `AttendanceTimeline`
 * already showed both independently (the exclamation badge next to the
 * Status tag, and the "Location" column's `GeofenceViolationBar`), so
 * nothing needed migrating.
 *
 * The admin manual-correction UI (Add Record button, per-row/per-modal Edit
 * action) that used to live here was removed — Attendance is UI-read-only
 * for every role now, including admin. The backend's `PATCH /attendance/:id`
 * and `POST /attendance/manual` endpoints are untouched, just dormant (see
 * `backend/README.md`), matching the Credentials Vault removal precedent.
 *
 * **§B1 (2026-08-05)** — the summary stat cards used to render HERE, which
 * placed them BELOW each view's filter row. Each view now renders
 * `AttendanceSummaryStats` itself, at the top, above its filters; this
 * component owns the table and modal only.
 */
function AttendanceRecordsSection({
  records,
  missingDays = [],
  isLoading,
  month,
  showEmployeeColumn,
  employeeNameById,
  teamNameByEmployeeId,
  onMarkStatus,
  showPhotos,
  showLocation,
}) {
  const [photoModalRecord, setPhotoModalRecord] = useState(null);

  // Synthetic missing-day rows are merged into the TABLE only — never into
  // `AttendanceSummaryStats`, which counts real outcomes (present/absent/
  // half-day/on-leave). A day with no record has no outcome yet; counting
  // it would silently inflate the stats the moment the Employee filter is
  // applied, which is exactly when these rows appear.
  const rows =
    missingDays.length > 0
      ? [...records, ...missingDays].sort((a, b) => new Date(b.date) - new Date(a.date))
      : records;

  return (
    <div className="flex flex-col gap-4">
      <AttendanceTimeline
        records={rows}
        isLoading={isLoading}
        showEmployeeColumn={showEmployeeColumn}
        employeeNameById={employeeNameById}
        teamNameByEmployeeId={teamNameByEmployeeId}
        onMarkStatus={onMarkStatus}
        onRowClick={setPhotoModalRecord}
      />

      <AttendancePhotoModal
        open={Boolean(photoModalRecord)}
        record={photoModalRecord}
        onCancel={() => setPhotoModalRecord(null)}
        showPhotos={showPhotos}
        showLocation={showLocation}
      />
    </div>
  );
}

export default AttendanceRecordsSection;
