# Smartrays Solutions CMS — Frontend

React + Vite client for the internal CRM + Operations platform. JavaScript only (no
TypeScript), Tailwind CSS + Ant Design, React Router DOM, Zustand (only for genuine
cross-page state), Axios, `@dnd-kit` (drag-and-drop for the Leads kanban board).

See `.context/final-plan.md` (repo root) — §3 (tech stack), §8 (route map), §9 (folder
structure), §7.13 (Dashboard shell) — for the full plan this frontend is built against.
`.context/smartrays.md` is the source of the coding standards referenced below.
`backend/README.md` documents the API this app talks to.

---

## Setup

```bash
cd frontend
npm install
cp .env.example .env
cp .env.example .env.local   # optional, for personal machine overrides
```

Fill in `.env`:
- `VITE_API_BASE_URL` — the backend's API base URL, default `http://localhost:5000/api/v1`
  (must match `backend`'s `PORT` + its `/api/v1` mount prefix, see `backend/src/route.js`)

### Running

```bash
npm run dev       # Vite dev server (default port 5173)
npm run build     # production build → dist/
npm run preview   # serve the production build locally
```

Run the backend (`cd ../backend && npm run dev`) at the same time — this app has no mock
data layer, every page that isn't a placeholder talks to the real API.

### Testing

```bash
npm test          # vitest run — single pass, matches backend's `npm test` discipline
npm run test:watch
```

Vitest + React Testing Library + `@testing-library/user-event`, mirroring the backend's
testing discipline (`vitest`, no real network calls — every API call is mocked at the
module boundary, same principle as backend's Cloudinary/Google Maps mocking). jsdom is the
test environment; `src/test/setup.js` stubs `window.matchMedia` (jsdom doesn't implement
it, but Ant Design's responsive components call it unconditionally on mount) and wires up
`@testing-library/jest-dom`'s matchers.

**Known dev-only advisory:** none currently — `vitest@4` was chosen specifically because
`vitest@2`'s bundled internal Vite (5.x) doesn't correctly apply this project's
`@vitejs/plugin-react` under Vite 8, which silently broke JSX's automatic runtime in tests
(`ReferenceError: React is not defined`). `vitest@4` resolved both that bug and the
transitive `esbuild`/`vite` audit advisory `vitest@2` carried — no forced/breaking
workaround was needed, just following npm audit's own suggested fix.

**Testing drag-and-drop (`@dnd-kit`):** simulating a real pointer-drag sequence through
`@dnd-kit`'s `PointerSensor` under jsdom is brittle and doesn't actually exercise more
logic than testing the pieces directly. The Leads kanban board's drag-and-drop is instead
tested as: (1) a pure-function unit test of the drop-target resolution logic
(`resolveDropDestination.test.js` — "which lead, which column, is this actually a move"),
(2) a unit test of what happens once a status change is requested
(`useLeadStatusChangeFlow.test.js` — immediate transitions, lost-needs-a-reason-first,
won-triggers-convert), and (3) a plain rendering test that the right cards land in the
right columns (`LeadBoard.test.jsx`). Together these cover every rule the drag interaction
enforces, without a flaky DOM-drag simulation layered on top. Follow this same split
(pure decision logic extracted + tested directly) for any future drag-and-drop UI rather
than fighting jsdom.

---

## Architecture & Folder Structure

Per `.context/final-plan.md` §9 / `.context/smartrays.md`'s fixed structure:

```
src/
├── assets/        static images/icons
├── components/    shared, reusable components used across more than one module
├── layouts/       MainLayout (staff dashboard shell), PortalLayout (customer portal)
├── modules/       one folder per feature — see "Adding a new module" below
├── pages/         one file per route — thin wrappers that compose module components
├── routes/        router.jsx, ProtectedRoute, PermissionGate, RootRedirect
├── services/      apiClient.js — the one shared Axios instance
├── hooks/         shared hooks used across more than one module (e.g. usePermission)
├── context/       React context providers, only if Zustand genuinely isn't the right fit
├── store/         Zustand stores — sessionStore.js today; only genuine cross-page state
├── utils/         shared utilities (e.g. permission.utils.js)
├── constants/     shared constants (e.g. routePaths.constants.js)
├── styles/        index.css — Tailwind's entry point
├── App.jsx        router + top-level providers (AntD ConfigProvider)
└── main.jsx       React root, global CSS imports
```

### Adding a new module (mirrors backend's phase-by-phase build)

Per §9's "each feature/module contains its own Components/Pages/API Calls/Hooks/
Validation," a module folder under `src/modules/<feature>/` should hold:

```
src/modules/<feature>/
├── api/                 All API calls for this feature — thin wrapper functions that
│                        import the shared apiClient from src/services/apiClient.js,
│                        never a separate axios instance. One function per endpoint,
│                        no logic beyond the HTTP call itself.
├── components/         Feature-specific components (not shared elsewhere — if a
│                        component is reused by another module, promote it to
│                        src/components/ instead).
├── hooks/               Feature-specific hooks (data-fetching hooks wrapping api/
│                        calls with loading/error state, plus any feature-specific
│                        flow hooks). A hook shared across modules belongs in
│                        src/hooks/ instead.
├── constants/           Feature-specific constants (enums, labels, colors) — mirror
│                        the backend's own constants where one exists, and say so in
│                        a comment, so the two never silently drift apart.
└── utils/                Feature-specific pure helper functions — prefer these over
                          burying non-trivial logic inline in a component, since a
                          pure function is directly unit-testable on its own.
```

The route(s) for that feature still live in `src/pages/<Feature>Page.jsx` (registered in
`src/routes/router.jsx`) — a page file composes that module's components/hooks rather than
containing the feature's real logic itself, keeping page files thin.

**The `lead` module is the reference implementation** (`src/modules/lead/`) — built out
fully in the Leads frontend task and the one every later module should follow the shape
of:
- `api/leadApi.js` — one function per backend endpoint (list/get/create/update/delete/
  status/hot/calls/convert/import/export/sources), all through the shared `apiClient`.
- `hooks/useLeads.js` / `useLeadDetail.js` / `useLeadSources.js` — data-fetching hooks
  (`useState`/`useEffect`, no data-fetching library — per smartrays.md's "prefer React
  state" rule, this project doesn't use React Query/SWR).
- `hooks/useLeadStatusChangeFlow.js` — a good example of a **feature-specific flow
  hook**: it centralizes a multi-step interaction (status change → sometimes needs a
  modal first) so three different UI surfaces (table dropdown, kanban drag, detail page
  buttons) share one implementation instead of three copies.
- `components/` — one component per concern (`LeadsTable`, `LeadBoard`/`LeadBoardColumn`/
  `LeadCard`, `LeadDetailContent`, four single-purpose modals), composed by a page-level
  shell (`LeadsListPage`) rather than one large component doing everything.
- `constants/lead.constants.js` — mirrors `backend/src/modules/lead/lead.model.js`'s
  `LEAD_STATUSES` and `leadCall.model.js`'s `CALL_OUTCOMES` exactly, with a comment saying
  so — the pattern to follow whenever a frontend enum needs to match a backend one.
- `utils/resolveDropDestination.js` / `buildActivityTimeline.js` — pure functions pulled
  out of components specifically so they're directly unit-testable without needing to
  render anything (see Testing below for why this mattered for the kanban board).

A cross-module shared piece that doesn't belong to any one feature (e.g. the `/users/
dropdown` picker list used by both Leads' owner filter and its Convert-to-Customer
project-manager picker) goes in `src/services/` (API call) + `src/hooks/` (hook) instead
of being duplicated into whichever module happened to need it first —
`src/services/userDirectoryApi.js` / `src/hooks/useUserDirectory.js` are the example.

The original `auth` module (`src/modules/auth/api.js`) is still a fine, smaller reference
for the API-file convention alone.

---

## Core Patterns (Phase 0)

**API client (`src/services/apiClient.js`)** — one shared Axios instance,
`withCredentials: true` (required for the httpOnly auth cookie to be sent/received — the
JWT itself is never stored or read on the client, matching the backend's §4.1 "DB is
the single source of truth for auth" principle). A response interceptor clears session
state and redirects to `/login` on any 401 that isn't the login request itself (a wrong
password is an expected 401, not a session expiring).

**Session store (`src/store/sessionStore.js`, Zustand)** — the one piece of genuine
cross-page state in this app so far. Calls `GET /auth/me` once on app load
(`App.jsx`'s `useEffect`) to resolve identity/role/permissions from a real request, never
from a decoded token. Holds `{ user, isAuthenticated, isLoading }`; exposes `login()`,
`logout()`, `refetchSession()` (re-fetch `/auth/me` without touching `isLoading` — for
after a permission edit takes effect), and `clearSession()` (wired to the API client's
401 interceptor).

**Route guards (`src/routes/`)**:
- `ProtectedRoute` — redirects to `/login` if not authenticated; shows a loading spinner
  while the initial `/auth/me` call is in flight so an authenticated user never sees a
  flash of the login page.
- `PermissionGate` (component) / `usePermission` (hook) — mirror the backend's
  `can(user, module, action)` for hiding/disabling UI. **UI convenience only, not a real
  security boundary** — stated in the code itself (`src/utils/permission.utils.js`), not
  just here, so nobody mistakes it for real access control later. The backend enforces
  every permission for real, on every request.
- `RootRedirect` — `/`'s real redirect-by-role logic: `customer` → `/portal`, every staff
  role → `/dashboard` (the shared dashboard shell, §7.13).

**Layouts (`src/layouts/`)**:
- `MainLayout` — the one dashboard shell every staff role shares (admin/manager/
  sales_associate/employee), composing its nav items by role + permission
  (`PermissionGate`-filtered) rather than four separate per-role layouts, per §7.13.
- `PortalLayout` — separate, no internal nav, for `role: customer` accounts, per §8.

**Routing (`src/routes/router.jsx`)** — `createBrowserRouter` +
`createRoutesFromElements` only, per smartrays.md's fixed routing rule. Every route in
§8's route map exists today; `/login` and `/` (redirect logic) are fully built, every
other route is a placeholder page (heading + "coming soon") to be filled in module-by-
module in later frontend tasks — mirroring how the backend was built phase-by-phase.

---

## Modules

| Module | Status |
|---|---|
| `auth` (login, session) | ✅ Built (Phase 0) — `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` wired through `sessionStore`. Register/Customer-signup pages not built yet (no admin UI exists yet to reach them from). |
| `lead` (Leads) | ✅ **Built — the reference implementation for every module below.** Table View (search/owner/follow-up filters, inline status dropdown, hot toggle, owner reassignment) and Board View (kanban, `@dnd-kit` drag-between-stages) share one page shell (`LeadsListPage`) behind `/leads` and `/leads/board`; Lead Detail (`/leads/:id`) is a real, linkable route rendered as a slide-over (Log Call, Hot toggle, Won, Lost, Convert to Customer, Edit, Delete); an Import wizard (upload → automatic column-matching preview → per-row results) and a filtered Excel export. See `.context/final-plan.md` §7.14's Leads frontend entry for the full write-up, including the one real backend gap found (no lead-specific activity log — the Activity Timeline is assembled client-side from call history + lead fields instead). |
| Every other module (`customers`, `attendance`, `leave`, `payroll`, `travel-logs`, `tickets`, `payments`, `amc`, `reports`, `permissions`) | Routing skeleton + placeholder page only — real components/api/hooks not built yet, see `docs/project-status.md` for what's next. |

---

## Env Vars

```
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

`.env`/`.env.local` are gitignored (see `.gitignore`) — only `.env.example` is committed.
