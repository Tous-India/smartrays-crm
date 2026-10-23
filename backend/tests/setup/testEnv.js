// Runs before every test file (vitest.config.js → setupFiles). Tests never
// read the developer's .env/.env.local (config/env.js skips dotenv under
// Vitest), so the variables env.js requires at import time are provided here,
// with the same dummy values tests/helpers/testDb.js uses. A test file that
// imports app code at the top level — before calling startTestDatabase() —
// no longer depends on whatever happens to be in a local .env.
//
// MONGODB_URI is a placeholder nothing connects to: testDb.js replaces it with
// the in-memory server's URI before connecting.
const TEST_ENV_DEFAULTS = {
  NODE_ENV: "test",
  PORT: "5001",
  MONGODB_URI: "mongodb://127.0.0.1:1/replaced-by-testDb",
  JWT_SECRET: "test-jwt-secret",
  JWT_EXPIRES_IN: "1h",
  COOKIE_NAME: "test_token",
  CLIENT_ORIGIN: "http://localhost:5173,http://localhost:5174",
  CREDENTIALS_ENCRYPTION_KEY: "Ox+fuVxg2MNfAXFHiw/6tEKMCTeJGrTg+j7xxhaTb2c=",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-api-key",
  CLOUDINARY_API_SECRET: "test-api-secret",
  GOOGLE_MAPS_API_KEY: "test-google-maps-key",
  VAPID_PUBLIC_KEY: "BMI_K3EwF0pYWhlolXL8edqnU4fBhH-7jHpPEASE8HPnl1O_dQKkKBI2sl6D_0PRhwo73nh2lvYM6u7WJlUXCMY",
  VAPID_PRIVATE_KEY: "0UB1ZNxgN8VehJpReYGTEsjlNsDuXyiZAKcWw9QAbmM",
  SMTP_HOST: "smtp.test.local",
  SMTP_PORT: "587",
  SMTP_USER: "test@smartrayssolutions.com",
  SMTP_PASSWORD: "test-smtp-password",
  SMTP_FROM: "Smartrays CMS <no-reply@smartrayssolutions.com>",
  // Complaint escalations run on request activity in production; tests call
  // them explicitly instead, so no request sends notifications on the side.
  COMPLAINT_CHECKS_ON_ACTIVITY: "false",
  // Live-status manager alerts run on activity in the app; never behind a test.
  LIVE_ALERTS_ON_ACTIVITY: "false",
};

for (const [name, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}
