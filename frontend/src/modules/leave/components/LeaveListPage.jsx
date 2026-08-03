import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Tag, Segmented, Space, Button, Popconfirm, DatePicker, Select, App } from "antd";
import useLeaveList from "../hooks/useLeaveList";
import LeaveRequestModal from "./LeaveRequestModal";
import LeaveDeclineModal from "./LeaveDeclineModal";
import LeaveBalanceCard from "./LeaveBalanceCard";
import TeamLeaveCalendar from "./TeamLeaveCalendar";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { usePermission } from "../../../hooks/usePermission";
import { can } from "../../../utils/permission.utils";
import { listUsers } from "../../user/api/userApi";
import {
  requestLeave as requestLeaveApi,
  approveLeave as approveLeaveApi,
  declineLeave as declineLeaveApi,
  markUnapprovedAbsence as markUnapprovedAbsenceApi,
  getLeaveBalance as getLeaveBalanceApi,
} from "../api/leaveApi";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS, LEAVE_STATUSES } from "../constants/leave.constants";

const { RangePicker } = DatePicker;

const EMPTY_ADMIN_FILTERS = { employeeId: "", managerId: "", status: "", dateRange: null };

/**
 * `/leave` — request + scope-tabbed list, per §7.5. Scope tabs are built
 * from whichever `leave.view*` grants the current user actually holds
 * (own/team/all), mirroring the same "check each scope's own permission"
 * design the backend's `listLeaves` uses rather than assuming a hierarchy.
 *
 * Approve/Decline/Mark Unapproved Absence (2026-07-31, §7.5c — reverses the
 * earlier "admin-only, manager can view but not approve" restriction): each
 * button is gated on its own `leave.approve`/`decline`/`mark_unapproved_absence`
 * usePermission check, not a blanket `isAdmin` flag — a manager now holds all
 * three by default. This is safe to drive purely off the held permission
 * (no extra per-row "is this my team?" check needed here): a manager without
 * `leave.view_all` can only ever reach `scope=own`/`scope=team` in the first
 * place, and `scope=team` is already backend-filtered to the manager's own
 * direct reports (`listLeaves`'s own `managerId` scoping) — so every row a
 * manager can see through this UI already IS their own team's, the same
 * "route confirms a grant, a different layer resolves the specific scope"
 * split the backend itself uses (there, the service layer; here, the
 * scope-tab's own existing query).
 */
function LeaveListPage() {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const isAdmin = user?.role === "admin";
  const canApprove = usePermission("leave", "approve");
  const canDecline = usePermission("leave", "decline");
  const canMarkAbsence = usePermission("leave", "mark_unapproved_absence");
  const canActOnLeave = canApprove || canDecline || canMarkAbsence;

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
  const [adminFilters, setAdminFilters] = useState(EMPTY_ADMIN_FILTERS);
  const [teamDirectory, setTeamDirectory] = useState([]);

  const isAdminAllScope = isAdmin && scope === "all";

  const employeeNameById = useMemo(() => new Map(users.map((directoryUser) => [directoryUser._id, directoryUser.name])), [users]);

  // Admin filters (§7.5c) reset whenever the scope changes away from "all" —
  // a filter picked on the Admin table shouldn't silently keep narrowing
  // Own/Team once the caller switches tabs.
  useEffect(() => {
    if (!isAdminAllScope) {
      setAdminFilters(EMPTY_ADMIN_FILTERS);
    }
  }, [isAdminAllScope]);

  // Full user roster (managerId included, unlike the lightweight
  // `useUserDirectory()` dropdown above) — only fetched for the Admin
  // table's Team filter, which needs to know each employee's manager to
  // group by. Gated the same way `LeavePendingRequestsWidget` gates its own
  // effect: no fetch at all unless this specific feature actually needs it.
  useEffect(() => {
    if (!isAdminAllScope) {
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
  }, [isAdminAllScope]);

  const managerIdByEmployeeId = useMemo(
    () => new Map(teamDirectory.map((directoryUser) => [String(directoryUser._id), directoryUser.managerId ? String(directoryUser.managerId) : null])),
    [teamDirectory]
  );

  const managerOptions = useMemo(() => {
    const managers = teamDirectory.filter((directoryUser) => directoryUser.role === "manager");

    return [{ value: "", label: "All teams" }, ...managers.map((manager) => ({ value: String(manager._id), label: manager.name }))];
  }, [teamDirectory]);

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

  // Client-side, same reasoning as `TeamAttendanceView`'s own employee/status
  // filters — the backend has no query params for these, and the Admin
  // table's dataset (scope=all) is already fully fetched. Overlap check (not
  // a strict startDate match) so a multi-day request showing up under any
  // date the selected range touches, not just its exact start.
  const displayedLeaveRequests = useMemo(() => {
    if (!isAdminAllScope) {
      return leaveRequests;
    }

    return leaveRequests.filter((leave) => {
      if (adminFilters.employeeId && String(leave.employeeId) !== adminFilters.employeeId) {
        return false;
      }

      if (adminFilters.status && leave.status !== adminFilters.status) {
        return false;
      }

      if (adminFilters.managerId && managerIdByEmployeeId.get(String(leave.employeeId)) !== adminFilters.managerId) {
        return false;
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
  }, [leaveRequests, adminFilters, isAdminAllScope, managerIdByEmployeeId]);

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
    canActOnLeave && {
      title: "Actions",
      key: "actions",
      render: (_, leave) => (
        <Space>
          {leave.status === "pending" && (
            <>
              {canApprove && (
                <Popconfirm title="Approve this leave request?" okText="Confirm Approval" onConfirm={() => handleApprove(leave)}>
                  <Button size="small">Approve</Button>
                </Popconfirm>
              )}
              {canDecline && (
                <Button size="small" danger onClick={() => setDeclineTarget(leave)}>
                  Decline
                </Button>
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
              <Button size="small" danger>
                Mark Unapproved Absence
              </Button>
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

      {isAdminAllScope && viewMode === "list" && (
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
            value={adminFilters.managerId}
            options={managerOptions}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, managerId: value }))}
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

      {viewMode === "calendar" ? (
        <TeamLeaveCalendar month={calendarMonth} leaveRequests={leaveRequests} employeeNameById={employeeNameById} />
      ) : (
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={displayedLeaveRequests}
          loading={isLoading}
          expandable={
            scope !== "own"
              ? {
                  // Reason is required on every request (§7.5c) and can run
                  // long as free text — an expandable row detail keeps the
                  // table itself scannable, rather than a column that would
                  // either truncate awkwardly or blow up column width.
                  expandedRowRender: (leave) => (
                    <p className="m-0">
                      <strong>Reason:</strong> {leave.reason}
                    </p>
                  ),
                }
              : undefined
          }
        />
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
