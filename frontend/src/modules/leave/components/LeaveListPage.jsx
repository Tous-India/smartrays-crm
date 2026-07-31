import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Tag, Segmented, Space, Button, Popconfirm, DatePicker, App } from "antd";
import useLeaveList from "../hooks/useLeaveList";
import LeaveRequestModal from "./LeaveRequestModal";
import LeaveDeclineModal from "./LeaveDeclineModal";
import LeaveBalanceCard from "./LeaveBalanceCard";
import TeamLeaveCalendar from "./TeamLeaveCalendar";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { can } from "../../../utils/permission.utils";
import {
  requestLeave as requestLeaveApi,
  approveLeave as approveLeaveApi,
  declineLeave as declineLeaveApi,
  markUnapprovedAbsence as markUnapprovedAbsenceApi,
  getLeaveBalance as getLeaveBalanceApi,
} from "../api/leaveApi";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from "../constants/leave.constants";

/**
 * `/leave` — request + scope-tabbed list, per §7.5. Scope tabs are built
 * from whichever `leave.view*` grants the current user actually holds
 * (own/team/all), mirroring the same "check each scope's own permission"
 * design the backend's `listLeaves` uses rather than assuming a hierarchy.
 * Approve/Decline/mark-unapproved-absence are admin-only actions (§7.5:
 * "manager can view but not approve") — a manager viewing `scope=team` sees
 * the same table with no Actions column at all, not a disabled one.
 */
function LeaveListPage() {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const isAdmin = user?.role === "admin";

  const scopeOptions = useMemo(
    () =>
      [
        can(user, "leave", "view") && { value: "own", label: "Own" },
        can(user, "leave", "view_team") && { value: "team", label: "Team" },
        can(user, "leave", "view_all") && { value: "all", label: "All" },
      ].filter(Boolean),
    [user]
  );

  const [scope, setScope] = useState(scopeOptions[0]?.value || "own");
  const { leaveRequests, isLoading, refetch } = useLeaveList(scope);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs());
  const [balancesByEmployeeId, setBalancesByEmployeeId] = useState(new Map());

  const employeeNameById = useMemo(() => new Map(users.map((directoryUser) => [directoryUser._id, directoryUser.name])), [users]);

  // Per-row "Paid Leave Balance" (team/all scope only) — batch-fetches the
  // balance of every distinct employee currently listed, reusing the exact
  // same `GET /leave/balance` this page's own top-of-page card calls, rather
  // than re-deriving the quota math client-side.
  useEffect(() => {
    if (scope === "own") {
      setBalancesByEmployeeId(new Map());
      return undefined;
    }

    const uniqueEmployeeIds = [...new Set(leaveRequests.map((leave) => String(leave.employeeId)))];

    if (uniqueEmployeeIds.length === 0) {
      setBalancesByEmployeeId(new Map());
      return undefined;
    }

    let cancelled = false;

    Promise.all(
      uniqueEmployeeIds.map((employeeId) =>
        getLeaveBalanceApi(employeeId)
          .then((response) => [employeeId, response.data.data])
          .catch(() => [employeeId, null])
      )
    ).then((entries) => {
      if (!cancelled) {
        setBalancesByEmployeeId(new Map(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [scope, leaveRequests]);

  async function handleRequestLeave(payload) {
    setIsSubmittingRequest(true);

    try {
      await requestLeaveApi(payload);
      message.success("Leave requested");
      setIsRequestOpen(false);
      refetch();
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleApprove(leave) {
    await approveLeaveApi(leave._id);
    message.success("Leave approved");
    refetch();
  }

  async function handleDecline(reason) {
    setIsSubmittingDecline(true);

    try {
      await declineLeaveApi(declineTarget._id, reason);
      message.success("Leave declined");
      setDeclineTarget(null);
      refetch();
    } finally {
      setIsSubmittingDecline(false);
    }
  }

  async function handleMarkAbsence(leave) {
    await markUnapprovedAbsenceApi(leave._id);
    message.success("Marked as an unapproved absence — 2x deduction applied");
    refetch();
  }

  const columns = [
    scope !== "own" && {
      title: "Employee",
      dataIndex: "employeeId",
      render: (employeeId) => employeeNameById.get(String(employeeId)) || "Unknown",
    },
    {
      title: "Start Date",
      dataIndex: "startDate",
      render: (date) => dayjs(date).format("DD MMM YYYY"),
    },
    {
      title: "End Date",
      dataIndex: "endDate",
      render: (date) => dayjs(date).format("DD MMM YYYY"),
    },
    {
      title: "Type",
      dataIndex: "type",
      render: (type) => LEAVE_TYPE_LABELS[type],
    },
    {
      title: "Half Day",
      dataIndex: "isHalfDay",
      render: (isHalfDay) => (isHalfDay ? <Tag color="cyan">Half Day</Tag> : "No"),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status, leave) => (
        <Space direction="vertical" size={0}>
          <Tag color={LEAVE_STATUS_COLORS[status]}>{LEAVE_STATUS_LABELS[status]}</Tag>
          {status === "rejected" && leave.declineReason && (
            <span className="text-xs text-gray-400">{leave.declineReason}</span>
          )}
        </Space>
      ),
    },
    {
      title: "Double Deduction",
      dataIndex: "isDoubleDeduction",
      render: (isDoubleDeduction) => (isDoubleDeduction ? <Tag color="red">Yes (2x)</Tag> : "No"),
    },
    scope !== "own" && {
      title: "Paid Leave Balance",
      key: "balance",
      render: (_, leave) => {
        const balance = balancesByEmployeeId.get(String(leave.employeeId));
        return balance ? `${balance.paidLeaveUsed} / ${balance.paidLeaveLimit} used` : "—";
      },
    },
    isAdmin && {
      title: "Actions",
      key: "actions",
      render: (_, leave) => (
        <Space>
          {leave.status === "pending" && (
            <>
              <Popconfirm title="Approve this leave request?" okText="Confirm Approval" onConfirm={() => handleApprove(leave)}>
                <Button size="small">Approve</Button>
              </Popconfirm>
              <Button size="small" danger onClick={() => setDeclineTarget(leave)}>
                Decline
              </Button>
            </>
          )}
          <Popconfirm
            title="Mark as an unapproved absence?"
            description="This counts as a DOUBLE (2x) deduction against this employee's leave balance, regardless of the request's current status."
            okText="Mark Absence (2x)"
            okType="danger"
            onConfirm={() => handleMarkAbsence(leave)}
          >
            <Button size="small" danger>
              Mark Unapproved Absence
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <LeaveBalanceCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
          <Segmented options={scopeOptions} value={scope} onChange={setScope} />
          <Segmented
            options={[
              { value: "list", label: "List" },
              { value: "calendar", label: "Calendar" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          {viewMode === "calendar" && (
            <DatePicker picker="month" value={calendarMonth} onChange={(value) => value && setCalendarMonth(value)} allowClear={false} />
          )}
        </Space>
        <Space>
          <ReportDownloadButton module="leave" filters={{ scope }} filenamePrefix="leave" />
          <Button type="primary" onClick={() => setIsRequestOpen(true)}>
            Request Leave
          </Button>
        </Space>
      </div>

      {viewMode === "calendar" ? (
        <TeamLeaveCalendar month={calendarMonth} leaveRequests={leaveRequests} employeeNameById={employeeNameById} />
      ) : (
        <Table rowKey="_id" columns={columns} dataSource={leaveRequests} loading={isLoading} />
      )}

      <LeaveRequestModal
        open={isRequestOpen}
        onCancel={() => setIsRequestOpen(false)}
        onSubmit={handleRequestLeave}
        isSubmitting={isSubmittingRequest}
      />

      <LeaveDeclineModal
        open={Boolean(declineTarget)}
        onCancel={() => setDeclineTarget(null)}
        onSubmit={handleDecline}
        isSubmitting={isSubmittingDecline}
      />
    </div>
  );
}

export default LeaveListPage;
