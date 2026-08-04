import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Tag, Segmented, Space, Button, Popconfirm, DatePicker, Select, Tooltip, Typography, App } from "antd";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import useLeaveList from "../hooks/useLeaveList";
import LeaveRequestModal from "./LeaveRequestModal";
import LeaveDeclineModal from "./LeaveDeclineModal";
import LeaveBalanceCard from "./LeaveBalanceCard";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useTeams from "../../team/hooks/useTeams";
import useSessionStore from "../../../store/sessionStore";
import { usePermission } from "../../../hooks/usePermission";
import { can } from "../../../utils/permission.utils";
import { listUsers } from "../../user/api/userApi";
import {
  requestLeave as requestLeaveApi,
  approveLeave as approveLeaveApi,
  declineLeave as declineLeaveApi,
  markUnapprovedAbsence as markUnapprovedAbsenceApi,
  deleteLeave as deleteLeaveApi,
  getLeaveBalance as getLeaveBalanceApi,
} from "../api/leaveApi";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS, LEAVE_STATUSES } from "../constants/leave.constants";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const EMPTY_ADMIN_FILTERS = { employeeId: "", teamId: "", status: "", dateRange: null };

/**
 * `/leave` (restructured 2026-07-31, §7.5e) — list/table only now, no
 * calendar view and no "All" tab (see below). Tabs are role-shaped, not
 * purely permission-derived like before:
 *
 * - **Admin** gets no tabs at all — a single unified, filterable view of
 *   every request org-wide (the Admin filter bar below), always active.
 *   This mirrors `AdminAttendanceView`'s own "admin gets a structurally
 *   different view, branched explicitly" precedent rather than trying to
 *   force it through the same permission-derived tab logic as everyone
 *   else, since admin's `can()` bypass would otherwise make every scope
 *   "available" and defeat the point of removing the All tab.
 * - **Everyone else** gets tabs built from whichever of `leave.view`/
 *   `view_team` they actually hold (never `view_all` — that tier has no
 *   tab anymore, full stop). A manager holds both by default (§7.5d) and
 *   sees "Own"/"Team"; a plain employee/sales_associate holds only `view`
 *   and sees no tab UI at all, just their own list — the same "don't show
 *   a lone toggle with one real choice" reasoning already applied
 *   elsewhere in this app.
 *
 * Approve/Decline/Mark Unapproved Absence/Delete (§7.5c/§7.5d) each gate on
 * their own `usePermission` check, not a blanket `isAdmin` flag — see the
 * original §7.5c comment (preserved below) for why no extra per-row "is
 * this my team?" check is needed on top of that. **Icon-only, Tooltip-
 * labeled (§7.5f, 2026-08-04)** — matches the established icon+Tooltip+
 * `aria-label` action-button pattern (`CustomerStatusToggleButton.jsx`,
 * `LeadsTable.jsx`) instead of this table's own previous text-label
 * buttons. **Reason is a real column now, not an expandable row (§7.5f)** —
 * truncated via `Typography.Text`'s `ellipsis.tooltip`, full text on hover.
 */
function LeaveListPage() {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const { teams } = useTeams();
  const isAdmin = user?.role === "admin";
  const canApprove = usePermission("leave", "approve");
  const canDecline = usePermission("leave", "decline");
  const canMarkAbsence = usePermission("leave", "mark_unapproved_absence");
  const canDelete = usePermission("leave", "delete");
  const canActOnLeave = canApprove || canDecline || canMarkAbsence || canDelete;

  // Never includes "all" — the All tab is gone for good (§7.5e). Admin's
  // own unified view is handled entirely by the `isAdmin` branch below,
  // not through this permission-derived list.
  const scopeOptions = useMemo(
    () =>
      [
        can(user, "leave", "view") && { value: "own", label: "Own" },
        can(user, "leave", "view_team") && { value: "team", label: "Team" },
      ].filter(Boolean),
    [user]
  );

  const [scope, setScope] = useState(scopeOptions[0]?.value || "own");
  const effectiveScope = isAdmin ? "all" : scope;
  const showScopeTabs = !isAdmin && scopeOptions.length > 1;

  const { leaveRequests, isLoading, refetch } = useLeaveList(effectiveScope);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);
  const [balancesByEmployeeId, setBalancesByEmployeeId] = useState(new Map());
  const [adminFilters, setAdminFilters] = useState(EMPTY_ADMIN_FILTERS);
  const [teamDirectory, setTeamDirectory] = useState([]);

  const employeeNameById = useMemo(() => new Map(users.map((directoryUser) => [directoryUser._id, directoryUser.name])), [users]);

  // Full user roster (managerId included, unlike the lightweight
  // `useUserDirectory()` dropdown above) — only fetched for the Admin
  // table's Team filter, which needs to know each employee's manager to
  // group by. Gated the same way `LeavePendingRequestsWidget`/
  // `AdminAttendanceView` gate their own effects: no fetch at all unless
  // this specific feature actually needs it.
  useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }

    let cancelled = false;

    listUsers({})
      .then((response) => {
        if (!cancelled) {
          setTeamDirectory(response.data.data);
        }
      })
      .catch(() => {
        // Team filter degrades to "All teams" only — not worth failing the
        // whole page over a filter option list.
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const managerIdByEmployeeId = useMemo(
    () => new Map(teamDirectory.map((directoryUser) => [String(directoryUser._id), directoryUser.managerId ? String(directoryUser.managerId) : null])),
    [teamDirectory]
  );

  // Built against the real `Team` entity (`useTeams()`), not a manager-list
  // stand-in — the earlier version of this filter derived "teams" from
  // `teamDirectory.filter(role === "manager")`, which silently excluded any
  // team headed by an admin (a real team in this data set has exactly that
  // shape) and was the actual bug behind "the one existing team isn't
  // showing up" (§7.5e fix).
  const teamOptions = useMemo(
    () => [{ value: "", label: "All teams" }, ...teams.map((team) => ({ value: team._id, label: team.name }))],
    [teams]
  );

  const filterEmployeeOptions = useMemo(() => {
    const uniqueEmployeeIds = [...new Set(leaveRequests.map((leave) => String(leave.employeeId)))];

    return [
      { value: "", label: "All employees" },
      ...uniqueEmployeeIds.map((employeeId) => ({ value: employeeId, label: employeeNameById.get(employeeId) || employeeId })),
    ];
  }, [leaveRequests, employeeNameById]);

  const statusFilterOptions = useMemo(
    () => [{ value: "", label: "All statuses" }, ...LEAVE_STATUSES.map((status) => ({ value: status, label: LEAVE_STATUS_LABELS[status] }))],
    []
  );

  // Client-side, same reasoning as `TeamAttendanceView`'s/`AdminAttendanceView`'s
  // own filters — the backend has no query params for these, and the Admin
  // table's dataset (scope=all) is already fully fetched. Overlap check (not
  // a strict startDate match) so a multi-day request showing up under any
  // date the selected range touches, not just its exact start.
  const displayedLeaveRequests = useMemo(() => {
    if (!isAdmin) {
      return leaveRequests;
    }

    return leaveRequests.filter((leave) => {
      if (adminFilters.employeeId && String(leave.employeeId) !== adminFilters.employeeId) {
        return false;
      }

      if (adminFilters.status && leave.status !== adminFilters.status) {
        return false;
      }

      if (adminFilters.teamId) {
        const team = teams.find((candidate) => candidate._id === adminFilters.teamId);
        if (!team || managerIdByEmployeeId.get(String(leave.employeeId)) !== String(team.headManagerId)) {
          return false;
        }
      }

      if (adminFilters.dateRange?.[0] && adminFilters.dateRange?.[1]) {
        const rangeStartMs = adminFilters.dateRange[0].startOf("day").valueOf();
        const rangeEndMs = adminFilters.dateRange[1].endOf("day").valueOf();
        const leaveStartMs = dayjs(leave.startDate).valueOf();
        const leaveEndMs = dayjs(leave.endDate).valueOf();

        if (leaveEndMs < rangeStartMs || leaveStartMs > rangeEndMs) {
          return false;
        }
      }

      return true;
    });
  }, [leaveRequests, adminFilters, isAdmin, teams, managerIdByEmployeeId]);

  // Per-row "Paid Leave Balance" (team/all scope only) — batch-fetches the
  // balance of every distinct employee currently listed, reusing the exact
  // same `GET /leave/balance` this page's own top-of-page card calls, rather
  // than re-deriving the quota math client-side.
  useEffect(() => {
    if (effectiveScope === "own") {
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
  }, [effectiveScope, leaveRequests]);

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

  async function handleDelete(leave) {
    await deleteLeaveApi(leave._id);
    message.success("Leave request deleted");
    refetch();
  }

  const columns = [
    effectiveScope !== "own" && {
      title: "Employee",
      dataIndex: "employeeId",
      width: 160,
      render: (employeeId) => employeeNameById.get(String(employeeId)) || "Unknown",
    },
    {
      title: "Start Date",
      dataIndex: "startDate",
      width: 130,
      render: (date) => dayjs(date).format("DD MMM YYYY"),
    },
    {
      title: "End Date",
      dataIndex: "endDate",
      width: 130,
      render: (date) => dayjs(date).format("DD MMM YYYY"),
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 110,
      render: (type) => LEAVE_TYPE_LABELS[type],
    },
    {
      title: "Half Day",
      dataIndex: "isHalfDay",
      width: 110,
      render: (isHalfDay) => (isHalfDay ? <Tag color="cyan">Half Day</Tag> : "No"),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 180,
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
      width: 150,
      render: (isDoubleDeduction) => (isDoubleDeduction ? <Tag color="red">Yes (2x)</Tag> : "No"),
    },
    {
      // A real column now, not an expandable row (§7.5f, 2026-08-04) — the
      // table already scrolls horizontally, so this fits fine width-wise.
      // Truncated with `Typography.Text`'s built-in `ellipsis.tooltip`
      // rather than a custom CSS truncation + a second Tooltip component —
      // same "hover for the full value" affordance as everywhere else in
      // this app, one line of markup instead of a bespoke implementation.
      title: "Reason",
      dataIndex: "reason",
      width: 220,
      render: (reason) => (
        <Text ellipsis={{ tooltip: reason }} style={{ maxWidth: 200 }}>
          {reason}
        </Text>
      ),
    },
    effectiveScope !== "own" && {
      title: "Paid Leave Balance",
      key: "balance",
      width: 170,
      render: (_, leave) => {
        const balance = balancesByEmployeeId.get(String(leave.employeeId));
        return balance ? `${balance.paidLeaveUsed} / ${balance.paidLeaveLimit} used` : "—";
      },
    },
    canActOnLeave && {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, leave) => (
        <Space>
          {leave.status === "pending" && (
            <>
              {canApprove && (
                <Popconfirm title="Approve this leave request?" okText="Confirm Approval" onConfirm={() => handleApprove(leave)}>
                  <Tooltip title="Approve">
                    <Button type="text" size="small" icon={<CheckOutlined />} aria-label="Approve" />
                  </Tooltip>
                </Popconfirm>
              )}
              {canDecline && (
                <Tooltip title="Decline">
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<CloseOutlined />}
                    aria-label="Decline"
                    onClick={() => setDeclineTarget(leave)}
                  />
                </Tooltip>
              )}
            </>
          )}
          {canMarkAbsence && (
            <Popconfirm
              title="Mark as an unapproved absence?"
              description="This counts as a DOUBLE (2x) deduction against this employee's leave balance, regardless of the request's current status."
              okText="Mark Absence (2x)"
              okType="danger"
              onConfirm={() => handleMarkAbsence(leave)}
            >
              <Tooltip title="Mark Unapproved Absence">
                <Button type="text" danger size="small" icon={<ExclamationCircleOutlined />} aria-label="Mark Unapproved Absence" />
              </Tooltip>
            </Popconfirm>
          )}
          {canDelete && (
            <Popconfirm
              title="Delete this leave request?"
              description="This cannot be undone."
              okText="Confirm Delete"
              okType="danger"
              onConfirm={() => handleDelete(leave)}
            >
              <Tooltip title="Delete">
                <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="Delete" />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <LeaveBalanceCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
          {showScopeTabs && <Segmented options={scopeOptions} value={scope} onChange={setScope} />}
        </Space>
        <Space>
          <ReportDownloadButton module="leave" filters={{ scope: effectiveScope }} filenamePrefix="leave" />
          {/* Admin exemption (§7.5c, 2026-07-31): admin accounts don't
              request leave for themselves — the backend rejects it outright,
              so the button is hidden here rather than surfacing a request
              that would always 403. */}
          {!isAdmin && (
            <Button type="primary" onClick={() => setIsRequestOpen(true)}>
              Request Leave
            </Button>
          )}
        </Space>
      </div>

      {isAdmin && (
        <Space wrap>
          <Select
            aria-label="Employee"
            value={adminFilters.employeeId}
            options={filterEmployeeOptions}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, employeeId: value }))}
          />
          <Select
            aria-label="Team"
            value={adminFilters.teamId}
            options={teamOptions}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, teamId: value }))}
          />
          <Select
            aria-label="Status"
            value={adminFilters.status}
            options={statusFilterOptions}
            style={{ width: 160 }}
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, status: value }))}
          />
          <RangePicker
            aria-label="Date range"
            value={adminFilters.dateRange}
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, dateRange: value }))}
          />
        </Space>
      )}

      <Table rowKey="_id" columns={columns} dataSource={displayedLeaveRequests} loading={isLoading} scroll={{ x: "max-content" }} />

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
