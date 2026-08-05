import { useEffect, useState } from "react";
import { Alert, Button, App } from "antd";
import { EnvironmentOutlined, ReloadOutlined } from "@ant-design/icons";
import useGeolocation from "../hooks/useGeolocation";
import CameraCapture from "./CameraCapture";
import { checkIn, checkOut } from "../api/attendanceApi";
import { notifyAttendanceChanged } from "../utils/attendanceEvents.js";

/**
 * The camera + geolocation capture step shared by both entry points into
 * check-in/check-out (2026-08-05): `CheckInOutWidget`, which renders it
 * inline on `/attendance`, and `HeaderCheckInButton`, which renders it in a
 * modal from the fixed top bar. Extracted rather than duplicated so the
 * photo/coords requirement, the retry affordance, and the submit call all
 * have exactly one implementation — this is the flow the backend's own
 * validation expects, so a second divergent copy would be a real risk.
 *
 * Requests geolocation as soon as it mounts: this component is only ever
 * rendered once the user has already committed to checking in/out, so
 * there's no prompt-on-page-load concern — the permission prompt lands
 * exactly when they'd expect it.
 */
function AttendanceCaptureFlow({ isCheckedIn, onCancel, onDone }) {
  const { message } = App.useApp();
  const geolocation = useGeolocation();
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const action = isCheckedIn ? "check-out" : "check-in";

  useEffect(() => {
    geolocation.requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    setIsSubmitting(true);

    try {
      const payload = { coords: geolocation.coords, photo };

      if (isCheckedIn) {
        await checkOut(payload);
        message.success("Checked out successfully");
      } else {
        await checkIn(payload);
        message.success("Checked in successfully");
      }

      setPhoto(null);
      geolocation.reset();
      // Every other mounted `useMyAttendance` re-reads itself, so the header
      // timer and the `/attendance` widget never disagree about the state.
      notifyAttendanceChanged();
      onDone();
    } catch (error) {
      message.error(error.response?.data?.message || `Could not ${action} — please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setPhoto(null);
    geolocation.reset();
    onCancel();
  }

  const canConfirm = Boolean(photo) && Boolean(geolocation.coords);

  return (
    <div className="flex flex-col gap-4">
      <CameraCapture onPhotoChange={setPhoto} />

      <div>
        {geolocation.isLoading && <Alert type="info" message="Capturing your location..." />}
        {geolocation.error && (
          <Alert type="error" showIcon message="Location unavailable" description={geolocation.error} />
        )}
        {geolocation.coords && (
          <Alert
            type="success"
            showIcon
            icon={<EnvironmentOutlined />}
            message={`Location captured (${geolocation.coords.lat.toFixed(5)}, ${geolocation.coords.lng.toFixed(5)})`}
          />
        )}
        {geolocation.error && (
          <Button className="mt-2" icon={<ReloadOutlined />} onClick={geolocation.requestLocation}>
            Retry Location
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleCancel}>Cancel</Button>
        <Button type="primary" disabled={!canConfirm} loading={isSubmitting} onClick={handleConfirm}>
          Confirm {isCheckedIn ? "Check Out" : "Check In"}
        </Button>
      </div>
    </div>
  );
}

export default AttendanceCaptureFlow;
