import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Table, Tag, Button, Space, Typography, Select } from "antd";
import useUsers from "../hooks/useUsers";
import useTeams from "../../team/hooks/useTeams";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import { USER_ROLES, USER_ROLE_LABELS } from "../constants/user.constants";
import useUserLifecycleActions from "../hooks/useUserLifecycleActions";
import UserLifecycleModals from "./UserLifecycleModals";
import UserActionButtons from "./UserActionButtons";

const { Title } = Typography;

/**
 * The User Management admin screen (§7.17) — closes a gap that existed
 * since Phase 0: the backend `user` module (roster CRUD, deactivate/
 * reactivate, manager assignment) has had working endpoints all along, but
 * no frontend screen ever consumed them. List scoping (admin sees
 * everyone, manager sees their own team) is entirely server-side
 * (`user.service.js#resolveVisibleUserFilter`) — this page renders
 * whatever `GET /users` returns, no client-side filtering by role.
 *
 * All account-lifecycle logic (create/edit, reset password, guarded
 * deactivate-with-reassignment, reactivate, guarded hard-delete) and its
 * modals live in `useUserLifecycleActions`/`UserLifecycleModals` (§7.32) —
 * shared with the User Detail page rather than a second copy here.
 */
function UserManagementPage() {
  const navigate = useNavigate();
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";

  const [roleFilter, setRoleFilter] = useState(undefined);
  const [teamFilter, setTeamFilter] = useState(undefined);
  const [activeFilter, setActiveFilter] = useState(undefined);

  const filters = useMemo(
    () => ({
      role: roleFilter,
      teamId: teamFilter,
      isActive: activeFilter,
    }),
    [roleFilter, teamFilter, activeFilter]
  );

  const { users, isLoading, refetch } = useUsers(filters);
  const { teams } = useTeams();
  const { users: userDirectory } = useUserDirectory();
  const actions = useUserLifecycleActions({ refetch });

  const managerNameById = new Map(users.map((user) => [user._id, user.name]));

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Email", dataIndex: "email" },
    {
      title: "Role",
      dataIndex: "role",
      render: (role) => USER_ROLE_LABELS[role] || role,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      render: (isActive) => (
        <Tag color={isActive ? "green" : "red"}>{isActive ? "Active" : "Inactive"}</Tag>
      ),
    },
    {
      title: "Manager",
      dataIndex: "managerId",
      render: (managerId) => (managerId ? managerNameById.get(managerId) || "—" : "—"),
    },
    {
      title: "Actions",
      key: "actions",
      // `onClick` here (not just on each button) is a belt-and-suspenders
      // stop against the row's own onRow.onClick navigating away underneath
      // a button press — AntD renders every button as a real nested
      // element inside this cell, so a bubbled click reaches the row's
      // handler unless stopped somewhere in between.
      onCell: () => ({ onClick: (event) => event.stopPropagation() }),
      render: (_, user) => (
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
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Title level={4} className="!mb-0">
          User Management
        </Title>
        <Space>
          <Link to={ROUTE_PATHS.SETTINGS_PERMISSIONS}>Permissions</Link>
          {isAdmin && (
            <Button type="primary" onClick={actions.openCreateForm}>
              New User
            </Button>
          )}
        </Space>
      </div>

      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="All Roles"
          style={{ width: 160 }}
          value={roleFilter}
          onChange={setRoleFilter}
          options={USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }))}
        />
        <Select
          allowClear
          placeholder="All Departments"
          style={{ width: 200 }}
          value={teamFilter}
          onChange={setTeamFilter}
          options={teams.map((team) => ({ value: team._id, label: team.name }))}
        />
        <Select
          allowClear
          placeholder="Active or Inactive"
          style={{ width: 180 }}
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ]}
        />
      </Space>

      <Table
        rowKey="_id"
        loading={isLoading}
        dataSource={users}
        columns={columns}
        pagination={{ pageSize: 20 }}
        onRow={(user) => ({
          onClick: (event) => {
            // AntD portals dropdown/picker popups to <body>, outside the
            // row's DOM — same guard LeadsTable's own row-click-to-detail
            // navigation already uses, reused verbatim rather than a
            // second copy of this exact check.
            if (event.target.closest(".ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-popover")) {
              return;
            }
            navigate(`/settings/users/${user._id}`);
          },
          className: "cursor-pointer",
        })}
      />

      <UserLifecycleModals actions={actions} userDirectory={userDirectory} />
    </div>
  );
}

export default UserManagementPage;
