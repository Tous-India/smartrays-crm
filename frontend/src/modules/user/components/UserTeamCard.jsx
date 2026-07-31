import { Link } from "react-router-dom";
import { Tag } from "antd";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

/**
 * Reuses the already-fetched `teams` list (`useTeams()`, called once at
 * `UserDetailPage` level — the same small, "infrequently-changing" list
 * `UserManagementPage` itself already fetches once and shares across its
 * own filter dropdown and reassignment modal, not a second copy of that
 * fetch here) rather than a dedicated endpoint: this card is just two
 * different derived views of the same list — "a team this person heads"
 * (`headManagerId === user._id`) or "a team this person belongs to"
 * (`headManagerId === user.managerId`, the same derived-membership
 * mechanism §11.9 establishes everywhere else in this app).
 */
function UserTeamCard({ user, teams, isLoading }) {
  const ledTeam = teams.find((team) => team.headManagerId === user._id);
  const memberOfTeam = !ledTeam && user.managerId ? teams.find((team) => team.headManagerId === user.managerId) : null;

  return (
    <WidgetCard
      title="Department / Team"
      isLoading={isLoading}
      error={null}
      isEmpty={!ledTeam && !memberOfTeam}
      emptyDescription="Not assigned to a team"
    >
      {ledTeam && (
        <div>
          <div className="text-sm">
            <strong>{ledTeam.name}</strong> {ledTeam.type && <Tag>{ledTeam.type}</Tag>}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Leads this team · {ledTeam.memberCount ?? 0} member(s)
          </div>
          <div className="mt-2 text-right text-sm">
            <Link to={`/settings/teams`}>View team →</Link>
          </div>
        </div>
      )}
      {memberOfTeam && (
        <div>
          <div className="text-sm">
            <strong>{memberOfTeam.name}</strong> {memberOfTeam.type && <Tag>{memberOfTeam.type}</Tag>}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Member · {memberOfTeam.memberCount ?? 0} member(s) total
          </div>
          <div className="mt-2 text-right text-sm">
            <Link to={`/settings/teams`}>View team →</Link>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export default UserTeamCard;
