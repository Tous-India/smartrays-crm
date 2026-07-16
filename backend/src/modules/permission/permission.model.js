import mongoose from "mongoose";
import { USER_ROLES } from "../user/user.model.js";

const rolePermissionTemplateSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      unique: true,
    },
    // Same shape as User.permissions — { module: { action: boolean } }.
    permissions: {
      type: Object,
      default: {},
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    // Same reasoning as User (.context/final-plan.md §6.1): an explicit empty
    // grant must stay visible in API responses, not silently disappear.
    minimize: false,
  }
);

const RolePermissionTemplate = mongoose.model("RolePermissionTemplate", rolePermissionTemplateSchema);

export default RolePermissionTemplate;
