import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer;

/**
 * Starts an in-memory MongoDB instance and points MONGODB_URI at it, along
 * with every other env var src/config/env.js requires at import time. Must
 * run — and finish — before anything under src/ is imported, since env.js
 * validates and exits the process if a required var is missing. Test files
 * satisfy this by dynamically importing app.js only after calling this
 * function (see testApp.js), never as a static top-level import.
 */
export async function startTestDatabase() {
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.PORT = process.env.PORT || "5001";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
  process.env.COOKIE_NAME = process.env.COOKIE_NAME || "test_token";
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  // Fixed 32-byte base64 key so Credential encryption/decryption round-trips
  // deterministically across test runs — not a real secret, test-only.
  process.env.CREDENTIALS_ENCRYPTION_KEY =
    process.env.CREDENTIALS_ENCRYPTION_KEY || "Ox+fuVxg2MNfAXFHiw/6tEKMCTeJGrTg+j7xxhaTb2c=";
  // env.js requires these at boot now that Attendance photo capture exists
  // (§7.4). Dummy values — no test ever makes a real Cloudinary API call;
  // attendance.test.js mocks src/services/cloudinary.service.js instead.
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "test-cloud";
  process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "test-api-key";
  process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "test-api-secret";
  // env.js requires this at boot now that Transport/Travel exists (§7.6).
  // Dummy value — no test ever makes a real Google Maps API call;
  // travelLog.test.js (and any test that exercises Attendance checkout)
  // mocks src/services/googleMaps.service.js instead.
  process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-google-maps-key";

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();

  await mongoose.connect(process.env.MONGODB_URI);
}

export async function stopTestDatabase() {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Deletes every document from the given collections, by Mongoose model
 * collection name (e.g. "leads", "users"). Leaves other collections alone.
 */
export async function clearCollections(collectionNames) {
  for (const name of collectionNames) {
    if (mongoose.connection.collections[name]) {
      await mongoose.connection.collections[name].deleteMany({});
    }
  }
}

export async function clearAllCollections() {
  await clearCollections(Object.keys(mongoose.connection.collections));
}
