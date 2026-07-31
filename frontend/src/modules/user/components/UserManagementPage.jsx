import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Tag, Button, Space, Tooltip, Typography, Select, App } from "antd";
import { EditOutlined, LockOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import useUsers from "../hooks/useUsers";
import useTeams from "../../team/hooks/useTeams";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import { USER_ROLES, USER_ROLE_LABELS } from "../constants/user.constants";
import {
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getDeactivationImpact,
} from "../api/userApi";
import UserFormModal from "./UserFormModal";
import AdminResetPasswordModal from "./AdminResetPasswordModal";
import DeleteUserModal from "./DeleteUserModal";
import DeactivationReassignModal from "./DeactivationReassignModal";

const { Title } = Typography;

/**
 * The User Management admin screen (§7.17) — closes a gap that existed
 * since Phase 0: the backend `user` module (roster CRUD, deactivate/
 * reactivate, manager assignment) has had working endpoints all along, but
 * no frontend screen ever consumed them. List scoping (admin sees
 * everyone, manager sees their own team) is entirely server-side
 * (`user.service.js#resolveVisibleUserFilter`) — this page renders
 * whatever `GET /users` returns, no client-side filtering by role.
 */
function UserManagementPage() {
  const { message, modal } = App.useApp();
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingUser, setEditingUser] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignImpact, setReassignImpact] = useState(null);
  const [isReassigning, setIsReassigning] = useState(false);

  function openCreateForm() {
    setFormMode("create");
    setEditingUser(null);
    setIsFormOpen(true);
  }

  function openEditForm(user) {
    setFormMode("edit");
    setEditingUser(user);
    setIsFormOpen(true);
  }

  async function handleSubmitForm(values) {
    setIsSubmittingForm(true);

    try {
      if (formMode === "create") {
        await createUser(values);
        message.success("User created");
      } else {
        await updateUser(editingUser._id, values);
        message.success("User updated");
      }
      setIsFormOpen(false);
      refetch();
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleDeactivate(user, reassignments) {
    try {
      await deactivateUser(user._id, reassignments);
      message.success(`${user.name} deactivated`);
      refetch();
    } catch (error) {
      // Surfaces the backend's guard message verbatim (§7.31, "Cannot
      // deactivate: this person leads the following team(s) needing a new
      // head...") rather than a generic failure — this can still fire even
      // after the impact check below, e.g. a race where something changed
      // between checking impact and confirming.
      message.error(error.response?.data?.message || "Failed to deactivate user");
    }
  }

  /**
   * Clicking Deactivate always checks impact first (§7.31, 2026-07-31 — a
   * reversal of the earlier hard-block guard, §7.28). Nothing to reassign →
   * the exact same plain confirm this always showed. Something to
   * reassign → `DeactivationReassignModal` instead of the confirm, and
   * `handleDeactivate` isn't called until that modal's own submit provides
   * the reassignment info.
   */
  async function handleDeactivateClick(user) {
    const response = await getDeactivationImpact(user._id);
    const impact = response.data.data;

    if (impact.teamsLed.length === 0 && impact.ownedLeadsCount === 0) {
      modal.confirm({
        title: `Deactivate ${user.name}?`,
        okText: "Deactivate",
        okButtonProps: { danger: true },
        onOk: () => handleDeactivate(user),
      });
      return;
    }

    setReassignTarget(user);
    setReassignImpact(impact);
  }

  async function handleReassignSubmit(reassignments) {
    setIsReassigning(true);

    try {
      await deactivateUser(reassignTarget._id, reassignments);
      message.success(`${reassignTarget.name} deactivated`);
      setReassignTarget(null);
      setReassignImpact(null);
      refetch();
    } catch (error) {
      // Left open on failure (e.g. a race between the impact check and this
      // submit) — the same verbatim-guard-message surfacing as the plain
      // no-reassignment path, so the admin sees exactly what's still wrong.
      message.error(error.response?.data?.message || "Failed to deactivate user");
    } finally {
      setIsReassigning(false);
    }
  }

  async function handleReactivate(user) {
    await reactivateUser(user._id);
    message.success(`${user.name} reactivated`);
    refetch();
  }

  async function handleDelete(reason) {
    setIsDeleting(true);

    try {
      await deleteUser(deleteTarget._id, reason);
      message.success(`${deleteTarget.name} permanently deleted`);
      setDeleteTarget(null);
      refetch();
    } catch (error) {
      // Surfaces the backend's exact guard message (still-active, still a
      // team head, missing reason) verbatim — same reasoning as
      // handleDeactivate's error surfacing above.
      message.error(error.response?.data?.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }

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
      render: (_, user) => {
        const canEdit = isAdmin || user._id === currentUser?._id;

        return (
          <Space wrap>
            {canEdit && (
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label="Edit"
                  onClick={() => openEditForm(user)}
                />
              </Tooltip>
            )}
            {isAdmin && (
              <Tooltip title="Reset Password">
                <Button
                  type="text"
                  size="small"
                  icon={<LockOutlined />}
                  aria-label="Reset Password"
                  onClick={() => setResetPasswordTarget(user)}
                />
              </Tooltip>
            )}
            {isAdmin && user.isActive && user._id !== currentUser?._id && (
              <Tooltip title="Deactivate">
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<StopOutlined />}
                  aria-label="Deactivate"
                  onClick={() => handleDeactivateClick(user)}
                />
              </Tooltip>
            )}
            {isAdmin && !user.isActive && (
              <Tooltip title="Reactivate">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  aria-label="Reactivate"
                  onClick={() => handleReactivate(user)}
                />
              </Tooltip>
            )}
            {isAdmin && !user.isActive && (
              <Tooltip title="Delete">
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label="Delete"
                  onClick={() => setDeleteTarget(user)}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
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
            <Button type="primary" onClick={openCreateForm}>
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

      <Table rowKey="_id" loading={isLoading} dataSource={users} columns={columns} pagination={{ pageSize: 20 }} />

      <UserFormModal
        open={isFormOpen}
        mode={formMode}
        initialUser={editingUser}
        onCancel={() => setIsFormOpen(false)}
        onSubmit={handleSubmitForm}
        isSubmitting={isSubmittingForm}
      />

      <AdminResetPasswordModal
        open={Boolean(resetPasswordTarget)}
        targetUser={resetPasswordTarget}
        onCancel={() => setResetPasswordTarget(null)}
      />

      <DeleteUserModal
        open={Boolean(deleteTarget)}
        user={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onSubmit={handleDelete}
        isSubmitting={isDeleting}
      />

      <DeactivationReassignModal
        open={Boolean(reassignTarget)}
        user={reassignTarget}
        impact={reassignImpact}
        users={userDirectory}
        onCancel={() => {
          setReassignTarget(null);
          setReassignImpact(null);
        }}
        onSubmit={handleReassignSubmit}
        isSubmitting={isReassigning}
      />
    </div>
  );
}

export default UserManagementPage;
