# Deploy readiness — 2026-10-26 (NOT deployed)

Branch: `backup/full-2026-10-23` — 179 commits ahead of `main`. Nothing has been deployed, no Vercel setting
changed, the production database was never touched. Deploying is the owner's go.

## Verdict

**Ready to deploy once the owner says go**. The tests pass, the database changes only add things, and the cron
endpoints are already protected by the existing secrets. Do it in this order: backend → web → (after a smoke
test) hand out the production APK. Before inviting staff, add the Google Maps keys and the Firebase files; without
them the maps say "Map not configured" and there's no push. Everything else works without them.

## Tests (2026-10-26, emulator off)

| Suite | Result |
|---|---|
| Backend (Vitest + in-memory Mongo) | 1265 / 1265 |
| Web (Vitest) | 1016 tests — 4 fail in `UserManagementPage.test.jsx` only under the full parallel run (timeouts on this 7.7 GB laptop); the file passes alone 27/27. Known, pre-existing. |
| App (Jest) | 212 / 212 |
| Release APK on the emulator, Metro stopped | login, check-in/out, tracking, live status, notifications, calendar — see `log.md` item 9 |
| Web in Chrome 1280 / 390 | Live Map ("Map not configured"), dashboard "Live staff", attendance summary — no console errors, no overflow |

## Backend — Vercel environment

Nothing **new is required** to start. New OPTIONAL settings (defaults in brackets):

- Live status: `LIVE_MOVING_SPEED_KMH` [5], `LIVE_STATIONARY_RADIUS_METERS` [100], `LIVE_OFFLINE_AFTER_MINUTES` [6],
  `LIVE_DISCONNECTED_AFTER_MINUTES` [30], `LIVE_BATTERY_LOW_PERCENT` [15], `LIVE_ALERT_AFTER_MINUTES` [15],
  `LIVE_PLACE_RADIUS_METERS` [200]
- Mobile sessions: `MOBILE_ACCESS_TOKEN_TTL` [15m], `MOBILE_REFRESH_TOKEN_TTL_DAYS` [30]
- Shifts: `SHIFT_REMINDER_AFTER_HOURS` [10], `TRACKING_STOP_AFTER_HOURS` [12], `GEOFENCE_MAX_ACCURACY_METERS` [100],
  `ATTENDANCE_GAP_THRESHOLD_MINUTES` [10] (unchanged)
- Push: `FCM_ENABLED=true` **and then** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  become required (the server refuses to start with FCM on and any of them missing — on purpose).
- `ALLOW_REMOTE_DB` is a LOCAL-only guard; production is never checked by it — do not set it on Vercel.

## Web — Vercel environment

- `VITE_GOOGLE_MAPS_API_KEY` — browser key restricted to the CRM's domains, "Maps JavaScript API" only.
  Without it every map shows "Map not configured" and no Maps script loads.

## Crons (`backend/vercel.json`) — 3 daily jobs

| Path | IST | Purpose |
|---|---|---|
| `/api/v1/attendance/cleanup` | 08:00 | existing |
| `/api/v1/attendance/open-shift-reminders` | 23:00 | NEW — "you forgot to check out" |
| `/api/v1/tickets/escalations/run` | 09:00 | NEW — complaint reminders + daily summary |

All use the existing `CRON_SECRET` / `ATTENDANCE_CLEANUP_TOKEN` (machineToken middleware). **Check the Vercel
plan's cron limit** covers 3 jobs. Live-status manager alerts don't use a cron. They run when there's activity
(pings, live-status reads), at most once every 3 minutes.

## Database (production MongoDB) — nothing destructive

- New collections, created on first write: services, complaint counters/digests, refresh tokens, device tokens,
  location consents, shift reminders, employee live status, location status events, site visits.
- New indexes are built by Mongoose on start. That includes a **45-day TTL** on location status events, which
  removes old events automatically.
- Existing collections: fields only ADDED (photos, reminders, status history on tickets; complaint link token on
  customers; speed/device on location pings; connectivity/geofence on attendance). Ticket statuses: the new list
  keeps every old value, so existing tickets stay valid.
- No migration script needs to run.

## Mobile

- Upload key created 2026-10-26: `D:\Tools\keys\smartrays-upload.jks` (password file to be moved by the owner).
  SHA-1 `6E:01:75:8E:04:92:A1:86:CF:DF:13:F5:C2:62:FA:73:3A:6D:45:4F`.
- `app/dist/smartrays-production-signed-1.0.apk` → the live backend, HTTPS only. It needs the backend deployed
  first. The live server doesn't have today's endpoints yet.
- Play Store: create the listing (Play Console account = owner), use Play App Signing, add its SHA-1 to the
  Maps Android key, store icon `app/store/play-icon-512.png`, the location-tracking declaration + prominent
  disclosure (already in the app), privacy policy URL.

## Risks / watch after deploy

1. **Working hours and connectivity gaps:** a technician without signal who keeps recording locations still
   loses that time. A fix has been proposed, and it is waiting for the owner's yes (payroll).
2. **The month summary now counts DAYS, not records** (owner's decision), on web and app. Numbers fall wherever
   someone had several shifts in a day.
3. **Maps:** "Map not configured" until the keys are in.
4. **Push:** none until Firebase is configured; the in-app notifications list covers the gap.

## Rollback

Vercel → Deployments → promote the previous production deployment (instant), for backend and web separately.
The database changes only add things, so the old code runs on the new data.
