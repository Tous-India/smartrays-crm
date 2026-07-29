import { useState } from "react";
import { Segmented, Button, Tooltip, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import AttendanceTimeline from "./AttendanceTimeline";
import AttendanceCalendar from "./AttendanceCalendar";
import AttendanceSummaryStats from "./AttendanceSummaryStats";
import AttendancePhotoModal from "./AttendancePhotoModal";
import AttendanceCorrectionModal from "./AttendanceCorrectionModal";
import { adjustAttendance, createManualAttendance } from "../api/attendanceApi";

const VIEW_OPTIONS = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
];

/**
 * Everything below the month/employee filters on both `PersonalAttendanceView`
 * and `TeamAttendanceView` — summary stats (§7.4 addition), a List/Calendar
 * view toggle (both reuse the SAME `records` already fetched for the page;
 * neither view replaces the other), the photo-viewer modal, and (admin
 * only) the manual-correction modal. Built as one shared component rather
 * than duplicating this wiring twice, the same reasoning `AttendanceTimeline`
 * itself already established for the list view alone.
 *
 * `canCorrect`/`defaultEmployeeId` are how the parent expresses "is this
 * page's viewer an admin" and "which employee should a brand-new record
 * (from the toolbar's Add Record button, not a calendar-cell click) be
 * created for" — Personal always passes the logged-in user's own id (always
 * a valid target); Team passes whichever single employee is currently
 * selected, or `null` when "All employees" is selected (there's no single
 * valid target then, so Add Record is disabled with an explanatory tooltip
 * instead of guessing).
 */
function AttendanceRecordsSection({
  records,
  isLoading,
  month,
  showEmployeeColumn,
  employeeNameById,
  canCorrect,
  defaultEmployeeId,
  onChanged,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [photoModalRecord, setPhotoModalRecord] = useState(null);
  const [correctionModal, setCorrectionModal] = useState(null); // { mode, record, employeeId, initialDate } | null
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  function handleRowOrDayClick(date, record) {
    if (record) {
      setPhotoModalRecord(record);
      return;
    }

    if (canCorrect && defaultEmployeeId) {
      setCorrectionModal({ mode: "create", employeeId: defaultEmployeeId, initialDate: date });
    }
  }

  function handleEditRecord(record) {
    setCorrectionModal({ mode: "edit", record, employeeId: record.employeeId });
  }

  function handleEditFromPhotoModal() {
    const record = photoModalRecord;
    setPhotoModalRecord(null);
    setCorrectionModal({ mode: "edit", record, employeeId: record.employeeId });
  }

  async function handleCorrectionSubmit(values) {
    setIsSubmittingCorrection(true);

    try {
      if (correctionModal.mode === "edit") {
        await adjustAttendance(correctionModal.record._id, values);
        message.success("Attendance record updated");
      } else {
        await createManualAttendance({ ...values, employeeId: correctionModal.employeeId });
        message.success("Attendance record created");
      }

      setCorrectionModal(null);
      onChanged();
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AttendanceSummaryStats records={records} month={month} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />

        {canCorrect && (
          <Tooltip title={defaultEmployeeId ? "" : "Select an employee first"}>
            <Button
              icon={<PlusOutlined />}
              disabled={!defaultEmployeeId}
              onClick={() =>
                setCorrectionModal({ mode: "create", employeeId: defaultEmployeeId, initialDate: null })
              }
            >
              Add Record
            </Button>
          </Tooltip>
        )}
      </div>

      {viewMode === "list" ? (
        <AttendanceTimeline
          records={records}
          isLoading={isLoading}
          showEmployeeColumn={showEmployeeColumn}
          employeeNameById={employeeNameById}
          onRowClick={(record) => handleRowOrDayClick(null, record)}
          onEditRecord={canCorrect ? handleEditRecord : undefined}
        />
      ) : (
        <AttendanceCalendar month={month} records={records} onDayClick={handleRowOrDayClick} />
      )}

      <AttendancePhotoModal
        open={Boolean(photoModalRecord)}
        record={photoModalRecord}
        onCancel={() => setPhotoModalRecord(null)}
        onEdit={canCorrect ? handleEditFromPhotoModal : undefined}
      />

      <AttendanceCorrectionModal
        open={Boolean(correctionModal)}
        mode={correctionModal?.mode}
        record={correctionModal?.record}
        initialDate={correctionModal?.initialDate}
        onCancel={() => setCorrectionModal(null)}
        onSubmit={handleCorrectionSubmit}
        isSubmitting={isSubmittingCorrection}
      />
    </div>
  );
}

export default AttendanceRecordsSection;
