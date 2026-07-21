import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Tag, Segmented, Space, Button, Popconfirm, message } from "antd";
import useLeaveList from "../hooks/useLeaveList";
import LeaveRequestModal from "./LeaveRequestModal";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { can } from "../../../utils/permission.utils";
import {
  requestLeave as requestLeaveApi,
  approveLeave as approveLeaveApi,
  markUnapprovedAbsence as markUnapprovedAbsenceApi,
} from "../api/leaveApi";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from "../constants/leave.constants";

/**
 * `/leave` — request + scope-tabbed list, per §7.5. Scope tabs are built
 * from whichever `leave.view*` grants the current user actually holds
 * (own/team/all), mirroring the same "check each scope's own permission"
 * design the backend's `listLeaves` uses rather than assuming a hierarchy.
 * Approve/mark-unapproved-absence are admin-only actions (§7.5: "manager can
 * view but not approve") — a manager viewing `scope=team` sees the same
 * table with no Actions column at all, not a disabled one.
 */
function LeaveListPage() {
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

  const employeeNameById = useMemo(() => new Map(users.map((directoryUser) => [directoryUser._id, directoryUser.name])), [users]);

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
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={LEAVE_STATUS_COLORS[status]}>{LEAVE_STATUS_LABELS[status]}</Tag>,
    },
    {
      title: "Double Deduction",
      dataIndex: "isDoubleDeduction",
      render: (isDoubleDeduction) => (isDoubleDeduction ? <Tag color="red">Yes (2x)</Tag> : "No"),
    },
    isAdmin && {
      title: "Actions",
      key: "actions",
      render: (_, leave) => (
        <Space>
          {leave.status === "pending" && (
            <Popconfirm title="Approve this leave request?" okText="Confirm Approval" onConfirm={() => handleApprove(leave)}>
              <Button size="small">Approve</Button>
            </Popconfirm>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={scopeOptions} value={scope} onChange={setScope} />
        <Space>
          <ReportDownloadButton module="leave" filters={{ scope }} filenamePrefix="leave" />
          <Button type="primary" onClick={() => setIsRequestOpen(true)}>
            Request Leave
          </Button>
        </Space>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={leaveRequests} loading={isLoading} />

      <LeaveRequestModal
        open={isRequestOpen}
        onCancel={() => setIsRequestOpen(false)}
        onSubmit={handleRequestLeave}
        isSubmitting={isSubmittingRequest}
      />
    </div>
  );
}

export default LeaveListPage;
