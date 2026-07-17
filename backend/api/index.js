import app from "../app.js";
import { connectDatabase } from "../src/database/connection.js";

/**
 * Vercel's serverless entry point — app.js itself is untouched and stays
 * usable for local dev via server.js exactly as before. This just ensures a
 * (cached, see src/database/connection.js) DB connection exists before each
 * invocation, then hands the request straight to the existing Express app.
 * No cron registration here — see server.js's `VERCEL` guard and
 * backend/README.md's Deployment section for why (node-cron needs a
 * long-lived process, which serverless functions are not).
 */
export default async function handler(req, res) {
  await connectDatabase();
  app(req, res);
}
