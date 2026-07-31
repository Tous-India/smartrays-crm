import ApiError from "../../utils/ApiError.js";
import Team from "./team.model.js";
import TeamType from "./teamType.model.js";
import User from "../user/user.model.js";
import { ensureValidManagerId, assignManager } from "../user/user.service.js";

const DEFAULT_TEAM_TYPES = ["Sales", "Installation", "Technical"];

/**
 * Admin-managed team type list (§7.30, 2026-07-31) — a structural mirror of
 * `lead.service.js#listLeadSources`' lazy-seed-on-first-read behavior:
 * seeds the three defaults once, the first time this is ever called, rather
 * than a separate seed script. Returns every type (active and inactive) —
 * the frontend's admin management screen needs to see inactive ones too,
 * unlike the Team form's dropdown, which filters to active itself.
 */
export async function listTeamTypes() {
  const existingCount = await TeamType.countDocuments();

  if (existingCount === 0) {
    await TeamType.insertMany(DEFAULT_TEAM_TYPES.map((name) => ({ name })));
  }

  return TeamType.find().sort({ name: 1 });
}

export async function createTeamType({ name }) {
  const existing = await TeamType.findOne({ name });

  if (existing) {
    throw new ApiError(409, "A team type with this name already exists");
  }

  return TeamType.create({ name });
}

export async function updateTeamType(teamTypeId, payload) {
  const teamType = await TeamType.findById(teamTypeId);

  if (!teamType) {
    throw new ApiError(404, "Team type not found");
  }

  ["name", "isActive"].forEach((field) => {
    if (payload[field] !== undefined) {
      teamType[field] = payload[field];
    }
  });

  await teamType.save();

  return teamType;
}

/**
 * Validates `Team.type` against the active team type list — the one place
 * this rule lives, called from both `createTeam` and `updateTeam` below, the
 * same "one shared validator, not duplicated ad hoc" reasoning as
 * `ensureValidManagerId`. A no-op for an empty/undefined type — `type`
 * itself stays optional, matching this field's pre-existing behavior before
 * this validation was added.
 */
export async function ensureValidTeamType(type) {
  if (!type) {
    return;
  }

  // Self-seeding: a team creation is a perfectly valid first-ever caller,
  // not just `GET /team-types` — this way the defaults exist regardless of
  // which entry point happens to run first.
  await listTeamTypes();

  const teamType = await TeamType.findOne({ name: type, isActive: true });

  if (!teamType) {
    throw new ApiError(400, "type must match the name of an existing, active team type");
  }
}

/**
 * Derived member list — see team.model.js's own docblock for why this is
 * never a stored array. `select` mirrors `listUsersForDropdown`'s own
 * low-sensitivity field set (id/name/role), plus `email` since the Team
 * Management screen's member list is an admin-facing roster view, not a
 * bare picker.
 */
export async function getTeamMembers(teamId) {
  const team = await findTeamOrThrow(teamId);

  return User.find({ managerId: team.headManagerId }).select("_id name role email").sort({ name: 1 });
}

async function findTeamOrThrow(teamId) {
  const team = await Team.findById(teamId);

  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  return team;
}

/**
 * `type`/`isActive` filters (§7.28) — plain equality matches, combined with
 * the existing full-listing query, not a replacement of it.
 */
export async function listTeams(filters = {}) {
  const typeFilter = filters.type ? { type: filters.type } : {};
  const isActiveFilter =
    filters.isActive !== undefined ? { isActive: filters.isActive === "true" || filters.isActive === true } : {};

  const teams = await Team.find({ ...typeFilter, ...isActiveFilter }).sort({ name: 1 });

  // One extra query per team for its member count — teams are an
  // infrequently-listed, small admin-facing collection (org structure, not
  // a high-volume list like Leads/Payments), so N+1 here isn't the same
  // concern it would be for a customer-facing table.
  return Promise.all(
    teams.map(async (team) => {
      const memberCount = await User.countDocuments({ managerId: team.headManagerId });
      return { ...team.toObject(), memberCount };
    })
  );
}

export async function getTeamById(teamId) {
  const team = await findTeamOrThrow(teamId);
  const members = await getTeamMembers(teamId);

  return { ...team.toObject(), members };
}

export async function createTeam({ name, type, headManagerId }) {
  await ensureValidManagerId(headManagerId);
  await ensureValidTeamType(type);

  return Team.create({ name, type, headManagerId });
}

export async function updateTeam(teamId, payload) {
  const team = await findTeamOrThrow(teamId);

  if (payload.headManagerId !== undefined) {
    await ensureValidManagerId(payload.headManagerId);
    team.headManagerId = payload.headManagerId;
  }

  if (payload.type !== undefined) {
    await ensureValidTeamType(payload.type);
  }

  ["name", "type", "isActive"].forEach((field) => {
    if (payload[field] !== undefined) {
      team[field] = payload[field];
    }
  });

  await team.save();

  return team;
}

/**
 * Deleting a Team never touches its members' own `User.managerId` — that
 * relationship lives on the User, not on this Team doc (see team.model.js),
 * so removing the Team simply stops it being listed; its former members'
 * `managerId` still points at the same manager/admin until an admin
 * explicitly reassigns them via `removeMemberFromTeam` or User Management
 * directly.
 */
export async function deleteTeam(teamId) {
  const team = await findTeamOrThrow(teamId);

  await team.deleteOne();
}

/**
 * A user can only ever be a "member" of one team at a time — a natural
 * consequence of `managerId` being a single field, not a rule enforced with
 * extra bookkeeping here: adding someone to Team B by setting their
 * managerId to Team B's headManagerId automatically stops them counting as
 * a member of whichever team Team A's headManagerId used to resolve them
 * under, with no explicit "remove from Team A" step needed.
 */
export async function addMemberToTeam(teamId, userId) {
  const team = await findTeamOrThrow(teamId);

  return assignManager(userId, team.headManagerId);
}

/**
 * Clears the member's managerId entirely (keep-simple, per this task's own
 * instruction) rather than prompting for reassignment — an admin can always
 * set a new manager afterward via this same flow or User Management.
 */
export async function removeMemberFromTeam(teamId, userId) {
  await findTeamOrThrow(teamId);

  return assignManager(userId, null);
}
