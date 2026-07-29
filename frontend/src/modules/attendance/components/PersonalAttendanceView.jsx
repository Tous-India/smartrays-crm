import { useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Space } from "antd";
import CheckInOutWidget from "./CheckInOutWidget";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useMyAttendance from "../hooks/useMyAttendance";
import useSessionStore from "../../../store/sessionStore";

/**
 * `/attendance` — the check-in/out widget plus a selectable-month view of
 * the caller's own attendance history (§7.4), plus (§7.4 addition) summary
 * stats and a List/Calendar toggle via the shared `AttendanceRecordsSection`.
 * The report download hits the same `POST /reports/generate` dispatcher
 * (§7.11) every other module's report button uses, with `module:
 * "attendance"` and a `{from, to}` date range derived from whichever month
 * is currently selected.
 *
 * `canCorrect`/`defaultEmployeeId` (admin manual-correction, §7.4 addition)
 * — an admin can correct their OWN attendance too, not just a report's;
 * `defaultEmployeeId` is always the logged-in user's own id here (always a
 * valid target, unlike Team's "which employee is selected" question).
 */
function PersonalAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const monthKey = month.format("YYYY-MM");
  const { records, isLoading, refetch } = useMyAttendance(monthKey);
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  const from = month.startOf("month").format("YYYY-MM-DD");
  const to = month.endOf("month").format("YYYY-MM-DD");

  return (
    <div className="flex flex-col gap-4">
      <CheckInOutWidget />

      <div className="flex items-center justify-between">
        <DatePicker picker="month" value={month} allowClear={false} onChange={(value) => setMonth(value || dayjs())} />
        <Space>
          <ReportDownloadButton module="attendance" filters={{ from, to }} filenamePrefix="my-attendance" />
        </Space>
      </div>

      <AttendanceRecordsSection
        records={records}
        isLoading={isLoading}
        month={month}
        canCorrect={isAdmin}
        defaultEmployeeId={user?._id}
        onChanged={refetch}
      />
    </div>
  );
}

export default PersonalAttendanceView;
