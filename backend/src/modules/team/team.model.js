import mongoose from "mongoose";

/**
 * A Team is just a named grouping around a manager/admin — deliberately NO
 * stored `memberIds` array. Membership is derived live by querying
 * `User.find({ managerId: team.headManagerId })` (team.service.js#getTeamMembers),
 * the exact same managerId-based "own team" mechanism Leads/Customers/
 * Attendance/User already use (.context/final-plan.md §11.9). Storing a
 * second, separate membership list here would let it drift out of sync with
 * the real source of truth (`User.managerId`) — e.g. an admin reassigning a
 * user's manager directly via User Management would silently leave a stale
 * entry in this Team's own member list. Deriving it live means there is
 * exactly one place team membership can ever be wrong: `User.managerId`
 * itself, already covered by every existing "own team" scoping check.
 */
const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // References TeamType.name (an admin-managed config list, §7.30,
    // 2026-07-31), a plain String rather than an ObjectId — the same
    // storage shape leadSource.model.js uses for Lead.source, chosen so an
    // existing Team whose type is later deactivated in TeamType still
    // displays its type string normally rather than a broken/dangling
    // reference. Unlike Lead.source (never actually validated against
    // LeadSource), this field IS validated against the active TeamType list
    // on create/update — see team.service.js#ensureValidTeamType. Still
    // optional, not a rigid enum on the schema itself — an admin can always
    // add a new TeamType as the org grows, without a migration.
    type: {
      type: String,
      trim: true,
    },
    // Must reference a user with role "manager" or "admin" — validated in
    // team.service.js the same way User.managerId already is
    // (user.service.js#ensureValidManagerId), not duplicated ad hoc here.
    headManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Whether members of this team may see each other's contact details
    // (§7.39, 2026-08-05). Default false — a teammate list is for knowing WHO
    // you work with; phone numbers and emails are a separate disclosure, and
    // defaulting them open would leak everyone's details org-wide the moment
    // the team page shipped. When false the contact fields are OMITTED from
    // the response entirely rather than hidden client-side, so they never
    // travel to a browser that shouldn't have them.
    showContactsToMembers: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Team = mongoose.model("Team", teamSchema);

export default Team;
