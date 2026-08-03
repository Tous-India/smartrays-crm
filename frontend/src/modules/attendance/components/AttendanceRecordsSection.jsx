import { useState } from "react";
import { Segmented } from "antd";
import AttendanceTimeline from "./AttendanceTimeline";
import AttendanceCalendar from "./AttendanceCalendar";
import AttendanceSummaryStats from "./AttendanceSummaryStats";
import AttendancePhotoModal from "./AttendancePhotoModal";

const VIEW_OPTIONS = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
];

/**
 * Everything below the month/employee filters on both `PersonalAttendanceView`
 * and `TeamAttendanceView` — summary stats (§7.4 addition), a List/Calendar
 * view toggle (both reuse the SAME `records` already fetched for the page;
 * neither view replaces the other), and the read-only photo-viewer modal.
 * Built as one shared component rather than duplicating this wiring twice,
 * the same reasoning `AttendanceTimeline` itself already established for the
 * list view alone.
 *
 * The admin manual-correction UI (Add Record button, per-row/per-modal Edit
 * action) that used to live here was removed — Attendance is UI-read-only
 * for every role now, including admin. The backend's `PATCH /attendance/:id`
 * and `POST /attendance/manual` endpoints are untouched, just dormant (see
 * `backend/README.md`), matching the Credentials Vault removal precedent.
 */
function AttendanceRecordsSection({
  records,
  isLoading,
  month,
  showEmployeeColumn,
  employeeNameById,
  showPhotos,
  showLocation,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [photoModalRecord, setPhotoModalRecord] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      <AttendanceSummaryStats records={records} month={month} />

      <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />

      {viewMode === "list" ? (
        <AttendanceTimeline
          records={records}
          isLoading={isLoading}
          showEmployeeColumn={showEmployeeColumn}
          employeeNameById={employeeNameById}
          onRowClick={setPhotoModalRecord}
        />
      ) : (
        <AttendanceCalendar month={month} records={records} onDayClick={setPhotoModalRecord} />
      )}

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
