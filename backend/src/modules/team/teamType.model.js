import mongoose from "mongoose";

/**
 * A structural mirror of `leadSource.model.js` (§7.30, 2026-07-31) — same
 * shape (`name`, `isActive`), same lazy-seed-on-first-read behavior in
 * `team.service.js#listTeamTypes`. Diverges from LeadSource in one
 * deliberate way: LeadSource has no admin CRUD and `Lead.source` is never
 * actually validated against it, but this task explicitly asked for a real
 * admin-managed list AND `Team.type` validated against it — see
 * `team.service.js#ensureValidTeamType`. Chosen over a free-text field to
 * stop the same kind of "Sales" vs "sales" vs "Sale Team" drift a rigid
 * list prevents everywhere else in this app.
 */
const teamTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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

const TeamType = mongoose.model("TeamType", teamTypeSchema);

export default TeamType;
