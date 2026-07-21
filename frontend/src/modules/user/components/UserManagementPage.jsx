import { useState } from "react";
import { Link } from "react-router-dom";
import { Table, Tag, Button, Space, Popconfirm, Typography, message } from "antd";
import useUsers from "../hooks/useUsers";
import useSessionStore from "../../../store/sessionStore";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import { USER_ROLE_LABELS } from "../constants/user.constants";
import { createUser, updateUser, deactivateUser, reactivateUser } from "../api/userApi";
import UserFormModal from "./UserFormModal";
import AdminResetPasswordModal from "./AdminResetPasswordModal";

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
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";

  const { users, isLoading, refetch } = useUsers({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingUser, setEditingUser] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);

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

  async function handleDeactivate(user) {
    await deactivateUser(user._id);
    message.success(`${user.name} deactivated`);
    refetch();
  }

  async function handleReactivate(user) {
    await reactivateUser(user._id);
    message.success(`${user.name} reactivated`);
    refetch();
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
              <Button size="small" onClick={() => openEditForm(user)}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button size="small" onClick={() => setResetPasswordTarget(user)}>
                Reset Password
              </Button>
            )}
            {isAdmin && user.isActive && user._id !== currentUser?._id && (
              <Popconfirm
                title={`Deactivate ${user.name}?`}
                onConfirm={() => handleDeactivate(user)}
              >
                <Button size="small" danger>
                  Deactivate
                </Button>
              </Popconfirm>
            )}
            {isAdmin && !user.isActive && (
              <Button size="small" onClick={() => handleReactivate(user)}>
                Reactivate
              </Button>
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
    </div>
  );
}

export default UserManagementPage;
