import { Empty, Tooltip } from "antd";
import dayjs from "dayjs";
import { LEAVE_TYPE_LABELS } from "../constants/leave.constants";

// One row per team member, one column per day of the selected month —
// chosen over a single combined day-grid (Attendance's calendar-view shape)
// because a leave request spans a date RANGE and several employees can be
// on leave the same day; a shared per-day cell would either only show one
// employee at a time or need to stack multiple entries into one cell. A row
// per employee keeps every person's leave span visually distinct as its own
// horizontal run of colored cells, with no overlap to resolve.
const LEAVE_TYPE_CELL_CLASSES = {
  paid: "bg-green-400",
  unpaid: "bg-blue-400",
  unapproved_absence: "bg-red-400",
};

function TeamLeaveCalendar({ month, leaveRequests, employeeNameById }) {
  const approvedLeaves = leaveRequests.filter((leave) => leave.status === "approved");
  const daysInMonth = month.daysInMonth();
  const employeeIds = [...new Set(approvedLeaves.map((leave) => String(leave.employeeId)))];

  if (employeeIds.length === 0) {
    return <Empty description="No approved leave this month" className="!py-8" />;
  }

  function findLeave(employeeId, day) {
    const cellDate = month.date(day);

    return approvedLeaves.find(
      (leave) =>
        String(leave.employeeId) === employeeId &&
        !cellDate.isBefore(dayjs(leave.startDate), "day") &&
        !cellDate.isAfter(dayjs(leave.endDate), "day")
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[140px] bg-white px-2 py-1 text-left font-medium text-gray-600">
                Employee
              </th>
              {Array.from({ length: daysInMonth }, (_, index) => (
                <th key={index} className="w-7 px-0.5 py-1 text-center font-normal text-gray-400">
                  {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employeeIds.map((employeeId) => (
              <tr key={employeeId}>
                <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium text-gray-700">
                  {employeeNameById.get(employeeId) || "Unknown"}
                </td>
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const leave = findLeave(employeeId, day);
                  const cellClass = leave ? LEAVE_TYPE_CELL_CLASSES[leave.type] : "bg-gray-50";

                  return (
                    <td key={day} className="border border-gray-100 p-0">
                      <Tooltip
                        title={
                          leave
                            ? `${LEAVE_TYPE_LABELS[leave.type]}${leave.isHalfDay ? " (half day)" : ""}`
                            : undefined
                        }
                      >
                        <div
                          data-testid={`leave-cell-${employeeId}-${month.format("YYYY-MM")}-${day}`}
                          data-leave-type={leave?.type || ""}
                          className={`h-6 w-full ${cellClass}`}
                        />
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
        <LegendSwatch className="bg-green-400" label="Paid" />
        <LegendSwatch className="bg-blue-400" label="Unpaid" />
        <LegendSwatch className="bg-red-400" label="Unapproved Absence" />
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

export default TeamLeaveCalendar;
