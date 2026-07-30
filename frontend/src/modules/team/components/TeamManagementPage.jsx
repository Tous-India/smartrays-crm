import { useState } from "react";
import { Table, Button, Popconfirm, Space, message, Tag } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from "@ant-design/icons";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useTeams from "../hooks/useTeams";
import { createTeam, updateTeam, deleteTeam } from "../api/teamApi";
import TeamFormModal from "./TeamFormModal";
import TeamMembersModal from "./TeamMembersModal";

/**
 * `/settings/teams` — admin-only (gated by `teams.manage`, the same single-
 * tier shape as the Permissions module's own `manage` grant). List of teams
 * (name, type, head's name, derived member count), Create/Edit via
 * `TeamFormModal`, member add/remove via `TeamMembersModal`. `users`
 * (`useUserDirectory`, the same lightweight lookup every other "assign to"
 * picker in this app already uses) is fetched once here and passed down to
 * both modals rather than each fetching its own copy.
 */
function TeamManagementPage() {
  const { users } = useUserDirectory();
  const { teams, isLoading, refetch } = useTeams();
  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [membersTeam, setMembersTeam] = useState(null);

  async function handleSubmitForm(values) {
    setIsSubmittingForm(true);

    try {
      if (editingTeam) {
        await updateTeam(editingTeam._id, values);
        message.success("Team updated");
      } else {
        await createTeam(values);
        message.success("Team created");
      }

      setIsFormOpen(false);
      setEditingTeam(null);
      refetch();
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleDelete(team) {
    await deleteTeam(team._id);
    message.success("Team deleted");
    refetch();
  }

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Type", dataIndex: "type", render: (value) => value || "—" },
    {
      title: "Head",
      dataIndex: "headManagerId",
      render: (headManagerId) => userNameById.get(headManagerId) || "—",
    },
    {
      title: "Members",
      dataIndex: "memberCount",
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      render: (isActive) => <Tag color={isActive ? "green" : "default"}>{isActive ? "Active" : "Inactive"}</Tag>,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, team) => (
        <Space>
          <Button
            type="text"
            icon={<TeamOutlined />}
            onClick={() => setMembersTeam(team)}
            title="Manage members"
            aria-label="Manage members"
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            title="Edit team"
            aria-label="Edit team"
            onClick={() => {
              setEditingTeam(team);
              setIsFormOpen(true);
            }}
          />
          <Popconfirm title="Delete this team?" okText="Delete" okType="danger" onConfirm={() => handleDelete(team)}>
            <Button type="text" danger icon={<DeleteOutlined />} title="Delete team" aria-label="Delete team" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingTeam(null);
            setIsFormOpen(true);
          }}
        >
          Create Team
        </Button>
      </div>

      <Table rowKey="_id" className="app-data-table" loading={isLoading} dataSource={teams} columns={columns} />

      <TeamFormModal
        open={isFormOpen}
        mode={editingTeam ? "edit" : "create"}
        initialTeam={editingTeam}
        users={users}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingTeam(null);
        }}
        onSubmit={handleSubmitForm}
        isSubmitting={isSubmittingForm}
      />

      <TeamMembersModal
        open={Boolean(membersTeam)}
        team={membersTeam}
        users={users}
        onCancel={() => setMembersTeam(null)}
        onChanged={refetch}
      />
    </div>
  );
}

export default TeamManagementPage;
