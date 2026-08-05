import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Button, Modal, Tooltip, Space, App } from "antd";
import {
  CaretRightOutlined,
  PauseOutlined,
  BorderOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
} from "@ant-design/icons";
import useMyAttendance from "../modules/attendance/hooks/useMyAttendance";
import { requestGeolocationOnce } from "../modules/attendance/hooks/useGeolocation";
import AttendanceCaptureFlow from "../modules/attendance/components/AttendanceCaptureFlow";
import { breakIn, breakOut } from "../modules/attendance/api/attendanceApi";
import { notifyAttendanceChanged } from "../modules/attendance/utils/attendanceEvents";

const CURRENT_MONTH = dayjs().format("YYYY-MM");

/**
 * Play / Pause / Stop attendance control for the fixed top strip
 * (2026-08-05) — extends the earlier header check-in button + timer into the
 * full shift state machine, so an entire day's attendance can be driven
 * without opening `/attendance`.
 *
 * **Lives in `layouts/`, not in the attendance module**, and imports that
 * module's hooks/API/components without modifying any of them. The state
 * machine below is not a second implementation of the rules — it mirrors
 * exactly what `CheckInOutWidget` derives from the same `openRecord`, and
 * every action goes through the same endpoints:
 *
 * | State | Controls |
 * |---|---|
 * | Not checked in | Play → check-in (camera + geolocation) |
 * | Checked in | Pause → break in · Stop → check out · live timer |
 * | On break | Play → break out (resume) · Stop DISABLED |
 * | Break already used | Pause disabled |
 *
 * Two rules are mirrored from the backend rather than re-derived, and both
 * are rendered as a DISABLED control with a Tooltip instead of a hidden one
 * — a control that vanishes leaves the user wondering what they did wrong,
 * whereas a disabled one with a reason explains itself:
 * - Check-out is rejected (409) while on break, so Stop is disabled then.
 * - One break per shift, so Pause is disabled once `breakOut` is set.
 *
 * Check-in AND check-out both require a photo server-side, so both open the
 * shared `AttendanceCaptureFlow` modal. Break in/out require geolocation
 * only and submit immediately — no camera step, matching the existing
 * widget's own behaviour exactly.
 *
 * Renders nothing for admin — handled by the caller (`MainLayout`), so the
 * component isn't even mounted and fires no `GET /attendance/me`.
 */
function HeaderAttendanceControl() {
  const { message } = App.useApp();
  const { openRecord, isLoading } = useMyAttendance(CURRENT_MONTH);
  const [captureMode, setCaptureMode] = useState(null); // "check-in" | "check-out"
  const [isSubmittingBreak, setIsSubmittingBreak] = useState(false);
  const [now, setNow] = useState(() => dayjs());

  const isCheckedIn = Boolean(openRecord);
  const isOnBreak = Boolean(openRecord?.breakIn?.time) && !openRecord?.breakOut?.time;
  const hasUsedBreak = Boolean(openRecord?.breakIn?.time) && Boolean(openRecord?.breakOut?.time);

  useEffect(() => {
    if (!isCheckedIn) {
      return undefined;
    }

    const interval = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  async function runBreakAction(action, successMessage) {
    setIsSubmittingBreak(true);

    try {
      const coords = await requestGeolocationOnce();
      await action({ coords });
      message.success(successMessage);
      // Keeps the `/attendance` widget and this control in agreement — see
      // `attendanceEvents.js`.
      notifyAttendanceChanged();
    } catch (error) {
      message.error(error.response?.data?.message || error.message || "Could not update your break — please try again.");
    } finally {
      setIsSubmittingBreak(false);
    }
  }

  if (isLoading) {
    return null;
  }

  return (
    <>
      <Space size={4} data-testid="header-attendance-control">
        {isCheckedIn && (
          <span
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-medium ${
              isOnBreak ? "border-amber-300 bg-amber-400/20 text-amber-100" : "border-white/20 bg-white/10 text-white"
            }`}
            data-testid="header-elapsed-timer"
          >
            {isOnBreak ? (
              <CoffeeOutlined data-testid="header-on-break-icon" />
            ) : (
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            )}
            <ClockCircleOutlined />
            {formatElapsed(openRecord.checkIn?.time, now)}
            {isOnBreak && <span className="text-xs">On break</span>}
          </span>
        )}

        {/* PLAY — check in when idle, resume when on break. */}
        {(!isCheckedIn || isOnBreak) && (
          <Tooltip title={isOnBreak ? "Resume — end your break" : "Check in"}>
            <Button
              size="small"
              icon={<CaretRightOutlined />}
              loading={isOnBreak && isSubmittingBreak}
              aria-label={isOnBreak ? "Resume" : "Check in"}
              onClick={() =>
                isOnBreak ? runBreakAction(breakOut, "Break ended") : setCaptureMode("check-in")
              }
            />
          </Tooltip>
        )}

        {/* PAUSE — only meaningful while actively working. Disabled rather
            than hidden once the shift's single break is spent. */}
        {isCheckedIn && !isOnBreak && (
          <Tooltip title={hasUsedBreak ? "You've already used your one break for this shift" : "Pause — start your break"}>
            {/* AntD skips a Tooltip on a disabled button unless it's wrapped,
                and the explanation is the entire point here. */}
            <span>
              <Button
                size="small"
                icon={<PauseOutlined />}
                disabled={hasUsedBreak}
                loading={isSubmittingBreak}
                aria-label="Pause"
                onClick={() => runBreakAction(breakIn, "Break started")}
              />
            </span>
          </Tooltip>
        )}

        {/* STOP — check out. Disabled during a break because the backend
            rejects it outright (409); rendering it enabled would guarantee
            a failed request. */}
        {isCheckedIn && (
          <Tooltip title={isOnBreak ? "End your break before checking out" : "Check out"}>
            <span>
              <Button
                size="small"
                danger
                icon={<BorderOutlined />}
                disabled={isOnBreak}
                aria-label="Check out"
                onClick={() => setCaptureMode("check-out")}
              />
            </span>
          </Tooltip>
        )}
      </Space>

      <Modal
        title={captureMode === "check-out" ? "Check Out" : "Check In"}
        open={Boolean(captureMode)}
        onCancel={() => setCaptureMode(null)}
        footer={null}
        destroyOnHidden
      >
        <AttendanceCaptureFlow
          isCheckedIn={captureMode === "check-out"}
          onCancel={() => setCaptureMode(null)}
          onDone={() => setCaptureMode(null)}
        />
      </Modal>
    </>
  );
}

function formatElapsed(checkInTime, now) {
  const diffSeconds = Math.max(0, now.diff(dayjs(checkInTime), "second"));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default HeaderAttendanceControl;
