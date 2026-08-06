import { useMemo, useState } from "react";
import { Table, Button, Popconfirm, Space, App, Tag, Select, Switch, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from "@ant-design/icons";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useTeams from "../hooks/useTeams";
import { createTeam, updateTeam, deleteTeam, setTeamShowContacts } from "../api/teamApi";
import TeamFormModal from "./TeamFormModal";
import TeamMembersModal from "./TeamMembersModal";
import useSessionStore from "../../../store/sessionStore";
import { can } from "../../../utils/permission.utils";

/**
 * `/settings/teams` — list of teams (name, type, head's name, derived member
 * count), Create/Edit via `TeamFormModal`, member add/remove via
 * `TeamMembersModal`. `users` (`useUserDirectory`, the same lightweight
 * lookup every other "assign to" picker in this app already uses) is fetched
 * once here and passed down to both modals rather than each fetching its own
 * copy.
 *
 * **Two tiers (2026-08-05).** `teams.manage` (admin) is unchanged: full
 * create/edit/delete/members. `teams.view_team` (manager) renders this exact
 * same page READ-ONLY — same table, same filters, but no Create button and
 * no row actions except opening the members list, which `TeamMembersModal`
 * itself renders read-only for this tier. The backend scopes `GET /teams` to
 * the team(s) the caller heads, so the manager simply sees one row: their
 * own. Reusing the component rather than forking a "manager teams page"
 * keeps one implementation of the table/filters.
 *
 * Membership editing is deliberately NOT extended to managers — adding a
 * member is "set that user's managerId to this team's head," so a manager
 * with that power could pull any user in the org onto their own team and
 * inherit every view_team-scoped grant over that person's data. Org
 * structure stays admin-controlled; a manager reads it.
 */
function TeamManagementPage() {
  const { message } = App.useApp();
  const { users } = useUserDirectory();
  const user = useSessionStore((state) => state.user);
  const canManage = can(user, "teams", "manage");

  const [typeFilter, setTypeFilter] = useState(undefined);
  const [activeFilter, setActiveFilter] = useState(undefined);
  const filters = useMemo(() => ({ type: typeFilter, isActive: activeFilter }), [typeFilter, activeFilter]);

  const { teams, isLoading, refetch } = useTeams(filters);
  // A second, always-unfiltered fetch purely to compute the Type filter's
  // own option list — deriving it from the (possibly filtered) `teams`
  // above would shrink the dropdown's own options as soon as a filter was
  // applied (e.g. filtering to "Sales" would make every other type
  // disappear from the Type dropdown itself). Teams is a tiny, rarely-
  // fetched list, so a second request here is cheap.
  const { teams: allTeams, refetch: refetchAllTeams } = useTeams();
  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  // Every distinct type actually in use, for the Type filter's own options —
  // free-text on the create/edit form (team.model.js), so there's no fixed
  // enum to draw this from instead.
  const typeOptions = useMemo(() => {
    const distinctTypes = [...new Set(allTeams.map((team) => team.type).filter(Boolean))];
    return distinctTypes.map((type) => ({ value: type, label: type }));
  }, [allTeams]);

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
      refetchAllTeams();
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleDelete(team) {
    await deleteTeam(team._id);
    message.success("Team deleted");
    refetch();
    refetchAllTeams();
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
      // §7.39 — a team's head may toggle this even without `teams.manage`;
      // the backend enforces head-or-admin, so this renders for anyone who
      // can see the row and simply surfaces the server's refusal otherwise.
      title: "Member contacts",
      dataIndex: "showContactsToMembers",
      render: (showContacts, team) => (
        <Tooltip title="When off, teammates' email and phone are never sent to the browser at all">
          <Switch
            size="small"
            checked={Boolean(showContacts)}
            aria-label={`Toggle contact visibility for ${team.name}`}
            onChange={async (checked) => {
              try {
                await setTeamShowContacts(team._id, checked);
                message.success(checked ? "Contacts visible to members" : "Contacts hidden from members");
                refetch();
              } catch (error) {
                message.error(error.response?.data?.message || "Could not update contact visibility");
              }
            }}
          />
        </Tooltip>
      ),
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
            title={canManage ? "Manage members" : "View members"}
            aria-label={canManage ? "Manage members" : "View members"}
          />
          {canManage && (
          <>
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
          <Popconfirm
            title="Delete this team?"
            // `team.memberCount` is already present on every row from
            // `GET /teams` itself (team.service.js#listTeams) — no extra
            // fetch needed just to show this before the admin confirms.
            description={
              team.memberCount > 0
                ? `This team has ${team.memberCount} member${team.memberCount === 1 ? "" : "s"}. Deleting it will not remove them, but they'll lose this team grouping. Continue?`
                : "This team has no members. Continue?"
            }
            okText="Delete"
            okType="danger"
            onConfirm={() => handleDelete(team)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} title="Delete team" aria-label="Delete team" />
          </Popconfirm>
          </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Space wrap>
          <Select
            allowClear
            placeholder="All Types"
            style={{ width: 180 }}
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
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

        {canManage && (
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
        )}
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
        readOnly={!canManage}
      />
    </div>
  );
}

export default TeamManagementPage;
