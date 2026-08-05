import { useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Space } from "antd";
import CheckInOutWidget from "./CheckInOutWidget";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import AttendanceSummaryStats from "./AttendanceSummaryStats";
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
 * Note: admin never actually reaches this view — `AttendancePage.jsx`
 * routes admin to `AdminAttendanceView` instead (§7.4 reversal, the org-wide
 * redefinition of `/attendance` for admin). This component still exists
 * unchanged for Manager/Employee/Sales Associate.
 */
function PersonalAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const monthKey = month.format("YYYY-MM");
  const { records, isLoading } = useMyAttendance(monthKey);
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  const from = month.startOf("month").format("YYYY-MM-DD");
  const to = month.endOf("month").format("YYYY-MM-DD");

  return (
    <div className="flex flex-col gap-4">
      {/* §B1 — stat cards ABOVE the filters, on every tab. */}
      <AttendanceSummaryStats records={records} month={month} />

      {/* Admin accounts don't track attendance at all (§7.4c) — the backend
          already rejects an admin's own check-in (403), but hiding the
          widget here too means an admin never even sees a check-in prompt
          in the first place, not just a rejected attempt. */}
      {!isAdmin && <CheckInOutWidget />}

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
        // Hard rule (§7.4c), not permission-based: viewing your OWN record
        // never shows photo/location, no matter your role or grants — the
        // backend already strips both from GET /attendance/me's response,
        // this just tells the photo-viewer modal to omit the sections
        // entirely rather than show an empty "No photo"/"No coordinates"
        // placeholder that would look like a data problem.
        showPhotos={false}
        showLocation={false}
      />
    </div>
  );
}

export default PersonalAttendanceView;
