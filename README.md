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
