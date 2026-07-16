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
| `frontend/README.md` | Not created yet — added once frontend work begins. |

## Tech Stack

- **Backend:** Node.js, Express (ES Modules), MongoDB + Mongoose, JWT in httpOnly cookies
- **Frontend:** React + Vite, JavaScript (no TypeScript), React Router DOM, Tailwind CSS + Ant Design, Zustand (only where genuinely needed)

Fixed per `.context/smartrays.md` — see that file before proposing any stack changes.

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in CREDENTIALS_ENCRYPTION_KEY, CLOUDINARY_*, and GOOGLE_MAPS_API_KEY — all required, see below
npm run seed:admin                    # one-time: creates the first admin user
npm run seed:permission-templates     # optional: pre-seeds the 5 role permission templates
npm run dev
```

Full setup details, module list, and API reference: [`backend/README.md`](backend/README.md).

### Frontend

Not started yet — only the backend has been built so far (`auth` — including Customer Portal
self-signup — `lead`, `location`, `permission`, `user`, `customer`, `project`, `attendance`,
`leave`, `transport`, `payroll`, `ticket`, `payment`, `amc`, and `report` modules). See
[`docs/project-status.md`](docs/project-status.md) for current progress and
[`.context/final-plan.md`](.context/final-plan.md) §10 for the phased roadmap.
