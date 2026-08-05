import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Button, Modal, Tooltip } from "antd";
import { ClockCircleOutlined, LoginOutlined } from "@ant-design/icons";
import useMyAttendance from "../hooks/useMyAttendance";
import AttendanceCaptureFlow from "./AttendanceCaptureFlow";

const CURRENT_MONTH = dayjs().format("YYYY-MM");

/**
 * Compact check-in control for the fixed top bar (2026-08-05), so starting a
 * shift never requires navigating to `/attendance` first.
 *
 * Two states, never both:
 * - Not checked in → a small "Check In" button, which opens the SAME
 *   camera + geolocation flow `/attendance` uses (`AttendanceCaptureFlow`,
 *   extracted for exactly this reason) in a modal.
 * - Checked in → a live elapsed-time badge, ticking every second, replacing
 *   the button entirely. Clicking it opens the same flow to check out.
 *
 * Renders nothing at all for admin: admin accounts are exempt from
 * attendance (§7.4c) and the backend rejects their check-in outright, so a
 * button here would be a guaranteed 403 — the same reasoning
 * `PersonalAttendanceView` already applies to the full widget.
 *
 * The ticking interval only runs while checked in, so a signed-in user who
 * isn't on shift has no timer running at all.
 */
function HeaderCheckInButton() {
  const { openRecord, isLoading } = useMyAttendance(CURRENT_MONTH);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [now, setNow] = useState(() => dayjs());

  const isCheckedIn = Boolean(openRecord);

  useEffect(() => {
    if (!isCheckedIn) {
      return undefined;
    }

    const interval = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      {isCheckedIn ? (
        <Tooltip title="You're checked in — click to check out">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            data-testid="header-elapsed-timer"
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-sm font-medium text-white hover:bg-white/20"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <ClockCircleOutlined />
            {formatElapsed(openRecord.checkIn?.time, now)}
          </button>
        </Tooltip>
      ) : (
        <Tooltip title="Check in for your shift">
          <Button size="small" icon={<LoginOutlined />} onClick={() => setIsModalOpen(true)}>
            Check In
          </Button>
        </Tooltip>
      )}

      <Modal
        title={isCheckedIn ? "Check Out" : "Check In"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <AttendanceCaptureFlow
          isCheckedIn={isCheckedIn}
          onCancel={() => setIsModalOpen(false)}
          onDone={() => setIsModalOpen(false)}
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

export default HeaderCheckInButton;
