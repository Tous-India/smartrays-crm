import mongoose from "mongoose";
import { env } from "../config/env.js";
import { assertDatabaseTargetAllowed } from "../config/databaseGuard.js";

// Cached across invocations — required once this app also runs on Vercel's
// serverless Node runtime (backend/api/index.js), where every request can be
// a fresh cold start; without this, each invocation would open a brand new
// MongoDB connection and quickly exhaust Atlas's free-tier connection cap.
// Harmless for local dev too (server.js is a single long-lived process that
// only ever calls this once regardless).
let cachedConnectionPromise = null;

/**
 * Connects to MongoDB, reusing an in-flight/established connection if one
 * already exists rather than opening a new one every call.
 */
export async function connectDatabase() {
  if (cachedConnectionPromise) {
    return cachedConnectionPromise;
  }

  // Outside production, only a local database unless ALLOW_REMOTE_DB=true
  // (config/databaseGuard.js). Checked before any connection is attempted.
  try {
    assertDatabaseTargetAllowed({
      nodeEnv: env.nodeEnv,
      mongodbUri: env.mongodbUri,
      allowRemoteDb: env.allowRemoteDb,
    });
  } catch (error) {
    console.error(error.message);
    throw error;
  }

  cachedConnectionPromise = mongoose
    .connect(env.mongodbUri)
    .then((connection) => {
      console.log("MongoDB connected successfully");
      return connection;
    })
    .catch((error) => {
      // Let the next call retry instead of permanently caching a rejection.
      cachedConnectionPromise = null;
      console.error("MongoDB connection failed:", error.message);
      throw error;
    });

  return cachedConnectionPromise;
}
