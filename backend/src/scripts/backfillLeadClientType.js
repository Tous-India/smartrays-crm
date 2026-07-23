import mongoose from "mongoose";
import { connectDatabase } from "../database/connection.js";
import Lead from "../modules/lead/lead.model.js";

/**
 * One-time backfill: `clientType` became a required Lead field after leads
 * already existed in the database. Mongoose enforces `required` on every
 * `.save()`, not just creation — so without this, any hot-toggle/status-
 * change/edit on a pre-existing lead (any lead created before this field was
 * added) would 500 with "Path `clientType` is required." the moment it's
 * next saved. Uses `updateMany` (bypasses schema validation, unlike `.save()`)
 * so it can actually write the missing field in the first place. Safe to
 * re-run — only touches documents where `clientType` doesn't already exist.
 * Run with: npm run backfill:lead-client-type
 */
async function backfillLeadClientType() {
  await connectDatabase();

  const result = await Lead.updateMany(
    { clientType: { $exists: false } },
    { $set: { clientType: "residential" } }
  );

  console.log(`Backfilled clientType on ${result.modifiedCount} lead(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

backfillLeadClientType().catch((error) => {
  console.error("Failed to backfill Lead clientType:", error.message);
  process.exit(1);
});
