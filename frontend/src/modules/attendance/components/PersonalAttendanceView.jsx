import { useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Space } from "antd";
import CheckInOutWidget from "./CheckInOutWidget";
import AttendanceTimeline from "./AttendanceTimeline";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useMyAttendance from "../hooks/useMyAttendance";

/**
 * `/attendance` — the check-in/out widget plus a selectable-month timeline
 * of the caller's own attendance history (§7.4). The report download hits
 * the same `POST /reports/generate` dispatcher (§7.11) every other module's
 * report button uses, with `module: "attendance"` and a `{from, to}` date
 * range derived from whichever month is currently selected.
 */
function PersonalAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const monthKey = month.format("YYYY-MM");
  const { records, isLoading } = useMyAttendance(monthKey);

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

      <AttendanceTimeline records={records} isLoading={isLoading} />
    </div>
  );
}

export default PersonalAttendanceView;
