import mongoose from "mongoose";
import { env } from "../config/env.js";

/**
 * Connects to MongoDB using the URI from environment config.
 * Exits the process on failure since the app cannot run without a database.
 */
export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}
