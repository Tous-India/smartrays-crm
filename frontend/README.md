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
- `VITE_GOOGLE_MAPS_API_KEY` — powers the Location live-map view (`src/modules/location/`).
  **Deliberately a separate key from the backend's own `GOOGLE_MAPS_API_KEY`** (see
  `backend/.env.example`), even though both call Google Maps: this one is loaded into the
  browser and visible to anyone who opens devtools, so it must be restricted by **HTTP
  referrer** (your domain(s) + localhost) in the Google Cloud Console — never by server IP
  the way the backend's key is. Enable the "Maps JavaScript API" for this key (a different
  API than the backend key's "Distance Matrix API").

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

**Testing camera/geolocation/Google-Maps-backed UI (Attendance/Location) — a pattern that
hadn't come up before this build, follow it for any future module touching these same
browser APIs:**
- **`navigator.mediaDevices.getUserMedia`** — jsdom has no camera at all, so stub it per
  test with `Object.defineProperty(navigator, "mediaDevices", { configurable: true, value:
  { getUserMedia: vi.fn(() => Promise.resolve(fakeStream)) } })`, where `fakeStream` is just
  `{ getTracks: () => [{ stop: vi.fn() }] }` — enough for `useCamera.js`'s start/stop calls,
  no real `MediaStream` needed. See `CheckInOutWidget.test.jsx`.
- **`HTMLCanvasElement#getContext`/`#toDataURL`** — jsdom implements neither (no real
  rendering engine), and `useCamera#capturePhoto` needs both to produce a photo. Stub once
  per test file: `HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage:
  vi.fn() }))` and `.toDataURL = vi.fn(() => "data:image/jpeg;base64,FAKE")`.
- **`navigator.geolocation.getCurrentPosition`** — same `Object.defineProperty` stub
  pattern, calling the success/failure callback synchronously: `getCurrentPosition:
  vi.fn((success, failure) => success({ coords: { latitude, longitude } }))` (or call
  `failure({ code: 1, PERMISSION_DENIED: 1 })` to test the permission-denied path).
- **The Google Maps JS SDK** — don't mock the script-loading hook itself; instead set
  `window.google = { maps: { Map: vi.fn(...), Marker: vi.fn(...), Polyline: vi.fn(...),
  LatLngBounds: vi.fn(...) } }` (each constructor a `vi.fn()` that also attaches whatever
  instance methods `GoogleMapView.jsx` calls, e.g. `this.setMap = vi.fn()` on Marker/
  Polyline, `this.fitBounds = vi.fn()` on Map) **before** rendering. `useGoogleMapsScript`'s
  loaded-state check (`Boolean(window.google?.maps)`) reads this synchronously at mount, so
  the real `<script>`-injection path never runs in tests at all. Push each constructor
  call's arguments into a plain array from within the mock to assert on what was actually
  plotted (marker positions/labels, polyline path points) without needing a real map. See
  `LiveMapView.test.jsx`/`HistoryMapView.test.jsx`.
- **Testing interval-based hooks (`useCheckedInHeartbeatLoop`) with fake timers** —
  `vi.useFakeTimers()` in `beforeEach`/`vi.useRealTimers()` in `afterEach`, and
  `@testing-library/react`'s `renderHook`/`rerender`/`unmount` to drive `isActive` through
  fresh-start, resume-on-mount, stop-on-checkout, unmount-cleanup, and per-call-failure
  (heartbeat fails / ping fails / **the `GET /location/config` fetch itself fails**)
  scenarios without ever waiting on a real 2-3 minute interval. **Use `await
  vi.advanceTimersByTimeAsync(ms)`, not the synchronous `vi.advanceTimersByTime(ms)`** — this
  hook resolves a real `Promise` (`GET /location/config`) before its first `setInterval` call
  even exists, and plain fake timers don't flush microtask/promise chains on their own; the
  async variant does, so the interval actually gets created before you advance time expecting
  it to fire. To assert "no further calls after checkout/unmount," advance timers again after
  the state change and check the call count is unchanged, not just that a new call didn't
  throw. The config-fetch-failure case additionally proves the fallback lands on the *right*
  interval, not just *some* interval — advance to one tick short of
  `FALLBACK_PING_INTERVAL_MINUTES` first and assert nothing fired yet, then advance the
  remaining tick and assert it did — and that the heartbeat loop is genuinely unaffected by a
  ping-config failure (it isn't gated behind `resolvePingIntervalMinutes()` at all).
- **Ant Design icon buttons and `getByRole`'s exact name matching** — an icon rendered via
  a `Button`'s `icon` prop (e.g. `<Button icon={<CameraOutlined />}>Capture Photo</Button>`)
  contributes its own `aria-label` (e.g. `"camera"`) to the button's *computed* accessible
  name, making it `"camera Capture Photo"`, not just `"Capture Photo"`. Query these with a
  regex (`{ name: /Capture Photo/ }`), never an exact string — the same pattern already
  used elsewhere in this codebase for icon buttons (`LeadsListPage.test.jsx`'s `/Export/`,
  `/Import/`).

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

**Auth screens (`src/components/AuthLayout.jsx`)** — the shared shell behind `/login`,
`/forgot-password`, and `/reset-password`: a floating dark glass card (`bg-white/12` +
`backdrop-blur-xl`) over a full-viewport background, with `BrandLogo` + tagline on the left
(desktop) or stacked above the card (mobile). Takes a `background` prop —
`"gradient"` (default, the original navy/green CSS gradient, `.auth-gradient-bg` in
`styles/index.css`) or `"photo"`. **Only `LoginPage` passes `background="photo"`** —
forgot-password/reset-password were out of scope for the photo-background task and still
use the gradient.

**Login background is a real photo, not a CSS gradient** (`assets/login-bg.webp`, sourced
from smartrayssolutions.com — the live site's own imagery, not a stock photo): `Untitled-
design.webp` (1000×1000), an outdoor field of angled solar panels on grass under open sky.
All four candidates from the live site were downloaded and viewed directly:
- `Smartrays-Banner-Post-1.webp` — rejected outright: a PM-Modi-subsidy promo banner with a
  person's photo and heavy graphic text, wrong subject matter entirely for a login backdrop.
- `banner-1.webp` (1920×650, ultra-wide) — an indoor night scene (two kids, a small solar
  panel, a glowing bulb). **Tried and shipped in an earlier pass, then reverted** — it
  worked technically (contrast, legibility, all fine) but was rejected on brand grounds: a
  B2B solar EPC company's login screen should show an actual installation, not a home
  lifestyle scene. `banner-1-1000x1000-1-1.webp` is the same photo, square-cropped —
  rejected for the same brand reason, the crop was never the issue.
- `Untitled-design.webp` (1000×1000) — **the one actually used.** The only candidate that's
  literally an outdoor "solar panels + sky + grass" shot, matching what the company's own
  business actually does. Tried first, initially rejected (see below), then fixed and
  reinstated rather than settled-for-second-best.

**Square (1000×1000) over the 1920×650 ultra-wide banners**: `background-size: cover`
needs to fill both dimensions of the viewport. A source only 650px tall gets scaled up
(and cropped hard) to cover any viewport taller than that — nearly all of them, especially
portrait/mobile — which either looks soft (upscaled) or shows an oddly narrow slice of the
original. A 1000×1000 source has proportionally more height to work with.

**The real problem, and the real fix — not a workaround.** `Untitled-design.webp` has its
own baked-in marketing text ("GO SOLAR WITH SMARTRAYS SOLUTIONS") in dark navy on a bright
sky. The first attempt tried to hide it with the dark scrim alone, pushing the overlay to
88% opacity at one point — the text was *still* clearly legible, directly overlapping the
real `BrandLogo`/tagline on mobile. The reason: a dark scrim dims a photo's pixels
*proportionally*. It doesn't erase the relative contrast between a dark element and the
bright thing behind it, it just darkens both together — opacity alone cannot defeat
legible text regardless of how strong it goes, short of turning the whole image an
unusable black block. That's why the photo was swapped out for the indoor scene the first
time around — the wrong fix for the actual problem, not a problem with the photo itself.

**The real fix is a blur, applied only to the photo, layered under the same scrim.**
Text legibility depends on sharp edges; blur destroys those directly, regardless of the
text's color or contrast against its background — exactly the lever opacity doesn't have.
Implemented as two separate absolutely-positioned layers behind the real content (both
rendered by `AuthLayout.jsx`, not the single combined `background-image` stack the first
version used) — CSS `filter: blur()` applies to everything inside the element it's set on,
so the photo has to be its own element, isolated from the scrim and the real logo/card on
top of it, or all three would blur together:
- `.auth-photo-layer` — the photo, `filter: blur(8px)`, `transform: scale(1.1)`. The scale
  compensates for blur's edge-fringing (a Gaussian blur samples past the element's own edge
  for real pixel data; with none there, the edge fades toward transparent) by pushing that
  fringed edge outside the visible viewport, where the parent's `overflow-hidden` crops it
  away before it's ever seen.
- `.auth-photo-scrim` — the exact same two-gradient dark scrim from the first version,
  values unchanged, layered on top of (not mixed into) the blurred photo. Still doing real
  work on its own: the photo's brightness still varies a lot even blurred (bright sky vs.
  dark panels), so without this neither the logo/tagline on the left nor the glass card's
  contents would have reliable contrast everywhere.

**8px landed on the first attempt** — confirmed by screenshot at desktop (1440×900), an
ultra-wide (2560×1080), and mobile (390×844): the baked text is a soft, illegible color
smear at every width tried, while the photo still clearly reads as solar panels on grass
under sky, not abstract blur soup, and `BrandLogo`/tagline/card all stay perfectly sharp
(they're painted on the unblurred content layer, entirely separate from the blurred
background layer).

**Logo variant re-verified against the new photo, not assumed to carry over from the
indoor-scene testing** — `BrandLogo`'s `variant` prop (`"color"` default, unchanged
everywhere else including the `MainLayout` sidebar; `"white"` only when `AuthLayout` is
rendering the photo background) still resolves to `logo-white-shadow.png`. Actually
re-tested color against the blurred+scrimmed outdoor photo specifically: it reads better
here than it did against the indoor night scene (the scrim mutes the background to enough
of a mid-tone that the navy text isn't unreadable), but still visibly softer and less
crisp than the white-shadow variant side by side, confirmed by screenshot. White-shadow
wins because its contrast doesn't depend on what's directly behind it at any given point —
the soft glow baked into the asset does that work regardless.

**Routing (`src/routes/router.jsx`)** — `createBrowserRouter` +
`createRoutesFromElements` only, per smartrays.md's fixed routing rule. Every route in
§8's route map exists today; `/login`, `/forgot-password`, `/reset-password`, `/` (redirect
logic), `/leads`/`/leads/board`/`/leads/:id`, `/customers`/`/customers/:id`,
`/attendance`/`/attendance/team`, `/leave`, and the new `/location` are fully built, every
other route is a placeholder page (heading + "coming soon") to be filled in module-by-module
in later frontend tasks — mirroring how the backend was built phase-by-phase.

---

## Modules

| Module | Status |
|---|---|
| `auth` (login, session) | ✅ Built (Phase 0) — `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` wired through `sessionStore`. Register/Customer-signup pages not built yet (no admin UI exists yet to reach them from). |
| `lead` (Leads) | ✅ **Built — the reference implementation for every module below.** Table View (search/owner/follow-up filters, inline status dropdown, hot toggle, owner reassignment) and Board View (kanban, `@dnd-kit` drag-between-stages) share one page shell (`LeadsListPage`) behind `/leads` and `/leads/board`; Lead Detail (`/leads/:id`) is a real, linkable route rendered as a slide-over (Log Call, Hot toggle, Won, Lost, Convert to Customer, Edit, Delete); an Import wizard (upload → automatic column-matching preview → per-row results) and a filtered Excel export. See `.context/final-plan.md` §7.14's Leads frontend entry for the full write-up, including the one real backend gap found (no lead-specific activity log — the Activity Timeline is assembled client-side from call history + lead fields instead). |
| `customer` (Customers) | ✅ **Built.** List View (`CustomersListPage`, behind `/customers`) — search/owner/status filters (defaults to active-only, an explicit "Show Inactive" checkbox), sortable columns, row-select + bulk activate/deactivate/delete, and an `Add Customer` wizard (`CustomerFormWizard`) that walks Company Info → Billing → Contracts → Contacts → Project Manager, creating the customer then each staged contract/contact in turn and surfacing the backend's contract automation explicitly in the success toast ("Project + draft Invoice auto-created for: ...") rather than leaving it invisible. Customer Detail (`/customers/:id`, a real full page per leads-customer-functional-spec.md, not a slide-over) renders `CustomerHeaderSection`/`CustomerBillingCard`/`CustomerContactsSection`/`CustomerContractsSection`/`CustomerCredentialsSection`/`CustomerActivityLog` from one `useCustomerDetail` hook. The Credentials Vault is masked by default (`••••••••`) — revealing a password requires an explicit confirm-click (`Popconfirm`, "This action is logged to the customer's activity log") per row, never automatic on page load, and re-masks on a second click; the whole section is hidden (not just disabled) behind a `PermissionGate` for `credentials.view`. Every mutating action is gated to the exact backend `customers`/`credentials` permission its endpoint requires. 13 tests (`CustomersListPage.test.jsx`, `CustomerDetailPage.test.jsx`), all passing, no real network calls. |
| `attendance` (Attendance) | ✅ **Built.** `CheckInOutWidget` (`/attendance`, top of the Personal view) — camera capture via native `getUserMedia` + a `<canvas>` snapshot (no library, see below), geolocation via the native `Geolocation` API, both mandatory before Confirm enables (mirroring the backend's server-side-enforced photo requirement, §7.4). Fetches current status on mount rather than assuming — correctly shows "Checked In" + a live elapsed-time counter if the page loads mid-shift, and (see below) resumes the heartbeat/ping loop in that same case. Personal Attendance view (`PersonalAttendanceView`) — a selectable month + `AttendanceTimeline` table (Check-In/Check-Out/Working Hours/Status) with connectivity gaps (`connectivityGaps[]`, §6.5) rendered as visually distinct red segments on a proportional bar (`ConnectivityGapBar`), not decoration — a specific, real requirement. Team Attendance view (`/attendance/team`, `TeamAttendanceView`) — same table + an employee selector (client-side filter; the backend endpoint has no per-employee filter), gated by `attendance.view_team`/`view_all` via a 403 `Result` in `AttendanceTeamPage.jsx` (not `PermissionGate`, which only expresses a single module+action pair — this needs an OR of two). Both views' report button hits the unified `POST /reports/generate` dispatcher (`module: "attendance"`) via the new shared `ReportDownloadButton`/`reportApi.js`. |
| `leave` (Leave) | ✅ **Built.** `LeaveListPage` (`/leave`) — scope tabs built from whichever `leave.view*` grants the user actually holds (own/team/all), a Request Leave modal (`paid`/`unpaid` only — `unapproved_absence` is never requestable, admin-only via a separate action), and — admin-only, per §7.5's "manager can view but not approve" — Approve/Mark Unapproved Absence actions. The mark-unapproved-absence confirmation shows its 2x-deduction consequence **directly in the `Popconfirm`'s description text**, not a tooltip, since burying it there would fail the whole point of confirming before an irreversible-feeling action. Report download via the same shared `ReportDownloadButton` (`module: "leave"`, `filters: { scope }`). |
| `location` (Live Map) | ✅ **Built — a new route, `/location`** (§7.4b had no frontend before this task). Live view (`LiveMapView`) re-polls `GET /location/live` every ~12s and plots one marker per visible, currently-checked-in employee; History view (`HistoryMapView`) — an employee + date picker rendering that day's `GET /location/history` ping trail as a polyline. Gated by the existing `location` `PERMISSION_REGISTRY` set (any of `view`/`view_team`/`view_all`), same 403-`Result` pattern as Team Attendance. Uses `GoogleMapView` (`src/components/`) + `useGoogleMapsScript` (`src/hooks/`) — see "Maps & camera dependency decisions" below. Now actually receives pings — see "Heartbeat & location-ping loop" below. |
| Every other module (`payroll`, `travel-logs`, `tickets`, `payments`, `amc`, `reports`, `permissions`) | Routing skeleton + placeholder page only — real components/api/hooks not built yet, see `docs/project-status.md` for what's next. |

### Maps & camera dependency decisions

- **Camera capture: native `getUserMedia` + a `<canvas>` snapshot, no library.** A camera
  library (e.g. `react-webcam`) earns its dependency weight when you need front/back
  camera switching or other UX the native API makes painful — neither was ever asked for
  here ("live preview, capture on a button press"), so `useCamera.js` (`src/modules/
  attendance/hooks/`) just wraps `navigator.mediaDevices.getUserMedia` directly, and
  `CameraCapture.jsx` owns the `<video>`/`<canvas>` elements.
- **Google Maps: the JS SDK loaded via a plain `<script>` tag, talking to
  `window.google.maps` directly — no wrapper library** (e.g. `@react-google-maps/api`).
  §7.4b's own stated scope is deliberately basic (markers + a polyline, no clustering/info
  windows/autocomplete), so a wrapper's abstraction wouldn't earn its weight here either.
  `useGoogleMapsScript.js` (`src/hooks/`) injects the script once (module-level dedupe, so
  two map views mounting at once never double-inject it) and resolves once
  `window.google.maps` exists; `GoogleMapView.jsx` (`src/components/`) is the generic
  marker(s)/polyline renderer both `LiveMapView` and `HistoryMapView` share.

### Heartbeat & location-ping loop (`useCheckedInHeartbeatLoop`)

**Resolved gap** — the Attendance/Leave/Location frontend task shipped with no client-side
loop actually submitting `POST /attendance/heartbeat` or `POST /location/pings`; this closes
it. `useCheckedInHeartbeatLoop.js` (`src/modules/attendance/hooks/`) runs both loops for as
long as the caller is checked in.

**Cross-module import, on purpose:** the hook lives under `attendance/` (it starts/stops
with attendance's own check-in state) but imports `location`'s `submitLocationPing`/
`fetchLocationConfig` directly — the same precedent the backend itself already set with
`attendance.service.js#checkOut` calling straight into `transport/travelLog.service.js`
rather than duplicating logic or inverting the dependency.

**Driven by one derived boolean, not a start()/stop() pair** — `CheckInOutWidget.jsx` calls
`useCheckedInHeartbeatLoop(isCheckedIn)`, the exact same `isCheckedIn` boolean that already
drives the elapsed-time ticker. This is what makes "resume on reload" free: whether
`isCheckedIn` is already `true` on the very first render (the page loaded mid-shift) or
transitions `false → true` (a fresh check-in just succeeded), the hook's `useEffect` body
runs identically — there's no separate "resume" code path to keep in sync with "fresh
start." Flipping back to `false` (check-out) runs the effect's cleanup, tearing both
intervals down.

**Interval values, and why:**
- **Heartbeat: every 3 minutes.** The backend's own `env.js` comment states the assumption
  this feature was designed against: `ATTENDANCE_GAP_THRESHOLD_MINUTES` defaults to 10,
  "roughly two missed heartbeats at the expected ~2-5 minute client cadence before flagging
  a gap." 3 minutes sits inside that stated range and leaves a ~3.3x margin under the
  10-minute default — comfortable enough that one delayed/dropped heartbeat (a network
  hiccup, a briefly backgrounded tab) won't false-positive a connectivity gap, while still
  being meaningfully more frequent than the threshold itself (a heartbeat interval anywhere
  near or above 10 minutes would make every normal heartbeat look like a gap).
- **Location ping: whatever `GET /location/config` returns** (`pingIntervalMinutes`,
  backed by `LOCATION_PING_INTERVAL_MINUTES`, default 2) — fetched fresh every time the loop
  starts (and again on resume-from-hidden, see below), never hardcoded or cached across a
  whole session. That's the entire reason this config is a real endpoint and not a client
  constant: an admin can change the cadence without a client redeploy, and this hook always
  respects whatever it currently says. Falls back to `2` (matching the backend's own env
  default) only if the config fetch itself fails.

**Pause/resume on tab visibility, not `beforeunload`:** both intervals are torn down when
`document.visibilityState` becomes `"hidden"` and re-established (re-fetching the ping
config fresh) when it becomes visible again — there's no one to see a live map update while
a tab is backgrounded, so this avoids pointless network/battery cost. `beforeunload` gets no
listener of its own: a real tab close terminates the JS engine outright, which destroys both
intervals automatically with it. The two cases that genuinely need explicit cleanup —
navigating away within this SPA (unmounting the widget) and backgrounding the tab — are
exactly what the `useEffect` cleanup function and the `visibilitychange` handler already
cover, so adding a `beforeunload` listener with nothing meaningful to do in it would be
theater, not real handling.

**Failure handling:** every heartbeat/ping call is wrapped so a single failure is logged
(`console.error`) and swallowed, never thrown — the same "never block the primary action"
principle already applied on the backend side to this exact feature
(`attendance.service.js#checkOut`'s TravelLog auto-generation can't fail checkout either).
A failed tick doesn't stop the interval or affect check-out in any way.

**Visible indicator:** a small pulsing-dot "Tracking active" badge next to the "Checked In"
tag in `CheckInOutWidget.jsx` (`data-testid="tracking-indicator"`) — not elaborate, just
enough that this isn't entirely invisible background infrastructure to whoever's using the
widget.

---

## Env Vars

```
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_GOOGLE_MAPS_API_KEY=
```

`.env`/`.env.local` are gitignored (see `.gitignore`) — only `.env.example` is committed.
