import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, Spin, Tag, Tooltip, message } from "antd";
import { EnvironmentOutlined, ReloadOutlined } from "@ant-design/icons";
import useMyAttendance from "../hooks/useMyAttendance";
import useGeolocation from "../hooks/useGeolocation";
import useCheckedInHeartbeatLoop from "../hooks/useCheckedInHeartbeatLoop";
import CameraCapture from "./CameraCapture";
import { checkIn, checkOut } from "../api/attendanceApi";

const CURRENT_MONTH = dayjs().format("YYYY-MM");

/**
 * The primary daily action: check in at the start of a shift, check out at
 * the end. Fetches current status on mount rather than assuming — the
 * "already checked in" case (page loaded mid-shift) is a real, explicit
 * requirement, not just a nice-to-have.
 *
 * Deliberately lives only on `/attendance` (not also duplicated onto
 * `/dashboard`) — Dashboard's own composition is Phase 9's still-unbuilt
 * "Dashboard polish" (§7.13/§10), out of scope for this task; adding it
 * there too would mean guessing at a layout that task hasn't designed yet.
 */
function CheckInOutWidget() {
  const { openRecord, isLoading, refetch } = useMyAttendance(CURRENT_MONTH);
  const geolocation = useGeolocation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => dayjs());

  const isCheckedIn = Boolean(openRecord);
  const action = isCheckedIn ? "check-out" : "check-in";

  useEffect(() => {
    if (!isCheckedIn) {
      return undefined;
    }

    const interval = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  // Driven by the same `isCheckedIn` boolean as the elapsed-time ticker
  // above — starts on a fresh check-in AND resumes correctly if the page
  // loads mid-shift (isCheckedIn is already true on first render), with no
  // separate code path for either case. See the hook itself for the
  // interval values and the visibilitychange pause/resume behavior.
  useCheckedInHeartbeatLoop(isCheckedIn);

  function handleStartCapture() {
    setIsCapturing(true);
    setPhoto(null);
    geolocation.reset();
    geolocation.requestLocation();
  }

  function handleCancelCapture() {
    setIsCapturing(false);
    setPhoto(null);
    geolocation.reset();
  }

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

      setIsCapturing(false);
      setPhoto(null);
      geolocation.reset();
      refetch();
    } catch {
      message.error(`Could not ${action} — please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      </Card>
    );
  }

  const canConfirm = Boolean(photo) && Boolean(geolocation.coords);

  return (
    <Card title="Attendance">
      {!isCapturing && (
        <div className="flex items-center justify-between">
          {isCheckedIn ? (
            <div>
              <Tag color="green">Checked In</Tag>
              <Tooltip title="Sending periodic heartbeat + location pings while you're checked in">
                <span
                  className="ml-1 inline-flex items-center gap-1 text-xs text-gray-400"
                  data-testid="tracking-indicator"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  Tracking active
                </span>
              </Tooltip>
              <div className="mt-2 text-lg" data-testid="elapsed-time">
                Elapsed: {formatElapsed(openRecord.checkIn.time, now)}
              </div>
            </div>
          ) : (
            <Tag>Not Checked In</Tag>
          )}

          <Button type="primary" onClick={handleStartCapture}>
            {isCheckedIn ? "Check Out" : "Check In"}
          </Button>
        </div>
      )}

      {isCapturing && (
        <div className="flex flex-col gap-4">
          <CameraCapture onPhotoChange={setPhoto} />

          <div>
            {geolocation.isLoading && <Alert type="info" message="Capturing your location..." />}
            {geolocation.error && <Alert type="error" showIcon message="Location unavailable" description={geolocation.error} />}
            {geolocation.coords && (
              <Alert
                type="success"
                showIcon
                icon={<EnvironmentOutlined />}
                message={`Location captured (${geolocation.coords.lat.toFixed(5)}, ${geolocation.coords.lng.toFixed(5)})`}
              />
            )}
            {geolocation.error && (
              <Button
                className="mt-2"
                icon={<ReloadOutlined />}
                onClick={geolocation.requestLocation}
              >
                Retry Location
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCancelCapture}>Cancel</Button>
            <Button
              type="primary"
              disabled={!canConfirm}
              loading={isSubmitting}
              onClick={handleConfirm}
            >
              Confirm {isCheckedIn ? "Check Out" : "Check In"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatElapsed(checkInTime, now) {
  const diffSeconds = Math.max(0, now.diff(dayjs(checkInTime), "second"));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default CheckInOutWidget;
