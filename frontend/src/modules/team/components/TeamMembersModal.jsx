import { useEffect, useState } from "react";
import { Modal, List, Select, Button, Popconfirm, App, Space, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { getTeamMembers, addTeamMember, removeTeamMember } from "../api/teamApi";

/**
 * Member add/remove for one Team. The member list itself is always
 * re-fetched fresh from `GET /teams/:id/members` (never cached/derived
 * client-side) since it's a live reflection of `User.managerId` — see
 * team.model.js's own docblock for why there's no stored member array to
 * keep in sync in the first place.
 *
 * The "add" picker is filtered to employee/sales_associate roles (the
 * job-doing roles a team's rank-and-file would actually be), but does NOT
 * cross-reference every other team's own membership to grey out someone
 * already on a different team — the lightweight `users` list this reuses
 * (`useUserDirectory`, the same one every other "assign to" picker in this
 * app already fetches) doesn't carry `managerId`, and fetching every team's
 * member list just to grey out a picker option isn't worth the extra
 * requests for what is explicitly an admin-only, low-frequency action.
 * Per this task's own simpler alternative, a confirmation naming the real
 * consequence (silently moving them off whatever team/manager they're
 * currently under) is shown before every add instead.
 */
function TeamMembersModal({ open, team, users, onCancel, onChanged }) {
  const { message } = App.useApp();
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refetchMembers() {
    if (!team) return;

    setIsLoading(true);
    try {
      const response = await getTeamMembers(team._id);
      setMembers(response.data.data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (open && team) {
      setSelectedUserId(null);
      refetchMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team]);

  const memberOptions = users
    .filter((user) => user.role === "employee" || user.role === "sales_associate")
    .map((user) => ({ value: user._id, label: user.name }));

  async function handleAddMember() {
    if (!selectedUserId) return;

    setIsSubmitting(true);
    try {
      await addTeamMember(team._id, selectedUserId);
      message.success("Member added");
      setSelectedUserId(null);
      await refetchMembers();
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveMember(userId) {
    await removeTeamMember(team._id, userId);
    message.success("Member removed");
    await refetchMembers();
    onChanged();
  }

  return (
    <Modal title={team ? `${team.name} — Members` : "Members"} open={open} onCancel={onCancel} footer={null}>
      <Space.Compact className="mb-4 w-full">
        <Select
          showSearch
          optionFilterProp="label"
          options={memberOptions}
          value={selectedUserId}
          onChange={setSelectedUserId}
          placeholder="Select an employee or sales associate to add"
          style={{ width: "100%" }}
        />
        <Popconfirm
          title="Add this member?"
          description="If they're already reporting to a different manager/team, this moves them here — it doesn't add them to both."
          okText="Add"
          onConfirm={handleAddMember}
          disabled={!selectedUserId}
        >
          <Button type="primary" disabled={!selectedUserId} loading={isSubmitting}>
            Add
          </Button>
        </Popconfirm>
      </Space.Compact>

      <List
        loading={isLoading}
        dataSource={members}
        locale={{ emptyText: "No members yet" }}
        renderItem={(member) => (
          <List.Item
            actions={[
              <Popconfirm
                key="remove"
                title="Remove this member?"
                description="Clears their manager assignment entirely."
                okText="Remove"
                okType="danger"
                onConfirm={() => handleRemoveMember(member._id)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} title="Remove member" aria-label="Remove member" />
              </Popconfirm>,
            ]}
          >
            <Space>
              <span>{member.name}</span>
              <Tag>{member.role}</Tag>
            </Space>
          </List.Item>
        )}
      />
    </Modal>
  );
}

export default TeamMembersModal;
