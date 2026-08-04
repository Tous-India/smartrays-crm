import { Modal } from "antd";
import HistoryMapView from "../../location/components/HistoryMapView";
import { deriveAttendanceMapMarkers } from "../utils/attendanceMapMarkers";

/**
 * "View on Map" (§7.4d, 2026-08-04) — opened from `AttendancePhotoModal`.
 * Reuses `HistoryMapView` (Location module, §7.4b) rather than a second map
 * component: same `GET /location/history` data, same `GoogleMapView`
 * rendering, just locked to this one record's employee/day
 * (`showControls={false}` — an admin reviewing a specific shift's map
 * doesn't need the employee/date pickers HistoryMapView's own `/location`
 * page uses) and given `deriveAttendanceMapMarkers(record)` to additionally
 * plot this record's connectivity-gap boundaries and geofence-violation
 * points on top of the plain ping-trail polyline, using the exact same
 * pings already being fetched — no new backend endpoint.
 */
function AttendanceLocationMapModal({ open, record, onCancel }) {
  if (!record) {
    return null;
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      title={`Location — ${new Date(record.date).toLocaleDateString()}`}
      destroyOnHidden
    >
      <HistoryMapView
        initialEmployeeId={record.employeeId}
        initialDate={record.date}
        showControls={false}
        deriveExtraMarkers={deriveAttendanceMapMarkers(record)}
      />
    </Modal>
  );
}

export default AttendanceLocationMapModal;
