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
    // Free text, not a rigid enum ("Sales", "Technical", "Installation", ...)
    // — so an admin isn't blocked from naming a new kind of team as the org
    // grows, unlike e.g. Contract's fixed `type` enum.
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
