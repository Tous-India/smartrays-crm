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
  // Two origins by default (not just one) so app.test.js's multi-origin CORS
  // tests exercise the real comma-separated parsing (§CORS, 2026-08-04),
  // matching the real .env's own default.
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174";
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
  // env.js requires these at boot now that the Notification module exists
  // (§6.7/Phase 9) — and `webPush.service.js` calls `web-push`'s
  // `setVapidDetails()` at import time, which validates the public key is a
  // real 65-byte VAPID key and throws synchronously otherwise. Since nearly
  // every test file transitively imports it (app.js -> route.js ->
  // lead/ticket routes -> their services -> notification.service.js), an
  // arbitrary placeholder string here would break the ENTIRE suite at
  // import time, not just notification.test.js. This is a real, validly-
  // shaped keypair generated once for this fixture only (`web-push`'s own
  // `generateVAPIDKeys()`) — not a production secret, the same treatment
  // CREDENTIALS_ENCRYPTION_KEY's fixed test key already gets. No test ever
  // sends a real push regardless: `src/services/webPush.service.js` is
  // mocked at the module boundary in notification.test.js (and anywhere
  // else a real PushSubscription is seeded), and with no subscriptions
  // seeded, `createNotification` never calls it at all.
  process.env.VAPID_PUBLIC_KEY =
    process.env.VAPID_PUBLIC_KEY ||
    "BMI_K3EwF0pYWhlolXL8edqnU4fBhH-7jHpPEASE8HPnl1O_dQKkKBI2sl6D_0PRhwo73nh2lvYM6u7WJlUXCMY";
  process.env.VAPID_PRIVATE_KEY =
    process.env.VAPID_PRIVATE_KEY || "0UB1ZNxgN8VehJpReYGTEsjlNsDuXyiZAKcWw9QAbmM";

  // env.js requires these at boot now that the self-service password reset
  // flow exists (§7.13) — src/services/email.service.js's
  // `nodemailer.createTransport()` doesn't validate synchronously at import
  // (unlike `web-push`'s `setVapidDetails()`), so these dummy values are only
  // here to satisfy env.js's required-var check, not because a real SMTP
  // connection is ever attempted. Every test that exercises forgot/reset-
  // password mocks src/services/email.service.js at the module boundary —
  // no test ever sends a real email.
  process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.test.local";
  process.env.SMTP_PORT = process.env.SMTP_PORT || "587";
  process.env.SMTP_USER = process.env.SMTP_USER || "test@smartrayssolutions.com";
  process.env.SMTP_PASSWORD = process.env.SMTP_PASSWORD || "test-smtp-password";
  process.env.SMTP_FROM = process.env.SMTP_FROM || "Smartrays CMS <no-reply@smartrayssolutions.com>";

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
