# Smartrays Solutions CMS

Internal CRM + Operations platform (MERN stack) — Leads, Customers, Projects, Attendance,
Live Location Tracking, Leave, Payroll, Support Tickets, Payments, AMC, cross-module Reports,
and more, unified under one role/permission system.

## Project Documentation

| Where | What lives there |
|---|---|
| [`.context/final-plan.md`](.context/final-plan.md) | The authoritative plan — full data models, permission matrix, REST API surface, folder structure, phased roadmap. Source of truth for scope. |
| [`.context/smartrays.md`](.context/smartrays.md) | Original raw requirements + the fixed tech stack and coding standards. |
| [`.context/leads-customer-functional-spec.md`](.context/leads-customer-functional-spec.md) | UX/data-model reference for Leads & Customers only (from a different product — its tech stack is not used here). |
| [`docs/project-status.md`](docs/project-status.md) | Current implementation status — what's built, what's next, open decisions. |
| [`backend/README.md`](backend/README.md) | Backend setup, architecture, module list, endpoints, env vars. |
| [`frontend/README.md`](frontend/README.md) | Frontend setup, folder conventions, module pattern, how to run tests. |

## Tech Stack

- **Backend:** Node.js, Express (ES Modules), MongoDB + Mongoose, JWT in httpOnly cookies
- **Frontend:** React + Vite, JavaScript (no TypeScript), React Router DOM, Tailwind CSS + Ant Design, Zustand (only where genuinely needed)

Fixed per `.context/smartrays.md` — see that file before proposing any stack changes.

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in CREDENTIALS_ENCRYPTION_KEY, CLOUDINARY_*, GOOGLE_MAPS_API_KEY,
                          # and VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — all required, see below
npm run seed:admin                    # one-time: creates the first admin user
npm run seed:permission-templates     # optional: pre-seeds the 5 role permission templates
npm run dev
```

Full setup details, module list, and API reference: [`backend/README.md`](backend/README.md).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_BASE_URL (default http://localhost:5000/api/v1) and
                          # VITE_GOOGLE_MAPS_API_KEY (powers the Location live-map view —
                          # a separate, browser-exposed key from the backend's own)
npm run dev
```

Full setup details, folder conventions, and how to add a new module:
[`frontend/README.md`](frontend/README.md).

### Running both together

Two terminals, backend first (the frontend has no mock data layer — every non-placeholder
page talks to the real API):

```bash
# terminal 1
cd backend && npm run dev     # http://localhost:5000

# terminal 2
cd frontend && npm run dev    # http://localhost:5173
```

## Deployment

Live on Vercel as two separate projects (monorepo, each deployed from its own subdirectory
via the Vercel CLI — no GitHub auto-deploy, since the Vercel account and the `Tous-India`
GitHub org are on different emails):

| Project | Root Directory | URL |
|---|---|---|
| `smartrays-crm-backend` | `backend` | https://smartrays-crm-backend.vercel.app |
| `smartrays-crm` | `frontend` | https://smartrays-crm.vercel.app |

**Redeploying** (from the repo root — each project's Root Directory setting handles the
subfolder automatically; running `vercel` from inside `backend/`/`frontend/` directly causes
a "path does not exist" error because the Root Directory then gets applied twice):

```bash
cd /path/to/smartrays          # repo root, not backend/ or frontend/
vercel link --yes --project smartrays-crm-backend --scope smartrays
vercel deploy --prod --yes     # redeploy backend

vercel link --yes --project smartrays-crm --scope smartrays
vercel deploy --prod --yes     # redeploy frontend
```

**Backend serverless adaptation** — Vercel is serverless, but `app.js`/`server.js` stay
exactly as they are for local dev:
- `backend/api/index.js` imports the existing Express `app` and wraps it in a handler function
  (ensuring a DB connection first) — this is Vercel's entry point, not `server.js`.
- `backend/vercel.json` rewrites every request to that handler.
- `src/database/connection.js` caches the Mongo connection promise across invocations —
  required so serverless cold starts don't each open a new connection and exhaust Atlas's
  free-tier connection cap.

**Known production gap — cron jobs don't run.** `payrollCron` (monthly) and
`leadFollowUpReminderCron` (every 5 min) both rely on `node-cron`, which needs a long-lived
process to fire on schedule. Vercel's serverless functions have no such process — nothing
stays alive between requests. `server.js` guards their registration behind
`process.env.VERCEL !== '1'` so this doesn't crash the deploy; it just means neither cron
fires in production today. Real fix needed later: Vercel Cron Jobs hitting a dedicated
endpoint for payroll (its monthly cadence fits Vercel Cron's free-tier daily-minimum-interval
fine), and a different answer entirely for the 15-minute-granularity lead follow-up reminders
(Vercel Cron's free tier can't go that frequent) — likely a separate always-on process
(a small VM, or a scheduler service) rather than trying to force it onto Vercel.

**Env vars** — same required set as local dev (see `backend/.env.example`), pushed to the
backend Vercel project via `vercel env add <NAME> production`. Cloudinary/Google Maps/SMTP
are placeholder values in production for now (env.js only checks presence, not validity — the
app boots fine; only features touching those specific services fail at runtime, which is
expected until real credentials are supplied). VAPID keys are a real generated keypair
(`web-push`'s `generateVAPIDKeys()`), not placeholders — `web-push` validates key format at
import time and crashes the whole app on a fake one. `CLIENT_ORIGIN` is set to the deployed
frontend's URL (required for CORS); the frontend's `VITE_API_BASE_URL` is set to the deployed
backend's URL + `/api/v1`.

**Cross-origin cookies** — since frontend and backend are on different Vercel domains, the
auth cookie is genuinely cross-site. `auth.service.js#getAuthCookieOptions` sets
`sameSite: 'none'` + `secure: true` in production (still `lax`/non-secure for local dev) —
verified working end-to-end (login → Set-Cookie → authenticated `/auth/me`) against the live
deployment, not just assumed.

**Every backend phase is now built** (Phase 9's backend half — Notification module, Web Push,
lead follow-up reminder cron — closed it out). On the frontend: Phase 0 (scaffold, auth flow,
routing shell), Leads (Table/Board/Detail/Import/Export — the reference implementation for
later modules), Customers (List/Detail/Contracts/Contacts/Credentials/Activity), and
Attendance + Leave + a new Location live-map view (built together — check-in/out widget with
native camera/geolocation capture, connectivity-gap timeline, Leave request/approval, and a
`/location` live-map + history-trail view via the native Google Maps JS SDK) are all built,
including the client-side loop that actually submits `POST /attendance/heartbeat`/
`POST /location/pings` on an interval while checked in (`useCheckedInHeartbeatLoop`) — see
[`docs/project-status.md`](docs/project-status.md) for current progress and
[`.context/final-plan.md`](.context/final-plan.md) §10 for the phased roadmap. Every other
module's frontend (Payroll, Transport, Tickets, ...) is still routing-skeleton + placeholder
pages only, filled in module-by-module in later frontend tasks; Phase 9's frontend half
(Dashboard polish, PWA service worker for push receipt/display) is also still open.
