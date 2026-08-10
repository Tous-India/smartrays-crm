import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Tag, Segmented, Space, Button, Popconfirm, DatePicker, Select, Tooltip, Typography, App, Alert } from "antd";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import useLeaveList from "../hooks/useLeaveList";
import LeaveRequestModal from "./LeaveRequestModal";
import LeaveDeclineModal from "./LeaveDeclineModal";
import LeaveBalanceCard from "./LeaveBalanceCard";
import LeaveApprovalCards from "./LeaveApprovalCards";
import LeaveAdminStats from "./LeaveAdminStats";
import {
  DATE_RANGE_OPTIONS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
} from "../../../utils/date.utils";
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
import { markNotificationsForEntity } from "../../notification/markForEntity";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS, LEAVE_STATUSES } from "../constants/leave.constants";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const UNAPPROVED_ABSENCE_FILTER = "unapproved_absence";

const EMPTY_ADMIN_FILTERS = {
  employeeId: "",
  teamId: "",
  status: "",
  // §B4 (2026-08-05) — same preset dropdown as Attendance, reusing
  // `date.utils.js` rather than a second implementation. Defaults to This
  // Month here (not Today, as on Attendance): a leave queue spanning only
  // today would usually be empty, and an approver needs the month's backlog.
  datePreset: DATE_RANGE_PRESETS.thisMonth,
  dateRange: null,
};

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
 *
 * **Fetch errors shown distinctly from a genuinely empty list (BUG 3,
 * 2026-08-04)** — `useLeaveList`'s `error` used to be silently ignored
 * entirely, so a real failure (e.g. a 403 for a scope the caller lost
 * access to) rendered identically to "this scope genuinely has zero
 * requests," making a real bug indistinguishable from correct-but-empty
 * data. Reuses the exact `Alert`-instead-of-content pattern
 * `HistoryMapView.jsx` already established for the same "surface the
 * error, don't paper over it" reasoning.
 */
function LeaveSection({ view = "all", pendingOnly = false, hidePendingCards = false }) {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const isAdmin = user?.role === "admin";
  // `GET /teams` requires teams.manage or teams.view_team, so an employee
  // viewing their own leave at /leave got a 403 on every mount (fixed
  // 2026-08-09). Teams are only used here for the ADMIN Team filter and the
  // team label, so nobody else needs to ask in the first place.
  const canSeeTeams = can(user, "teams", "manage") || can(user, "teams", "view_team");
  const { teams } = useTeams(undefined, { enabled: canSeeTeams });
  const canApprove = usePermission("leave", "approve");
  const canDecline = usePermission("leave", "decline");
  const canMarkAbsence = usePermission("leave", "mark_unapproved_absence");
  const canDelete = usePermission("leave", "delete");
  const canActOnLeave = canApprove || canDecline || canMarkAbsence || canDelete;

  // Mirrors the backend's `leave.service.js#ensureCanActOnLeave`: admin acts
  // org-wide, everyone else only over their own direct reports — never over
  // their own request. Every row a non-admin can legitimately act on arrives
  // via `scope=team` (direct reports by construction), so "not mine" is the
  // whole check needed here.
  function canActOnRow(leave) {
    return isAdmin || String(leave.employeeId) !== String(user?._id);
  }

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

  const { leaveRequests, isLoading, error, refetch } = useLeaveList(effectiveScope);
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

  const teamNameByEmployeeId = useMemo(() => {
    const teamNameByHeadId = new Map(teams.map((team) => [String(team.headManagerId), team.name]));

    return new Map(
      teamDirectory.map((directoryUser) => [
        String(directoryUser._id),
        teamNameByHeadId.get(String(directoryUser.managerId)) || null,
      ])
    );
  }, [teams, teamDirectory]);

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

  // §B5 (2026-08-05) — replaces the removed "Leave History" tab. "Unapproved
  // Absence" is NOT a `status` value (see leave.constants.js: the enum is
  // pending/approved/rejected); it's the derived `isDoubleDeduction` flag,
  // which is why it's filtered separately below rather than added to the enum.
  const statusFilterOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...LEAVE_STATUSES.map((status) => ({
        value: status,
        label: status === "rejected" ? "Declined" : LEAVE_STATUS_LABELS[status],
      })),
      { value: UNAPPROVED_ABSENCE_FILTER, label: "Unapproved Absence" },
    ],
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

      if (adminFilters.status === UNAPPROVED_ABSENCE_FILTER) {
        if (!leave.isDoubleDeduction) {
          return false;
        }
      } else if (adminFilters.status && leave.status !== adminFilters.status) {
        return false;
      }

      if (adminFilters.teamId) {
        const team = teams.find((candidate) => candidate._id === adminFilters.teamId);
        if (!team || managerIdByEmployeeId.get(String(leave.employeeId)) !== String(team.headManagerId)) {
          return false;
        }
      }

      const window = resolveDateRange(adminFilters.datePreset, adminFilters.dateRange);

      if (window) {
        const rangeStartMs = window.from.valueOf();
        const rangeEndMs = window.to.valueOf();
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
    try {
      await approveLeaveApi(leave._id);
      message.success("Leave approved");
      // §7.44 — deciding on a request IS engaging with it, so its own
      // notification is dismissed. Only this request's; other pending
      // requests keep their badges.
      await markNotificationsForEntity("leave", leave._id);
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to approve leave");
    }
  }

  async function handleDecline(reason) {
    setIsSubmittingDecline(true);

    try {
      const declinedId = declineTarget._id;
      await declineLeaveApi(declinedId, reason);
      message.success("Leave declined");
      setDeclineTarget(null);
      await markNotificationsForEntity("leave", declinedId);
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to decline leave");
    } finally {
      setIsSubmittingDecline(false);
    }
  }

  async function handleMarkAbsence(leave) {
    try {
      await markUnapprovedAbsenceApi(leave._id);
      message.success("Marked as an unapproved absence — 2x deduction applied");
      await markNotificationsForEntity("leave", leave._id);
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to mark unapproved absence");
    }
  }

  async function handleDelete(leave) {
    try {
      await deleteLeaveApi(leave._id);
      message.success("Leave request deleted");
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to delete leave request");
    }
  }

  const columns = [
    effectiveScope !== "own" && {
      title: "Employee",
      dataIndex: "employeeId",
      width: 160,
      render: (employeeId) => employeeNameById.get(String(employeeId)) || "Unknown",
    },
    // Team/Department (2026-08-05) — admin only, since it's derived from the
    // full roster this page fetches for the Admin Team filter alone. Built
    // from exactly the same two sources as that filter (`useTeams()` +
    // each employee's `managerId`), so the column and the filter can never
    // disagree about which team someone is in.
    isAdmin && {
      title: "Team",
      key: "team",
      dataIndex: "employeeId",
      width: 150,
      render: (employeeId) => teamNameByEmployeeId.get(String(employeeId)) || "—",
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
      render: (_, leave) => {
        // Per-row scope check (BUG 9/10, 2026-08-05) — holding
        // `leave.approve`/`delete` says the caller may act on SOMEONE's
        // request, not on this specific one. The backend's own
        // `ensureCanActOnLeave` resolves that per record: admin org-wide,
        // everyone else only over their own direct reports — which their
        // OWN request never is (a manager's `managerId` points at their
        // manager, not at themselves). Rendering the buttons off the blanket
        // permission alone put Approve/Decline/Mark-Absence/Delete on every
        // row of a manager's own "Own" tab, where all four always 403.
        if (!canActOnRow(leave)) {
          return null;
        }

        return (
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
        );
      },
    },
  ].filter(Boolean);

  // §B2 (2026-08-05) — pending requests are decisions and render as cards;
  // anything already decided is history and stays a table. `view` decides
  // which half this instance shows, so the Admin tabs ("Leave Requests" /
  // "Leave History") and the Manager/Employee single Leave tab all reuse
  // this one component rather than three near-copies.
  const pendingRequests = displayedLeaveRequests.filter((leave) => leave.status === "pending");
  const decidedRequests = displayedLeaveRequests.filter((leave) => leave.status !== "pending");

  // §B5 — a request renders as EITHER an approval card OR a table row, never
  // both. Previously an admin saw every pending request twice: once as a card
  // and again in the table below it.
  //
  // Someone who can't act on leave (an employee viewing their own) gets the
  // plain table for everything — approval cards would be decoration, and
  // hiding their pending requests from the table would lose them entirely.
  // §7.4g (2026-08-09) — pending cards moved to the Attendance tab. They must
  // exist in ONE place, so the two instances are complementary rather than
  // duplicated: `pendingOnly` (Attendance) renders the cards and nothing else,
  // `hidePendingCards` (Leave Requests) renders everything except the cards.
  const showApprovalCards = canActOnLeave && pendingRequests.length > 0 && !hidePendingCards;
  const tableRows = canActOnLeave ? decidedRequests : displayedLeaveRequests;
  const showTable = tableRows.length > 0 || !showApprovalCards;

  if (pendingOnly) {
    // Only the approval cards — no stats, no filters, no history table. The
    // Attendance tab has its own stat cards directly above these, and a second
    // set here would be noise.
    if (!canActOnLeave || pendingRequests.length === 0) {
      return null;
    }

    return (
      <div data-testid="pending-leave-approvals">
        <LeaveApprovalCards
          requests={pendingRequests}
          employeeNameById={employeeNameById}
          teamNameByEmployeeId={teamNameByEmployeeId}
          canApprove={canApprove}
          canDecline={canDecline}
          canMarkAbsence={canMarkAbsence}
          canDelete={canDelete}
          canActOnRow={canActOnRow}
          onApprove={handleApprove}
          onDecline={setDeclineTarget}
          onMarkAbsence={handleMarkAbsence}
          onDelete={handleDelete}
        />
        {declineTarget && (
          <LeaveDeclineModal
            leave={declineTarget}
            onCancel={() => setDeclineTarget(null)}
            onConfirm={handleDecline}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* §B3 (2026-08-05) — an admin sees queue stats; the viewer's OWN
          paid-leave balance is a personal metric that told them nothing
          about the queue they're here to work. The balance card is
          unchanged on the employee-facing tabs. */}
      {isAdmin ? (
        <LeaveAdminStats leaveRequests={leaveRequests} employeeNameById={employeeNameById} />
      ) : (
        <LeaveBalanceCard />
      )}

      {/* §B4 — for an admin this row would hold nothing but the report
          button, pushing the filters onto a second line. The button moves
          into the filter row instead, so filters and actions share one row. */}
      {!isAdmin && (
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
      )}

      {/* Same one-row treatment as the Attendance tab (2026-08-09): the layout
          was already right, the controls were just sized past their content
          (200+200+160+140 = 700px) so the export block wrapped onto a second
          row. `flex-wrap` stays, so narrow widths wrap rather than overflow. */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Employee"
            value={adminFilters.employeeId}
            options={filterEmployeeOptions}
            style={{ width: 170 }}
            showSearch
            optionFilterProp="label"
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, employeeId: value }))}
          />
          <Select
            aria-label="Team"
            value={adminFilters.teamId}
            options={teamOptions}
            style={{ width: 150 }}
            showSearch
            optionFilterProp="label"
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, teamId: value }))}
          />
          <Select
            aria-label="Status"
            value={adminFilters.status}
            options={statusFilterOptions}
            style={{ width: 140 }}
            onChange={(value) => setAdminFilters((previous) => ({ ...previous, status: value }))}
          />
          <Select
            aria-label="Date range"
            value={adminFilters.datePreset}
            options={DATE_RANGE_OPTIONS}
            style={{ width: 124 }}
            onChange={(value) =>
              setAdminFilters((previous) => ({
                ...previous,
                datePreset: value,
                dateRange: value === DATE_RANGE_PRESETS.custom ? previous.dateRange : null,
              }))
            }
          />
          {/* Start/end inputs appear ONLY under Custom (§B4). */}
          {adminFilters.datePreset === DATE_RANGE_PRESETS.custom && (
            <RangePicker
              value={adminFilters.dateRange}
              onChange={(value) => setAdminFilters((previous) => ({ ...previous, dateRange: value }))}
            />
          )}
          <div className="ms-auto">
            <ReportDownloadButton module="leave" filters={{ scope: effectiveScope }} filenamePrefix="leave" />
          </div>
        </div>
      )}

      {/* Preserved verbatim from the standalone page (BUG 3, §7.5f): a real
          fetch failure must never look like "this scope has no requests". */}
      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load leave requests"
          description={
            error.response?.status === 403
              ? "You don't have permission to view this scope."
              : "Please try again."
          }
        />
      ) : (
        <>
          {showApprovalCards && (
            <LeaveApprovalCards
              requests={pendingRequests}
              employeeNameById={employeeNameById}
              teamNameByEmployeeId={teamNameByEmployeeId}
              canApprove={canApprove}
              canDecline={canDecline}
              canMarkAbsence={canMarkAbsence}
              canDelete={canDelete}
              canActOnRow={canActOnRow}
              onApprove={handleApprove}
              onDecline={setDeclineTarget}
              onMarkAbsence={handleMarkAbsence}
              onDelete={handleDelete}
            />
          )}

          {showTable && (
            <Table
              rowKey="_id"
              columns={columns}
              dataSource={tableRows}
              loading={isLoading}
              scroll={{ x: "max-content" }}
            />
          )}
        </>
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

export default LeaveSection;
