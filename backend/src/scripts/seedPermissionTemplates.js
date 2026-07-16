import mongoose from "mongoose";
import { connectDatabase } from "../database/connection.js";
import { listTemplates } from "../modules/permission/permission.service.js";

/**
 * Ensures all 5 role templates exist, seeding any that are missing with the
 * initial defaults from .context/final-plan.md §5/§7.12. Safe to re-run —
 * only creates missing templates, never overwrites one that already exists
 * (including one an admin has already customized). GET /permissions/templates
 * lazily does the same thing on first fetch; this script just makes that an
 * explicit, ops-friendly step. Run with: npm run seed:permission-templates
 */
async function seedPermissionTemplates() {
  await connectDatabase();

  const templates = await listTemplates();

  templates.forEach((template) => {
    console.log(`Template ready for role "${template.role}"`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

seedPermissionTemplates().catch((error) => {
  console.error("Failed to seed permission templates:", error.message);
  process.exit(1);
});
