import { useParams, useNavigate, Link } from "react-router-dom";
import { Spin, Result, Button, Tag, Row, Col } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import useUserDetail from "../modules/user/hooks/useUserDetail";
import useUserLifecycleActions from "../modules/user/hooks/useUserLifecycleActions";
import useTeams from "../modules/team/hooks/useTeams";
import useUserDirectory from "../hooks/useUserDirectory";
import UserActionButtons from "../modules/user/components/UserActionButtons";
import UserLifecycleModals from "../modules/user/components/UserLifecycleModals";
import UserBasicInfoCard from "../modules/user/components/UserBasicInfoCard";
import UserAttendanceSummaryCard from "../modules/user/components/UserAttendanceSummaryCard";
import UserLeaveCard from "../modules/user/components/UserLeaveCard";
import UserTeamCard from "../modules/user/components/UserTeamCard";
import UserOwnedLeadsCard from "../modules/user/components/UserOwnedLeadsCard";
import UserPermissionsCard from "../modules/user/components/UserPermissionsCard";
import UserPayrollHistoryCard from "../modules/user/components/UserPayrollHistoryCard";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { USER_ROLE_LABELS, ROLE_PICKER_LABELS } from "../modules/user/constants/user.constants";

const LEADS_OWNER_ROLES = ["sales_associate", "manager"];

/**
 * `/settings/users/:id` (§7.32) — the first dedicated User Detail view,
 * consolidating data already scattered across Attendance/Leave/Teams/
 * Leads/Payroll/Permissions onto one page rather than duplicating any of
 * their own fetching logic. Reached from `UserManagementPage`'s table:
 * clicking anywhere on a row navigates here; the existing icon-only Edit
 * button in that same row keeps working as a quick-edit modal without
 * navigating away — this page ALSO has its own Edit action (reusing the
 * exact same `UserActionButtons`/`UserFormModal`), so both paths stay
 * available rather than removing the list's own quick-edit.
 *
 * Header + Basic Info both come from the one blocking `useUserDetail` fetch
 * (mirrors `CustomerDetailPage`'s own "core entity" 404/spinner handling).
 * Every other section (Attendance/Leave/Team/Leads/Permissions/Payroll)
 * fetches independently inside its own card component — the same
 * "one section's fetch failing never breaks another" principle Dashboard's
 * own widgets already establish (`WidgetCard`, reused directly by every
 * card here rather than a second loading/error/empty shell).
 */
function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";

  const { user, isLoading, error, refetch } = useUserDetail(id);
  const { teams, isLoading: isTeamsLoading } = useTeams();
  const { users: userDirectory } = useUserDirectory();
  const actions = useUserLifecycleActions({
    refetch,
    onDeleted: () => navigate(ROUTE_PATHS.SETTINGS_USERS),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <Result
        status="404"
        title="User not found"
        extra={
          <Link to={ROUTE_PATHS.SETTINGS_USERS}>
            <Button type="primary">Back to User Management</Button>
          </Link>
        }
      />
    );
  }

  const managerName = user.managerId ? userDirectory.find((candidate) => candidate._id === user.managerId)?.name : null;
  const ledTeam = teams.find((team) => team.headManagerId === user._id);
  const memberOfTeam = !ledTeam && user.managerId ? teams.find((team) => team.headManagerId === user.managerId) : null;
  const departmentName = ledTeam?.name || memberOfTeam?.name;
  const showOwnedLeads = LEADS_OWNER_ROLES.includes(user.role);

  return (
    <div>
      <Link to={ROUTE_PATHS.SETTINGS_USERS} className="mb-4 inline-block">
        <ArrowLeftOutlined /> Back to User Management
      </Link>

      <div className="app-elevated-card mb-6 flex flex-wrap items-center justify-between gap-4 rounded-md bg-white p-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{user.name}</span>
            <Tag color={user.isActive ? "green" : "red"}>{user.isActive ? "Active" : "Inactive"}</Tag>
          </div>
          <div className="mt-1 text-sm text-gray-500">
            {ROLE_PICKER_LABELS[user.role] || USER_ROLE_LABELS[user.role] || user.role}
            {departmentName && ` · ${departmentName}`}
          </div>
        </div>

        <UserActionButtons
          user={user}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onEdit={actions.openEditForm}
          onResetPassword={actions.setResetPasswordTarget}
          onDeactivateClick={actions.handleDeactivateClick}
          onReactivate={actions.handleReactivate}
          onDelete={actions.setDeleteTarget}
        />
      </div>

      <Row gutter={[16, 16]} className="mb-4">
        <Col span={24}>
          <UserAttendanceSummaryCard user={user} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={8}>
          <UserBasicInfoCard user={user} managerName={managerName} />
        </Col>
        <Col xs={24} md={12} lg={8}>
          <UserTeamCard user={user} teams={teams} isLoading={isTeamsLoading} />
        </Col>
        <Col xs={24} md={12} lg={8}>
          <UserLeaveCard user={user} />
        </Col>
        {showOwnedLeads && (
          <Col xs={24} md={12} lg={8}>
            <UserOwnedLeadsCard user={user} />
          </Col>
        )}
        <Col xs={24} md={12} lg={8}>
          <UserPermissionsCard user={user} />
        </Col>
        {isAdmin && (
          <Col xs={24} md={12} lg={8}>
            <UserPayrollHistoryCard userId={user._id} />
          </Col>
        )}
      </Row>

      <UserLifecycleModals actions={actions} userDirectory={userDirectory} />
    </div>
  );
}

export default UserDetailPage;
