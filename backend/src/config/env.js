import dotenv from "dotenv";

// Load shared defaults first, then let .env.local override anything on this machine.
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

// Only variables the app needs at boot today are required here.
// CREDENTIALS_ENCRYPTION_KEY was added 2026-07-13 alongside the customer
// module's Credentials vault (§6.3/§11.8) — every Credential record is
// encrypted at rest, so the app can't run correctly without this key present
// from boot. CLOUDINARY_* was added the same day (full Phase 3 Attendance
// build, §7.4) — check-in/check-out photo capture genuinely needs Cloudinary
// to be configured, so these are required now too, not optional.
// GOOGLE_MAPS_API_KEY was added for Transport/Travel (§7.6, Phase 6) — every
// TravelLog distance computation depends on it (auto-generated at Attendance
// checkout, or on manual entry when coords are supplied without a distanceKm
// override), so the app can't run this feature correctly without it either.
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY were added for Phase 9's Notification
// module (§6.7/§7.11-Platform) — src/services/webPush.service.js configures
// the `web-push` package with these at import time, so a real push send
// (lead assignment, ticket assignment, follow-up reminders) can't work
// without them. Generate a real pair with `web-push`'s own
// `generateVAPIDKeys()` utility (see .env.example) — there's no safe
// placeholder for a public-key-cryptography keypair the way there is for
// e.g. a Cloudinary cloud name.
const requiredEnvVars = [
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "COOKIE_NAME",
  "CLIENT_ORIGIN",
  "CREDENTIALS_ENCRYPTION_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "GOOGLE_MAPS_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
];

function validateEnvVars() {
  const missingVars = [];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
    process.exit(1);
  }
}

validateEnvVars();

// `CLIENT_ORIGIN` accepts a comma-separated list (2026-08-04) — production
// stays a single value (crm.smartrayssolutions.com); local dev can list
// several (e.g. "http://localhost:5173,http://localhost:5174") to absorb
// Vite's own port-drift when 5173 is already taken by another running
// instance, which repeatedly looked like a login/credentials bug this
// session when it was actually the browser silently CORS-blocking a
// request from whichever port Vite fell back to. See backend/README.md's
// CORS section for the full incident writeup.
const clientOrigins = process.env.CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV,
  isProduction: process.env.NODE_ENV === "production",
  port: process.env.PORT,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  cookieName: process.env.COOKIE_NAME,
  // The single, canonical origin — used wherever exactly one URL is needed
  // (e.g. auth.service.js's password-reset email link, which can only ever
  // point at one place). Always the FIRST entry in CLIENT_ORIGIN's list.
  // CORS itself uses `clientOrigins` (the full list) below, not this.
  clientOrigin: clientOrigins[0],
  clientOrigins,
  // Not required at boot (see requiredEnvVars above) — the Location Tracking
  // module (.context/final-plan.md §7.4b) is optional infrastructure, not
  // needed for the app to run. Defaults to 2 minutes if unset.
  locationPingIntervalMinutes: process.env.LOCATION_PING_INTERVAL_MINUTES || "2",
  // 32-byte, base64-encoded AES-256-GCM key for the Credentials vault
  // (§6.3/§11.8) — see src/services/credentialEncryption.service.js.
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY,
  // File storage for check-in/check-out photos (§6.5/§7.4) — see
  // src/services/cloudinary.service.js.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  // Not required at boot — optional connectivity-gap sensitivity tuning for
  // Attendance (§6.5/§7.4). Defaults to 10 minutes if unset: roughly two
  // missed heartbeats at the expected ~2-5 minute client cadence before a gap
  // is recorded, rather than flagging routine jitter as a connectivity issue.
  attendanceGapThresholdMinutes: process.env.ATTENDANCE_GAP_THRESHOLD_MINUTES || "10",
  // Not required at boot — optional geofencing sensitivity tuning for
  // Attendance/Location (§6.5/§7.4). Defaults to 500 meters if unset: how far
  // a location ping may drift from the shift's check-in point before it's
  // recorded as a geofence violation. See attendance.service.js#applyGeofenceCheck.
  geofenceRadiusMeters: process.env.GEOFENCE_RADIUS_METERS || "500",
  // Not required at boot — how long Attendance records (and their Cloudinary
  // photos) are kept before the retention job deletes them (§6.5, 2026-08-05).
  // Defaults to 45 days if unset. See attendance.service.js#runAttendanceRetention
  // and backend/README.md's Data retention section.
  attendanceRetentionDays: process.env.ATTENDANCE_RETENTION_DAYS || "45",
  // Shared secret for POST /attendance/cleanup — the retention job is
  // machine-only (Vercel Cron), never reachable via normal user auth. Same
  // header-token pattern as the website lead intake webhook.
  attendanceCleanupToken: process.env.ATTENDANCE_CLEANUP_TOKEN,
  // Google Maps Distance Matrix API key (§6.5/§7.6) — see
  // src/services/googleMaps.service.js.
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  // Not required at boot — Payroll mileage reimbursement rate (§6.5/§7.7), currency
  // units per km. Defaults to 10 if unset. Deliberately a single global rate, not
  // per-role/per-project (a documented v1 simplification, not an oversight) — see
  // payroll.service.js#runPayroll. PLACEHOLDER: the client must set the real rate.
  mileageRatePerKm: Number(process.env.MILEAGE_RATE_PER_KM) || 10,
  // VAPID keypair for Web Push (§6.7/§3) — see src/services/webPush.service.js.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  // Not required at boot — the `mailto:`/`https:` contact URL web-push's spec
  // asks VAPID senders to supply (so a push service operator has somewhere to
  // reach the sender about abuse) — has a sensible default, no reason to force
  // every environment to set it explicitly.
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:support@smartrayssolutions.com",
  // SMTP config for the self-service forgot/reset-password email flow (§7.17)
  // — see src/services/email.service.js. Required at boot like the other
  // real third-party integrations above (Cloudinary, Google Maps, VAPID):
  // password reset genuinely cannot work without a working mail transport.
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM,
  // Shared secret for the public `POST /leads/website-intake` webhook (the
  // WordPress/Forminator lead-intake integration) — not required at boot,
  // like the other optional integrations above. If unset, that route
  // refuses every request (fail-closed) rather than the server accepting
  // unauthenticated writes with no way to lock them down. See
  // lead.routes.js#verifyWebsiteIntakeToken.
  websiteLeadIntakeToken: process.env.WEBSITE_LEAD_INTAKE_TOKEN,
};
