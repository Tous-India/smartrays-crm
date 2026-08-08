# Smartrays Solutions CMS — Frontend

React + Vite client for the internal CRM + Operations platform. JavaScript only (no
TypeScript), Tailwind CSS + Ant Design, React Router DOM, Zustand (only for genuine
cross-page state), Axios, `@dnd-kit` (drag-and-drop for the Leads kanban board),
`@ant-design/charts` (charts on the Reports & Analytics page, §7.23).

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
- `VITE_VAPID_PUBLIC_KEY` — optional. The **public** half of the backend's VAPID keypair, so
  the browser can subscribe to Web Push. It must be the key belonging to the backend that
  `VITE_API_BASE_URL` points at: a subscription is cryptographically bound to the key it was
  created with, and a mismatched pair fails at delivery time with a 403, silently. Unset is a
  supported state — the Settings → Account push toggle renders nothing at all. See
  "Web Push — the client half" below.

No map API key is needed — the Location live-map/history views and the Attendance map
integration all run on `react-leaflet` + free OpenStreetMap tiles (§11.6, migrated
2026-08-04 from the Google Maps JS SDK; see "Maps & camera dependency decisions" below for
why). The backend's own separate `GOOGLE_MAPS_API_KEY` (`backend/.env.example`) is
unrelated — a different Google API (Distance Matrix, for Travel Log's per-shift distance
calculation), untouched by this migration.

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
module boundary, same principle as backend's Cloudinary mocking). jsdom is the
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

**Testing camera/geolocation/Leaflet-map-backed UI (Attendance/Location) — a pattern that
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
- **`react-leaflet` (§11.6, 2026-08-04 — replaced the Google Maps JS SDK)** — Leaflet's real
  `Map` needs actual browser DOM measurement/tile loading jsdom doesn't support, so
  `vi.mock("react-leaflet", ...)` the whole module rather than trying to render a real map:
  stub `MapContainer` as a plain `<div>` wrapping its children, `TileLayer` as `() => null`,
  and `Marker`/`Polyline` as components that push their received props into a plain array
  (so a test can assert on the exact `position`/`icon`/`title`/`positions` `LeafletMapView`
  passed them) before rendering a lightweight stub `<div>`. `useMap` mocks out to
  `() => ({ fitBounds: vi.fn() })` since `FitBounds` (the internal helper that keeps the
  viewport synced to markers/path) calls it. `leaflet` itself (the `L` import) is **not**
  mocked — `L.divIcon()`/`L.latLngBounds()` are pure factory functions with no real-DOM
  dependency, so they run fine as-is under jsdom. See `LiveMapView.test.jsx`/
  `HistoryMapView.test.jsx`/`AttendancePhotoModal.test.jsx`.
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
  (`can()`-filtered) rather than four separate per-role layouts, per §7.13. See "App shell
  UI/UX pass" below for its fixed-sidebar structure, color scheme, and profile-editing flow.
- `PortalLayout` — separate, no internal nav, for `role: customer` accounts, per §8.

### App shell UI/UX pass (`MainLayout.jsx`, `LiveClock.jsx`, `EditProfileModal.jsx`)

**Sidebar — three fixed regions, only the nav list scrolls.** The `<Sider>` is
`position: fixed`, full `100vh`, split into three independently-behaving regions: a pinned
logo header (top), the nav `<Menu>` (middle — the ONLY region that scrolls, and only if the
list is actually taller than the space left for it), and a pinned footer (bottom, the profile
menu — see below). **Real gotcha hit and fixed here, not just eyeballed:** AntD's `<Sider>`
always wraps its children in its own internal `.ant-layout-sider-children` div
(`display: block` by default) — setting `display: flex; flex-direction: column` on the
`<Sider>` itself does nothing useful, since that wrapper (not the `<aside>`) is the real
parent of the three region divs, so `flex-1`/`shrink-0` on them are inert against a
non-flex parent. Fixed via a scoped override in `styles/index.css`:
`.app-sider > .ant-layout-sider-children { display: flex; flex-direction: column; height:
100%; }`. **Verified with a real short-viewport Playwright scroll test** (not just visual
inspection) — scrolling the nav region's own `overflow-y-auto` container moves the visible
nav items while the logo and footer stay pixel-identical between before/after screenshots.
The right-hand column (top bar + page content) is NOT fixed — it scrolls normally with the
page; only the sidebar's own internal regions are fixed/independently-scrolling.

**Sidebar logo — a new `layout` prop on `BrandLogo`** (`src/components/BrandLogo.jsx`):
`layout="stacked"` (default, unchanged — Login page still uses this) or
`layout="horizontal"` (icon-and-text side-by-side, ~4.8:1 aspect ratio, for the sidebar's
short header). `logo-horizontal.png` only ever existed as the full navy/green gradient mark
— there was no pre-made white version the way the stacked mark has `logo-white-shadow.png`.
`logo-horizontal-white.png` is a **generated** white silhouette (every opaque pixel forced to
solid white via a one-off Jimp script, alpha/shape untouched — not new art) rather than
something a designer produced, needed once the sidebar went dark navy and the gradient's navy
portions would otherwise blend straight into it. Verified at actual rendered size (~32px
tall) via a composited screenshot before wiring it in — the source PNG's edge stippling from
background removal is imperceptible at that scale even though it's visible zoomed in.

**Color scheme** — sidebar background is the brand-navy token (`var(--color-brand-navy)`,
not a new/generic black), `<Menu theme="dark">` for light nav text by default, with the
active-item state and hover state overridden in `styles/index.css` (`.app-sidebar-menu`) to
brand-green rather than AntD dark theme's generic translucent-white selected state: a
`rgba(29, 131, 67, 0.28)` tinted background plus a solid `var(--color-brand-green)`
left accent bar, so the current page is obvious at a glance (this was flagged as
specifically missing before this pass — no `selectedKeys` was ever computed).
`resolveSelectedKey()` in `MainLayout.jsx` matches the current route to a nav key via
longest-prefix match (so `/leads/:id` still highlights the `Leads` item), including into the
new Settings submenu (below).

**Settings nav section** — `User Management` and `Permission Settings` (previously two flat
top-level nav items) are now grouped under one collapsible `Settings` submenu (AntD Menu's
native `children` array, not a new component), shown only if the user holds `users.view_all`/
`users.view_team` OR `permissions.manage` — the exact same `can()` calls each item already
used individually, just gating the group as a whole now.

**Top bar** — shortened from AntD's default ~64px to 48px (`!h-12`, forced with `!important`
since AntD's own header height comes from a CSS class, not inline style, the same reasoning
the pre-existing `!bg-brand-navy` override already needed). Shows a `LiveClock` (ticks every
real second via `setInterval`, per smartrays.md's "prefer React state" rule — same pattern
`useCheckedInHeartbeatLoop`/the Location live-map poll already follow) formatted as
`"Mon, 21 Jul 2026 · 3:45 PM"`.

**Profile editing — ONE location, not two.** The Edit Profile/Logout menu lives ONLY in the
sidebar footer (pinned, always visible regardless of scroll position or page content height)
— deliberately NOT also duplicated in the top bar, which now shows just the live clock and
nothing user-related. "Edit Profile" opens `EditProfileModal`
(`src/modules/user/components/`), a smaller, separate component from the admin-facing
`UserFormModal` — reuses the existing `PATCH /users/:id` (`updateUser` in
`modules/user/api/userApi.js`), no new backend endpoint, and only renders the
name/email/phone fields (`user.service.js#updateUser`'s self-edit path already restricts a
self-edit to exactly these three server-side — role/managerId/isActive/baseSalary stay
admin-only regardless of what the UI shows). On success, calls the session store's
`refetchSession()` so the sidebar footer's displayed name updates immediately, no re-login
needed — the same "single DB source of truth, no cache to bust" reasoning §4.1 relies on
everywhere else.

**Dashboard widget cards, tightened** — `WidgetCard` (`modules/dashboard/widgets/`) now uses
`Card size="small"`, a `text-sm` title instead of Card's default ~16px bold, and drops the
empty state's illustrated image entirely (`image={false}`) rather than just shrinking it —
at this card's scale, an icon read as more prominent than the actual "No leads yet"-style
text next to it. Every widget's `Statistic` values now set `valueStyle={{ fontSize: 20 }}`
(was AntD's much larger default) and use a smaller `text-xs` label; `DashboardPage`'s grid
gutter tightened from `[16, 16]` to `[12, 12]`. Applied to all 11 widgets (the 5 original +
6 operational), not just some.

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
| `auth` (login, session, password reset) | ✅ Built — `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` wired through `sessionStore`. **Password reset added (§7.17, 2026-07-17):** "Forgot password?" link on the login page, a `/forgot-password` request-email page, and a `/reset-password?token=` page — all three (plus login) share a new `AuthLayout` component (`src/components/AuthLayout.jsx`) for the dark-glass background/card treatment. Register/Customer-signup pages still not built (no public UI needed — registration is admin-only, via the User Management module below). |
| `lead` (Leads) | ✅ **Built — the reference implementation for every module below.** Table View (search/owner/follow-up filters, inline status dropdown, hot toggle, owner reassignment) and Board View (kanban, `@dnd-kit` drag-between-stages) share one page shell (`LeadsListPage`) behind `/leads` and `/leads/board`; Lead Detail (`/leads/:id`) is a real, linkable route rendered as a slide-over (Log Call, Hot toggle, Won, Lost, Convert to Customer, Edit, Delete); an Import wizard (upload → automatic column-matching preview → per-row results) and a filtered Excel export. See `.context/final-plan.md` §7.14's Leads frontend entry for the full write-up, including the one real backend gap found (no lead-specific activity log — the Activity Timeline is assembled client-side from call history + lead fields instead). |
| `customer` (Customers) | ✅ **Built.** List View (`CustomersListPage`, behind `/customers`) — search/owner/status filters (defaults to active-only, an explicit "Show Inactive" checkbox), sortable columns, row-select + bulk activate/deactivate/delete, and an `Add Customer` wizard (`CustomerFormWizard`) that walks Company Info → Billing → Contracts → Contacts → Project Manager, creating the customer then each staged contract/contact in turn and surfacing the backend's contract automation explicitly in the success toast ("Project + draft Invoice auto-created for: ...") rather than leaving it invisible. Customer Detail (`/customers/:id`, a real full page per leads-customer-functional-spec.md, not a slide-over) renders `CustomerHeaderSection`/`CustomerBillingCard`/`CustomerSiteDetailsCard`/`CustomerContractsSection`/`CustomerContactsSection`/`CustomerInvoicePlaceholder`/`CustomerActivityLog` from one `useCustomerDetail` hook. Every mutating action is gated to the exact backend `customers` permission its endpoint requires. **Credentials Vault UI deliberately removed (2026-07-29)** — see "Credentials Vault removal" below. Tests: `CustomersListPage.test.jsx`, `CustomerDetailPage.test.jsx`, all passing, no real network calls. |
| `attendance` (Attendance) | ✅ **Built.** `CheckInOutWidget` (`/attendance`, top of the Personal view) — camera capture via native `getUserMedia` + a `<canvas>` snapshot (no library, see below), geolocation via the native `Geolocation` API, both mandatory before Confirm enables (mirroring the backend's server-side-enforced photo requirement, §7.4). Fetches current status on mount rather than assuming — correctly shows "Checked In" + a live elapsed-time counter if the page loads mid-shift, and (see below) resumes the heartbeat/ping loop in that same case. `/attendance` now routes by role (2026-07-31, §7.4 reversal): admin gets `AdminAttendanceView` (org-wide, 5 filters — see the dated write-up below), Manager/Employee/Sales Associate keep `PersonalAttendanceView` unchanged. Personal, Team (`/attendance/team`, `TeamAttendanceView`), and Admin views all render through one shared `AttendanceRecordsSection` — summary stats and a read-only photo-viewer modal, on top of the `AttendanceTimeline` table (Date/Timeline/Location/Status — see §7.4e below for the 2026-08-04 Timeline column replacing the original separate Check-In/Check-Out/Working Hours/Connectivity Gaps columns). **List/Calendar toggle removed (2026-07-31, §7.5e)** — list/timeline-only now, no calendar view anywhere; see the dated write-up below. **Attendance is UI-read-only for every role, including admin (2026-07-31)** — the admin manual-correction UI (Add Record/Edit) was removed; see the dated write-up below. Team view keeps its employee selector (client-side filter; the backend endpoint has no per-employee filter), gated by `attendance.view_team`/`view_all` via a 403 `Result` in `AttendanceTeamPage.jsx` (not `PermissionGate`, which only expresses a single module+action pair — this needs an OR of two). Every view's report button hits the unified `POST /reports/generate` dispatcher (`module: "attendance"`) via the shared `ReportDownloadButton`/`reportApi.js`. **Extended later** with geofence-violation display — a "Location" column/section/marker alongside every existing connectivity-gap one — see "Geofencing" below for the full write-up. |
| `leave` (Leave) | ✅ **Built.** `LeaveListPage` (`/leave`) — **list/table only, no calendar view, no "All" tab (2026-07-31, §7.5e)**, tabs are role-shaped (admin: none, a single unified filterable view; manager: Own + Team; everyone else: none, just their own list) — see the dated write-up below. A Request Leave modal (`paid`/`unpaid` only — `unapproved_absence` is never requestable, only via a separate action; hidden entirely for admin, §7.5c), and Approve/Decline/Mark Unapproved Absence/**Delete** (§7.5d/§7.5e) actions gated per-action on `leave.approve`/`decline`/`mark_unapproved_absence`/`delete` (admin org-wide, manager on their own team — reverses the original "admin-only" restriction, §7.5c). The mark-unapproved-absence confirmation shows its 2x-deduction consequence **directly in the `Popconfirm`'s description text**, not a tooltip, since burying it there would fail the whole point of confirming before an irreversible-feeling action; Delete gets the same confirm-first treatment. Report download via the same shared `ReportDownloadButton` (`module: "leave"`, `filters: { scope }`). **Extended later** with half-day support, a leave balance card, a Decline action, manager parity, a required Reason field, and Admin filters (including a corrected Team filter, §7.5e) — see "Half-day, balance, decline, calendar & notifications", "Manager parity, admin exemption, Reason field & Admin filters (§7.5c)", and the dated §7.5e write-up below for the full write-ups. |
| `location` (Live Map) | ✅ **Built — a new route, `/location`** (§7.4b had no frontend before this task). Live view (`LiveMapView`) re-polls `GET /location/live` every ~12s and plots one marker per visible, currently-checked-in employee; History view (`HistoryMapView`) — an employee + date picker rendering that day's `GET /location/history` ping trail as a polyline. Gated by the existing `location` `PERMISSION_REGISTRY` set (any of `view`/`view_team`/`view_all`), same 403-`Result` pattern as Team Attendance. Uses `LeafletMapView` (`src/components/`) — `react-leaflet` + OpenStreetMap tiles, migrated 2026-08-04 from the Google Maps JS SDK — see "Maps & camera dependency decisions" below. Now actually receives pings — see "Heartbeat & location-ping loop" below. |
| `user` (User Management) | ✅ **Built (§7.19, 2026-07-17)** — a new `/settings/users` route (added since §8's original route map didn't list one; gated on `users.view_all`/`users.view_team`, same as the backend scoping). Roster list (admin sees everyone, manager sees their own team — entirely server-side scoping, no client-side filtering), per-user Edit (name/email/phone/role/managerId/baseSalary via the existing `PATCH /users/:id`), Deactivate/Reactivate, an admin password-reset action (supports both an admin-typed exact password and a backend-generated one-time temp password, shown once), a link to the Permissions module (**now built — see below**, no longer a placeholder), and Create User (admin only, via the existing `POST /auth/register` — no new backend endpoint). **Create ("New User") form reworked 2026-07-30** — see below. |
| `dashboard` (Dashboard) | ✅ **Built (§7.20/§7.21)** — the `/dashboard` shell, composing widgets by role via a declarative catalog rather than four separate per-role dashboards. Leads + Customers widgets (§7.20), plus 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/Payroll (§7.21) — see "Dashboard widget catalog" below for the full list and how to extend it. |
| `payment` (Payments) | ✅ **Built** — the first real UI for this previously backend-only module (`/payments`, admin-only per §5's matrix). `PaymentsListPage` — a `Segmented` date-range filter (Today/Yesterday/This Month/Financial Year/All Time, computed client-side and sent as `from`/`to`; Financial Year is April 1–March 31, no existing FY utility anywhere else in this codebase, added fresh) driving a server-paginated `PaymentsTable` (Date/Customer/Amount/Notes/Recorded By — `customerId`/`recordedBy` resolved to names via the same Map-lookup convention `CustomersTable`'s Owner column already uses, not a backend join). `GET /payments` gained real `from`/`to`/`page`/`limit` support for this — the first server-side pagination in this backend, everything else paginates client-side (see `backend/README.md`'s Payments section). A "Record Payment" modal (`RecordPaymentModal`, gated separately behind `payments.create`) — its Customer field is a genuinely debounced search-as-you-type `Select` against the existing `GET /customers?search=` endpoint, not the fully-fetched-once-then-client-filtered `showSearch` pattern every other picker in this app uses (Owner/Project Manager pickers), since fetching every Customer up front defeats the purpose. Scoped to system customers only for this first version — `manualClientName` (cash/non-system entries) and invoice-linking (partial reconciliation against an outstanding Invoice) are backend-supported but deliberately left for a future pass. **Edit/delete audit trail added 2026-07-30** — an Actions column (History/Edit/Delete icon buttons, Edit/Delete gated behind `payments.edit`/`payments.delete` via `PermissionGate`) drives `EditPaymentModal` (pre-filled amount/date/notes/collectedBy plus a required "Reason for edit"; customerId/manualClientName/invoiceId are read-only in this form, matching the backend's own restriction), `DeletePaymentModal` (a small dedicated modal, not a bare `Popconfirm`, since deleting needs a typed reason — required "Reason for deletion"), and `PaymentAuditLogModal` ("View History," read-only, fetched fresh on every open; no per-row "has history" badge on the main table — that would need either an N+1 request per row or a backend list-shape change, noted as a reasonable future addition rather than built now). Soft-delete (see `backend/README.md`'s Payments section for the full soft-vs-hard-delete reasoning) means a deleted row simply disappears from the table on refetch, not a client-side filter. 20 tests total (`PaymentsListPage.test.jsx`), all passing. |
| `reports` (Reports & Analytics) | ✅ **Built (§7.23)** — the app's first real analytics feature and first chart library (`@ant-design/charts`, new dependency), replacing the `PlaceholderPage` at `/reports`. See "Reports & Analytics module" below for the full write-up. |
| `permission` (Permissions Management) | ✅ **Built (§7.27, 2026-07-30)** — replaces the long-standing `PlaceholderPage` at `/settings/permissions`. See "Permissions Management module" below for the full write-up. |
| `ticket` (Tickets) | ⏸️ **DEFERRED from the UI 2026-08-07 — hidden, not removed.** The nav item and both `/tickets` routes are gone; the two placeholder pages were deleted. Everything still load-bearing stayed: `modules/ticket/api/ticketApi.js` (the Dashboard's `TicketsOpenWidget` calls it), the `tickets.*` permission tiers, and the entire backend module/routes/model/data, all untouched. See "Tickets deferred from the UI" below. |
| Every other module (`payroll`, `travel-logs`, `amc`) | Routing skeleton + placeholder page only — real components/api/hooks not built yet, see `docs/project-status.md` for what's next. |

### Credentials Vault removal (2026-07-29)

**Deliberately removed, not an unfinished feature.** The Credentials Vault section (masked
password list, reveal/add/edit/delete UI) was pulled entirely off the Customer Detail page —
no UI anywhere in the app reaches it now. This was a **frontend-only removal**: the backend
`Credential` model, its AES-256-GCM encryption (`credentialEncryption.service.js`), the
`/customers/:id/credentials*` endpoints, and any already-stored encrypted data are all
completely untouched — the feature's data layer still exists and still works, it's just not
surfaced anywhere in the app right now.

What was removed:
- `CustomerCredentialsSection.jsx` and `CredentialFormModal.jsx` (deleted — both were only ever
  used by this one section).
- The `<PermissionGate module="credentials" action="view">` wrapper and the section itself from
  `CustomerDetailContent.jsx` (which no longer takes a `credentials` prop at all).
- The `listCredentials` fetch from `useCustomerDetail.js` (the page no longer requests
  credentials data on load) and the `credentials` state it populated.
- The Credentials Vault-specific tests in `CustomerDetailPage.test.jsx` (masked-until-revealed,
  reveal-confirm-flow, and the `credentials.view` permission-gating pair) — deleted, not
  skipped, since they tested UI that no longer exists.

What was deliberately left in place: every credential-related function in `customerApi.js`
(`listCredentials`/`createCredential`/`updateCredential`/`deleteCredential`/
`revealCredential`) — harmless unused exports, easy to re-wire a UI onto later if this feature
comes back — and `ACTIVITY_ACTION_LABELS.credential_revealed` in `customer.constants.js`, since
`CustomerActivityLog` still needs to render a human-readable label for any historical (or,
since the backend endpoint itself is untouched, still-possible) `credential_revealed` activity
entries.

If this feature returns, the natural re-entry point is re-adding a
`CustomerCredentialsSection`-shaped component back into `CustomerDetailContent.jsx` and a
`listCredentials` call back into `useCustomerDetail.js` — the backend needs no changes at all.

### Maps & camera dependency decisions

- **Camera capture: native `getUserMedia` + a `<canvas>` snapshot, no library.** A camera
  library (e.g. `react-webcam`) earns its dependency weight when you need front/back
  camera switching or other UX the native API makes painful — neither was ever asked for
  here ("live preview, capture on a button press"), so `useCamera.js` (`src/modules/
  attendance/hooks/`) just wraps `navigator.mediaDevices.getUserMedia` directly, and
  `CameraCapture.jsx` owns the `<video>`/`<canvas>` elements.
- **Maps: `react-leaflet` + free OpenStreetMap tiles — no API key, no billing (§11.6,
  migrated 2026-08-04 from the Google Maps JS SDK).** §7.4b's own stated scope is
  deliberately basic (markers + a polyline, no clustering/info windows/autocomplete), so a
  heavier mapping stack wouldn't earn its weight here either. **Why the migration:** the
  Google Maps integration was never actually functional in production — no billing account
  or real API key was ever configured (`VITE_GOOGLE_MAPS_API_KEY` sat commented-out in
  `.env`/blank in `.env.example` the whole time), so every map view in production was
  silently broken. Leaflet + OpenStreetMap's standard tile server
  (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) needs neither a key nor billing, so
  this isn't just a like-for-like swap — it's the difference between the feature actually
  working and not. `LeafletMapView.jsx` (`src/components/`) is the generic marker(s)/
  polyline renderer `LiveMapView`/`HistoryMapView` share (the same role `GoogleMapView.jsx`
  played before — deleted, along with `useGoogleMapsScript.js`, rather than left as dead
  code). Each marker optionally carries a `color` (2026-08-04, for the Attendance map
  integration below) — one of a small named set (`red`/`orange`/`blue`/`green`/etc.)
  rendered as an inline SVG pin via `L.divIcon`, not a URL to an external icon asset (Google's
  colored-pin icons were themselves a `maps.google.com`-hosted URL) — letting a caller
  visually distinguish marker *types* on the same map instead of every marker looking
  identical, with one fewer external dependency than before. Bounds-fitting (keeping the
  viewport framed around whatever's currently plotted, e.g. on Live's ~12s poll or History's
  employee/date change) is a small `FitBounds` child component calling `useMap().fitBounds()`
  in a `useEffect` — the standard react-leaflet pattern for syncing the map to data that
  changes after mount, since `MapContainer`'s own `bounds` prop only applies once, at
  mount.

**Attendance's "View on Map" — reuses `HistoryMapView`, doesn't fork it (§7.4d, 2026-08-04).**
The admin photo-viewer modal (`AttendancePhotoModal.jsx`) already showed connectivity gaps and
geofence violations as text/colored bars; a "View on Map" button now opens
`AttendanceLocationMapModal.jsx`, which renders the Location module's own `HistoryMapView`
locked to that one record's employee/day (`initialEmployeeId`/`initialDate`/
`showControls={false}` — new, backward-compatible optional props; every existing caller that
omits them behaves exactly as before) instead of a second, parallel map component. It fetches
the exact same `GET /location/history` ping data `HistoryMapView` already fetches for its own
`/location` page — no new backend endpoint. A new `deriveExtraMarkers(pings)` prop is the
extension point: `attendanceMapMarkers.js#deriveAttendanceMapMarkers(record)` returns a function
of that shape, marking a connectivity gap's two temporal *boundaries* (the last ping before the
gap and the first ping after it — a gap has no pings *during* it by definition, so its
boundaries are the only thing that can be marked) in **red**, and every ping captured *during* a
geofence violation window in **orange** — the same red/orange vocabulary
`ConnectivityGapBar.jsx`/`GeofenceViolationBar.jsx` already use elsewhere on the same modal, not
a newly invented color scheme.

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

### Admin correction, photo viewer, calendar view & summary stats (`src/modules/attendance/`)

Four additions on top of Attendance's original check-in/timeline build, all reusing the same
already-fetched month of records — no new endpoint needed beyond the two admin-correction ones
below (checked explicitly: `getMyAttendance`/`getTeamAttendance` already return everything the
new UI needs). Personal and Team views share one new composition component,
`AttendanceRecordsSection.jsx`, so all four land in both places at once instead of being built
(and tested) twice.

**Summary stats (`attendanceSummary.js` + `AttendanceSummaryStats.jsx`).** A pure client-side
`computeAttendanceSummary(records, month)` over the records already loaded for the selected
month — Present/Absent/Half Day/On Leave counts plus an Attendance Rate. "Working days" is
defined as weekday count (Mon–Fri) in the month, **deliberately different from Payroll's own
`daysInMonth`** (every calendar day, for its own pro-rata salary math): a day with no Attendance
record (e.g. a weekend) renders neutral grey on the calendar grid below, not red/absent, so
counting it in this percentage's denominator would make every employee's rate look artificially
low just for having weekends off. `half_day` counts as 0.5 of an attended day, matching the exact
weighting `backend/src/modules/report/analytics.service.js#getAttendanceTrend` already
established for "attendance rate" as a concept in this codebase, rather than inventing a second,
differently-weighted definition of the same phrase.

**Photo viewer (`AttendancePhotoModal.jsx`).** Clicking a day's record in the list row opens a
modal showing the check-in and check-out photos side by side, each with its captured `Lat/Lng` coords displayed underneath (a plain text readout, not an
embedded map pin — the task explicitly allowed either, and a full map widget per photo would be
disproportionate to what this modal needs to show). Gracefully handles a record with no photo at
all (every manually-created record, and any real record where the photo failed to upload) with a
"No photo"/"No coordinates captured" placeholder in that slot rather than a broken image or blank
space. Reuses `ConnectivityGapBar` at the bottom for that day's gap info, the same component the
list view already uses. Purely a view — the "Edit Record" footer button it used to show for an
admin was removed (2026-07-31, §7.4 reversal — see below); the modal takes no `onEdit` prop at all
now.

**Calendar-grid view — removed 2026-07-31 (§7.5e), not an unfinished feature.** This section
originally documented `AttendanceCalendar.jsx` (a `Segmented` "List"/"Calendar" toggle above the
table, one cell per day, color-coded by status). See the dated §7.5e write-up below for the full
removal — the short version: list/timeline-only now, the component was deleted, not hidden, and
neither of its two markers (manually-adjusted record, geofence violation) was ever calendar-only —
`AttendanceTimeline` already showed both independently, so nothing needed migrating.

**Admin manual correction UI — removed 2026-07-31 (§7.4 reversal), not an unfinished feature.**
This section originally documented `AttendanceCorrectionModal.jsx` (an "Edit" action per row/in
the photo modal, plus a toolbar "Add Record" button, both admin-only, backing onto
`PATCH /attendance/:id`/`POST /attendance/manual`). See the dated write-up below for the full
removal — the short version: Attendance is UI-read-only for every role now, and that entire
component was deleted, not just hidden.

Tests: `attendanceSummary.test.js`, `AttendanceCalendar.test.jsx`, `AttendancePhotoModal.test.jsx`,
`AttendanceRecordsSection.test.jsx`. Full frontend suite passes (the same pre-existing, unrelated
failures noted throughout this file); `npm run build` succeeds.

### Read-only Attendance, Admin's redefined `/attendance`, and 5 new filters (2026-07-31)

**Editing removed entirely — deliberate, not an unfinished feature.** `AttendanceCorrectionModal.jsx`
was **deleted** (matching the Credentials Vault removal precedent, above), and every entry point
into it was stripped: the toolbar "Add Record" button and the per-row Edit action (both
`AttendanceRecordsSection.jsx`/`AttendanceTimeline.jsx`), the photo modal's "Edit Record" footer
button (`AttendancePhotoModal.jsx`), and the calendar's "click an empty day to create a record"
handler (`AttendanceCalendar.jsx` — a day with no record simply isn't clickable now). Attendance is
UI-read-only for **every** role now, including admin. **Backend untouched, just dormant** — the
backend's `PATCH /attendance/:id` and `POST /attendance/manual` endpoints, and the
`adjustAttendance`/`createManualAttendance` wrappers in `attendanceApi.js`, are all left in place
exactly as before, easy to re-wire a UI onto later if this feature comes back — the same treatment
`customerApi.js`'s credential functions got.

**Admin's `/attendance` redefined (`AdminAttendanceView.jsx`, new).** Admin has no personal
attendance at all (exempt from checking in, §7.4c), so the old routing — `PersonalAttendanceView`
for every role — always rendered an empty table for admin. `AttendancePage.jsx` now branches on
role: admin gets `AdminAttendanceView` (org-wide, filterable, below); Manager/Employee/Sales
Associate are completely unaffected, still `PersonalAttendanceView` exactly as before. Reuses
`GET /attendance/team` (via `getTeamAttendance`) rather than a new endpoint — that call already
resolves to every record for a caller holding `attendance.view_all`, admin's own default bypass,
the same "route confirms a grant, the service resolves the actual scope" split
`TeamAttendanceView` already relies on for a manager's narrower `view_team`.

**Five filters on Admin's `/attendance`.** Employee and Status mirror `TeamAttendanceView`'s own
filter-bar pattern exactly (client-side, since the backend has no query params for either). Team
is built against the real `Team` entity (`useTeams()`), not a manager-list stand-in; it needs each
employee's `managerId`, which the lightweight `useUserDirectory()` dropdown doesn't return, so a
full roster fetch (`GET /users`, via the `user` module's existing `listUsers`) backs it instead. The Month `DatePicker` is the existing pattern, unchanged. A separate Custom Date
Range `RangePicker` handles arbitrary spans the month picker can't — the backend endpoint only
ever accepts a single `month=`, so rather than adding a new backend endpoint for what's
fundamentally the same data, a custom range fetches every calendar month it touches (almost always
1, occasionally 2 for a month-straddling range) via the existing endpoint, merges the results, then
narrows to the exact day span client-side.

**View-only capabilities confirmed unaffected.** Photo and location viewing, and the live-location
map (`/location`), are untouched by any of the above — `AttendanceRecordsSection`'s `showPhotos`/
`showLocation` props and `AttendancePhotoModal` itself needed no changes beyond losing the `onEdit`
prop; admin's org-wide view passes both as unconditionally `true` (the same `can()` admin-bypass
reasoning `TeamAttendanceView` already uses), verified live against a real check-in record's
coordinates.

19 new/updated tests: `AdminAttendanceView.test.jsx` (new — org-wide data, all 5 filters, no
Add Record, photo modal still opens), `AttendancePage.test.jsx` (new — role-based routing),
`AttendanceCalendar.test.jsx`/`AttendanceTimeline.test.jsx`/`AttendancePhotoModal.test.jsx`/
`AttendanceRecordsSection.test.jsx` (updated — assert the removed actions are gone, not just
delete the old assertions). `AttendanceCorrectionModal.test.jsx` deleted outright (tested UI that
no longer exists). Full frontend suite passes (the same pre-existing, unrelated failures noted
throughout this file, none in the Attendance module); `npm run build` succeeds. Live-verified via
Playwright: admin's `/attendance` shows real org-wide records with all 5 filters rendered, no
Add/Edit buttons anywhere, and the photo modal still shows a real record's check-in/check-out
coordinates.

### Half-day, balance, decline, calendar & notifications (`src/modules/leave/`)

Five additions on top of Leave's original request/scope-list build, backing onto the matching
backend endpoints (`backend/README.md`'s Leave section) and the existing Notification module.

**Half Day (`LeaveRequestModal.jsx`).** A plain `Checkbox`, not a separate "duration" field.
Checking it force-syncs End Date to Start Date (a half day only ever describes a single day,
enforced server-side too) and **hides** the End Date field entirely — `Form.useWatch("isHalfDay",
form)` drives the conditional render — rather than leaving it present but ignored, which would
silently mislead whoever's filling the form into thinking it still matters.

**Leave balance (`LeaveBalanceCard.jsx` + `useLeaveBalance.js`).** A prominent card at the top of
`/leave`, always showing the caller's own balance regardless of which scope tab is selected — pure
`GET /leave/balance` passthrough, no client-side re-derivation of the quota math (that stays
entirely server-side). For "admin/manager can see an employee's balance when viewing their
requests," the Team/All-scope table gains a **per-row "Paid Leave Balance" column** instead of a
second, ambiguous card — since those scopes list several employees' requests side by side, a
single balance card couldn't say whose balance it was showing. `LeaveListPage.jsx` batch-fetches
one balance per distinct `employeeId` currently listed (`Promise.all`, deduplicated), reusing the
exact same `getLeaveBalance` call the top card makes.

**Decline (`LeaveDeclineModal.jsx`).** A plain text-prompt `Modal`, not `Popconfirm` like
Approve/Mark-Unapproved-Absence — unlike those two, Decline optionally takes a `reason`, which
`Popconfirm` has no field for. Appears alongside Approve for any `pending` request — originally
admin-only, since extended to manager-on-their-own-team too (§7.5c below).

**Team leave calendar — removed 2026-07-31 (§7.5e), not an unfinished feature.** This section
originally documented `TeamLeaveCalendar.jsx` (a `Segmented` List/Calendar toggle, one row per
team member, one column per day, approved leave color-coded by type). Deleted outright — Leave is
list/table-only now, no calendar view anywhere; see the dated §7.5e write-up below.

**Notification bell — verified, not assumed (`NotificationBell.jsx`).** The bell's `MODULE_ROUTES`
map (which `relatedEntity.module` routes to which page on click) only listed `leads`/`tickets`
before this task — a new notification `type` doesn't automatically get a working click-through
just because `createNotification` starts calling it; the mapping has to be updated by hand for
each module. Checked directly (not assumed) and found the gap: added `leave: () => "/leave"` —
Leave has no per-record detail route, so every leave notification just opens the list page,
ignoring `relatedEntity.id`. The message text itself needed no changes — the bell already renders
any notification's `message` regardless of `type`. Confirmed via a new dedicated test in
`NotificationBell.test.jsx` that renders a `leave_requested`-type notification, clicks it, and
asserts the app actually navigated to `/leave`.

Tests: `LeaveRequestModal.test.jsx`, `LeaveBalanceCard.test.jsx`, `LeaveDeclineModal.test.jsx`,
`TeamLeaveCalendar.test.jsx` (all new), plus new cases added to `LeaveListPage.test.jsx` (decline
end-to-end, the balance card, the List/Calendar toggle) and `NotificationBell.test.jsx` (the leave
routing check above). Full frontend suite passes (the same 3 pre-existing, unrelated timeout
failures in `LeadDetailPage.test.jsx`/`CustomersListPage.test.jsx` as the Attendance task above);
`npm run build` succeeds.

### Manager parity, admin exemption, Reason field & Admin filters (`src/modules/leave/`, 2026-07-31, §7.5c)

Frontend half of the backend's §7.5c change (`backend/README.md`'s Leave section) — **reverses
the earlier "admin-only, manager can view but not approve" restriction** on
Approve/Decline/Mark Unapproved Absence.

**Manager parity (`LeaveListPage.jsx`).** Each action button is now gated on its own
`usePermission("leave", "approve"/"decline"/"mark_unapproved_absence")` check instead of a blanket
`isAdmin` flag — a manager holding the new default grants sees exactly the same buttons admin
does. No extra per-row "is this my own team?" check was needed on top of that: a manager without
`leave.view_all` can only ever reach `scope=own`/`scope=team` in the first place, and `scope=team`
is already backend-filtered to the manager's own direct reports (`listLeaves`'s own `managerId`
scoping) — so every row a manager can see through this UI already IS their own team's. Verified
live: a second manager's team is never even visible in the first manager's Team-scope table, let
alone actionable. The Mark Unapproved Absence confirmation's 2x-deduction warning text is
unchanged — it's the same `Popconfirm`, just now reachable by a manager too.

**Admin exemption (`LeaveListPage.jsx`).** The "Request Leave" button is hidden entirely for
admin — the backend already rejects an admin's own request outright (§7.5c), so showing a button
that would always 403 would be actively misleading rather than merely superfluous.

**Reason field.** `LeaveRequestModal.jsx`'s Reason field already existed but was optional — now
`rules={[{ required: true, whitespace: true }]}`, matching the backend's newly-required schema
field. Displayed in two places: the Admin Leave table (Team/All scope) via an **expandable row
detail**, not a new column — chosen because Reason is free-text and can run long, and a column
would either truncate awkwardly or blow up the table's width, whereas every other column here is a
short fixed-width value; `LeavePendingRequestsWidget.jsx`'s dashboard widget gained a second,
smaller text line under each employee's name.

**`LeavePendingRequestsWidget.jsx` — a bug the manager-parity change would otherwise have
introduced, found and fixed, not assumed.** The widget was hard-coded to `listLeave("all")`,
gated only on `usePermission("leave", "approve")` — safe when only admin could ever hold
`approve`, but a manager now holds `approve` by default without `view_all`, so the old code would
have 403'd for every manager who opened the dashboard. Fixed by picking the scope from whichever
view-tier grant is actually held (`view_all` → `"all"`, else `view_team` → `"team"`), the same
"check the held grant, don't assume a hierarchy" reasoning `LeaveListPage`'s own scope tabs
already use.

**Admin filters (`LeaveListPage.jsx`).** Employee / Team / Status / Date-range filters, shown only
for the Admin table (`scope=all`, list view — the Team calendar view is unaffected). All four are
client-side, same reasoning as `TeamAttendanceView`'s own Employee/Status filters: the backend has
no query params for these, and the Admin table's dataset is already fully fetched. The Team filter
needed each employee's `managerId`, which the existing lightweight `useUserDirectory()`
(`/users/dropdown`) doesn't return — rather than widening that shared, broadly-used endpoint just
for this one filter, a full roster fetch (`GET /users`, via the `user` module's existing
`listUsers`) is made instead, gated to fire only when the Admin filter bar is actually showing
(`isAdmin && scope === "all"`), the same "don't fetch what isn't needed" gating
`LeavePendingRequestsWidget` already uses for its own effect.

**A real, live-database finding, not just a code review — the "manager" `RolePermissionTemplate`
document itself was stale.** `RolePermissionTemplate` rows are lazily seeded once and then read
from the database from then on (§7.12) — a code-level default change (the backend's §7.5c edit to
`DEFAULT_ROLE_TEMPLATES`) has **zero effect on a template document that already existed** before
that change shipped. This dev database's "manager" template was seeded back on 2026-07-17 (Leave's
original Phase 3 build), long before today — meaning the backend's manager-parity change, though
already deployed, was silently non-functional for every manager until the template document
itself was corrected. Found while verifying live (a freshly-registered QA manager showed no
Actions column at all) rather than assumed from the code being "obviously right." Fixed by
`PATCH /permissions/templates/manager` with `leave` updated to include the three new actions
(dropping a stale `tasks` key the same template document still carried from before Task was
removed, §7.3 changelog note — an unrelated pre-existing staleness surfaced by the same fetch, not
introduced by this task) — confirmed via `GET /users?role=manager` that **zero manager accounts
currently exist**, so no already-existing manager needs an additional `POST
/users/:id/permissions/reset`; every manager registered from now on inherits the corrected
template automatically. This dev database and the deployed production backend share the same
`MONGODB_URI` (no separate staging DB), so this fix is already live in production too — no
separate production step was needed.

15 new/updated tests in `LeaveListPage.test.jsx` (admin-exemption visibility, per-action manager
parity, the expandable Reason row, all four Admin filters narrowing the table) plus 5 in
`LeaveRequestModal.test.jsx`/`LeavePendingRequestsWidget.test.jsx` (Reason required, the
scope-fallback fix above). Full frontend suite: 371 passing (the same pre-existing,
concurrent-session-affected failures noted in `docs/project-status.md`'s changelog entry for this
task, none in the Leave module); `npm run build` succeeds. Live-verified end-to-end via Playwright
against isolated dev server instances with temporary admin/manager/employee accounts (two separate
manager+employee teams, to prove cross-team isolation) — cleaned up (deactivated + hard-deleted)
after.

### Leave restructure (tabs/columns/filters/delete) & Attendance calendar removal (2026-07-31, §7.5e)

Two changes built together — both simplify an existing view down to list/table-only, and both
touch `LeaveListPage.jsx`/`AttendanceRecordsSection.jsx` in the same task.

**Leave: role-shaped tabs, no "All" tab, no calendar (`LeaveListPage.jsx`).** The List/Calendar
toggle and `TeamLeaveCalendar.jsx` are gone entirely — deleted, not hidden (same Credentials Vault
precedent). Tabs are no longer purely permission-derived the way they were under §7.5c: admin's
own `can()` bypass would make every scope "available," which is exactly backwards once the goal is
"admin gets no tabs at all." Instead:
- **Admin** is branched explicitly (the same "structurally different view" precedent
  `AdminAttendanceView` already established in §7.4's write-up) — no tabs, a single unified,
  always-filterable view of every request org-wide.
- **Everyone else** gets tabs built from whichever of `leave.view`/`view_team` they hold — never
  `view_all`, which has no tab anymore, full stop. If only one is held, no tab UI renders at all
  (the same "don't show a lone toggle with one real choice" reasoning already used elsewhere in
  this app) — a plain employee/sales_associate sees just their own list. A manager, holding both
  by default (§7.5d's new `view` grant), sees exactly "Own"/"Team".

**Column widths increased, horizontal scroll enabled.** Every column now has an explicit `width`
and the `Table` gets `scroll={{ x: "max-content" }}` — the same pattern `LeadsTable.jsx`/
`CustomersTable.jsx` already use, horizontal scroll over squeezed columns.

**Team filter bug fixed — built against the real `Team` entity now.** The original §7.5c Team
filter derived its options from `teamDirectory.filter(role === "manager")` (a manager-list
stand-in) rather than the actual `Team` collection — this silently excluded any team headed by an
admin (a real team in this dataset has exactly that shape: `headManagerId` pointing at an admin
account, not a "manager"-role user), which was the actual bug behind "the one existing team isn't
showing up." Now built from `useTeams()` (the real endpoint `UserDetailPage.jsx` already uses),
filtering leave records by matching `managerIdByEmployeeId.get(employeeId) === team.headManagerId`.

**Delete action, new (`DELETE /leave/:id`, §7.5d/§7.5e).** A `DeleteOutlined` icon button
(`aria-label="Delete"`, wrapped in a `Tooltip`) in the same Actions column as Approve/Decline/Mark
Unapproved Absence, gated on `usePermission("leave", "delete")` — same per-action pattern as the
other three, no extra per-row team check needed for the same reason those don't need one (a
manager can only ever reach rows already scoped to their own team). A `Popconfirm` ("Delete this
leave request? This cannot be undone.") gates the actual call — matching the existing
destructive-action pattern already established for Mark Unapproved Absence in this same table,
rather than inventing a new confirmation shape.

**Attendance: calendar view removed entirely (`AttendanceRecordsSection.jsx`).** The
List/Calendar `Segmented` toggle is gone; `AttendanceTimeline` renders unconditionally now.
`AttendanceCalendar.jsx` is **deleted outright**, not hidden. **Confirmed, not assumed, before
deleting:** neither the manually-adjusted-record marker nor the geofence-violation marker was ever
calendar-only — `AttendanceTimeline` already showed both independently (the exclamation badge next
to the Status tag, and the "Location" column's own `GeofenceViolationBar`), so nothing needed
migrating into the list view; it was already there.

**A real backend permission gap, found while building the tab restructure, not assumed correct.**
A manager had `leave.view_team` but never plain `leave.view` — no way to see their OWN past leave
requests at all, since `GET /leave` (scope=own) requires `leave.view` specifically and manager's
default template never granted it (only `sales_associate`/`employee` had it). Fixed on the backend
(`DEFAULT_ROLE_TEMPLATES.manager.leave.view: true`, §7.5d) — see `backend/README.md`'s own §7.5d
write-up for the full reasoning, the same "stale already-seeded `RolePermissionTemplate` document"
finding as §7.5c hit again, and the live template patch that came with it.

21 new/updated tests: 12 in `LeaveListPage.test.jsx` (role-based tab visibility, no-tabs-for-admin,
the real-Team-entity filter fix, Delete gating/confirmation/call), `TeamLeaveCalendar.test.jsx`
deleted outright, `AttendanceCalendar.test.jsx` deleted outright,
`AttendanceRecordsSection.test.jsx` updated (asserts no List/Calendar toggle renders at all).
Full frontend suite passes (the same pre-existing, unrelated failures noted throughout this file,
none in Leave or Attendance); `npm run build` succeeds. Live-verified via Playwright: an admin
sees no tabs and the Team filter dropdown lists the real "Sale Team" (previously invisible, headed
by an admin account); a manager sees exactly "Own"/"Team" and can Approve/Decline/Mark Unapproved
Absence/Delete on their own team's row (confirmed via horizontal scroll to the Actions column); an
employee sees no tabs, no Actions column, and no Delete option at all; Attendance shows no
calendar view anywhere, with the manually-adjusted and geofence markers still visible in the list.

### Leave: icon-only actions & Reason as a real column (`LeaveListPage.jsx`, 2026-08-04, §7.5f)

**Icon-only action buttons, Tooltip on hover.** Approve/Decline/Mark Unapproved Absence/Delete
(the same four gated by `usePermission` since §7.5c/§7.5e) are now `type="text"` icon buttons
(`CheckOutlined`/`CloseOutlined`/`ExclamationCircleOutlined`/`DeleteOutlined`) each wrapped in a
`Tooltip`, matching the established icon+Tooltip+`aria-label` pattern
(`CustomerStatusToggleButton.jsx`, `LeadsTable.jsx`'s Log Call/Hot-toggle buttons) instead of
this table being the one place still using full text-labeled buttons. Each button keeps the
exact same `aria-label` text its old visible label used ("Approve", "Decline", etc.) — the
`Popconfirm`/gating logic underneath is unchanged, so every existing
`getByRole("button", { name: "..." })` test query kept working with no changes needed. Actions
column `width` dropped from `300` to `160` now that the column no longer needs to fit four full
text labels.

**Reason is a real column now, not an expandable row.** The old `expandable` row (which only
showed for non-"own" scopes) is removed entirely — no `Table` `expandable` prop at all — replaced
with a plain "Reason" column, shown unconditionally (including for an employee's own "own"-scope
list, unlike the old expandable row). Long reasons truncate via AntD `Typography.Text`'s
`ellipsis={{ tooltip: reason }}` — the simplest standard AntD truncation mechanism, chosen over
hand-rolled CSS truncation + a separate `Tooltip` wrapper since there was no existing precedent
in this codebase to match either way. The table already had `scroll={{ x: "max-content" }}` from
§7.5e, so the extra column is a non-issue width-wise.

12 updated tests in `LeaveListPage.test.jsx`: the old expandable-row Reason tests replaced with
tests confirming the Reason column renders directly (own scope included) and that no "Expand
row" toggle exists anywhere; every pre-existing Approve/Decline/Mark Unapproved Absence/Delete
query needed zero changes, proving the `aria-label` preservation actually worked. Full Leave
suite passes (31/31).

### Geofencing (`src/modules/attendance/`)

Surfaces the backend's new `geofenceViolations[]` (see `backend/README.md`'s Attendance section
for the full design) alongside every existing connectivity-gap display, in the same three places
that already show connectivity gaps — deliberately reusing those exact spots rather than adding
a separate "Location" page or view.

**`GeofenceViolationBar.jsx`** — a new component, structurally identical to the existing
`ConnectivityGapBar` (same proportional-bar-over-a-shift shape, same `title` HTML attribute for
a segment's tooltip), but **orange**, not `ConnectivityGapBar`'s red — a real, immediately visible
difference in hue (not just a lighter/darker shade of the same color) so the two issue types are
distinguishable at a glance, not just "something was wrong that shift." Handles a defensive edge
case `ConnectivityGapBar` never needs to: a violation's `end` can be `null` if somehow still open
by the time a finished shift is rendered (checkout always force-closes one in practice, but this
falls back to the shift's own end rather than crashing on `new Date(null)`).

**`AttendanceTimeline.jsx`** — a new **"Location"** column (with a small `EnvironmentOutlined` pin
in its header, the same icon already used for the Location nav item and the check-in widget's own
coords button — reused, not a new icon introduced) sits next to "Connectivity Gaps", rendering
`GeofenceViolationBar`. A separate column, not overlaid onto the same bar as connectivity gaps —
so the column header itself is the first, clearest signal of *which* issue occurred, before a
viewer even looks at the bar's color.

**`AttendancePhotoModal.jsx`** — a new "Location" section (same pin icon) sits below "Connectivity
Gaps", showing that day's `GeofenceViolationBar`.

**`AttendanceCalendar.jsx`** — a day with any geofence violation gets its own small badge, same
treatment as the existing manually-adjusted-record marker but in the **opposite corner**
(top-left, `EnvironmentFilled`, orange) so a day that's both manually-adjusted *and* had a
violation shows both markers without either overwriting the other.

Tests: new cases added to `AttendanceTimeline.test.jsx` (the orange segment, its distinctness from
a connectivity-gap segment, the plain-green no-violation case), `AttendancePhotoModal.test.jsx`
(the Location section rendering with and without a violation), and `AttendanceCalendar.test.jsx`
(the marker showing/not showing, and both markers coexisting on one day) — no new dedicated test
file, matching the existing precedent that `ConnectivityGapBar` itself has no dedicated test file
either, only coverage through the three consumers above. **Live-verified via CDP against the real
running dev servers:** seeded an open shift directly (the local dev backend's placeholder
Cloudinary credentials can't complete a real check-in's photo upload) with real
`checkIn.coords`, sent real `POST /location/pings` calls — one far enough to open a violation
(the response's `maxDistanceMeters` matched the expected ~1113m for the offset used), one back
within radius to close it — then closed the shift via `PATCH /attendance/:id` and confirmed the
Location column, the calendar's orange pin marker (correctly not overlapping the
manually-adjusted marker), and the photo modal's Location section all rendered correctly; test
data deleted afterward. Full frontend suite passes (the same 2 pre-existing, unrelated timeout
failures as every prior task); `npm run build` succeeds.

### Attendance table: a single 24-hour Timeline column (§7.4e, 2026-08-04)

Replaces the table's old separate Check-In/Check-Out/Working Hours columns and the
"Connectivity Gaps" column (`ConnectivityGapBar`) with one `AttendanceTimelineBar` column — a
single horizontal bar representing that full calendar day, color-segmented by status, plus three
calculated duration stats underneath. "Location" (geofence violations) is **unaffected** — it
stays its own separate column, since it answers a genuinely different question ("where," not
"when") the timeline was never meant to absorb.

**Investigation first, per the task's own instruction (folded into this same build, not a
separate step):** confirmed via the actual column render functions — not assumed — that
Check-In/Check-Out (`checkIn.time`/`checkOut.time`, shown as text) and "Connectivity Gaps"
(`ConnectivityGapBar`, overlaying `connectivityGaps[]` in red) were reading **different fields**,
not duplicate data: the gap bar only reads the two timestamps to *scale* itself, its actual
content comes from a field the other columns never touch. So this was a **UI clarity/visual-
redundancy problem**, not a data bug — several columns all visually anchored to the same two
timestamps, two of them near-identical-looking colored bars (`ConnectivityGapBar`/
`GeofenceViolationBar` share the exact same shape, differing only by overlay color) reads as
duplication even though the underlying data doesn't overlap. Nothing about the underlying data
needed fixing before building this on top of it.

#### The bar and its summary labels describe the same window (§7.45, 2026-08-06)

`computeTimelineSegments` and `computeAttendanceDurations` both derive from
`resolveShiftMs`, which is now the single source of truth for "how much of this shift belongs to
this row". They used to decide independently and diverged in two ways:

- **A shift crossing midnight** drew a bar ending at midnight beside a label reading
  `Shift: 49h 23m`. **A row now reports THAT DAY's portion**, because the row *is* a day — its
  date column, its 24-hour bar and its stats all describe one calendar day. The full span stays
  recoverable from `workingHours`, computed once at checkout from the untouched timestamps, so
  payroll's basis is unaffected. The Shift tooltip says so when clamped.
- **An open shift** returned nulls, rendering three `-` labels beside a green band. It now reports
  elapsed-so-far, and the bar stops at `min(now, end of day)` rather than running to midnight —
  drawing green to midnight would claim tracked time that has not happened. The label reads
  `5h 30m so far`.

`MIN_SEGMENT_MS` (1 minute) suppresses sub-perceptible bands. Two real records have
`breakIn`/`breakOut` seconds apart, producing a 0.004%-wide sliver that cannot be seen or hovered;
the same floor applies to connectivity gaps.

`dayBoundsMs` falls back to the check-in's own day when `record.date` is missing. The model
requires `date`, but `computeAttendanceDurations` only started needing a day boundary here —
before that it measured raw timestamps — and returning `NaN` for a record with perfectly good
timestamps would be a silent regression.

Tests assert the bar and the summary **against one fixture at one instant** rather than separately.
Testing them apart is exactly how they diverged: each was individually defensible.

#### Acting on an item dismisses its notification (§7.44, 2026-08-06)

Approving, declining or marking-unapproved-absence a leave request marks **that request's**
notification read, resolved through `relatedEntity` (`markForEntity.js`). Never a bulk clear by
type — that was the §7.43 bug. Acting on request X leaves Y's badge alone.

Opening a lead from a notification already marked it read: `NotificationBell`'s click handler calls
`markAsRead` before navigating. That path was unchanged.

The helper reads `GET /notifications` and PATCHes the matches rather than calling a dedicated
endpoint. A `PATCH /notifications/read-by-entity` would be one round trip instead of two and is the
cleaner shape; this stays frontend-only because that endpoint does not exist and adding one would
mean a backend deploy for a UI dismissal rule. Worth revisiting past a handful of call sites. It
never throws — dismissal is a side effect of the real action, and surfacing an error there would
report a failure the user did not cause.

It fires `NOTIFICATIONS_CHANGED_EVENT`, so the bell and both sidebar badges update in the same tick
instead of the sidebar lagging up to its own 60s poll.

**No dismiss affordance was added to the badge itself.** The badge sits inside a nav `Link`; a click
target there would re-create precisely the ambiguity §7.43 removed — clicking at or near a nav item
dismissing things. A badge is a count indicator, not a control. The bell dropdown is the one surface
whose purpose is notifications, and it already has both per-item dismissal and "Mark all as read".

#### Notifications are dismissed by the user, never by navigating (§7.43, 2026-08-06)

`clearLeadsBadge`/`clearLeaveBadge` are gone. They were wired as `onNavigate` on the Leads and
Attendance nav items and called `markAllRead` for every type in that badge — so clicking
"Attendance" for **any** reason marked every unread leave notification read, whether or not it had
ever been displayed.

That is the whole "the admin never receives leave notifications" report. The pipeline was correct
end to end — recipients, records, and both queries all verified — and a navigation then dismissed
the result. Corroborated in the live data: two notifications created minutes apart were both
already `isRead: true` with nobody having deliberately dismissed them.

Dismissal is now only ever explicit:
- opening a notification from the bell dropdown (which already routes to it), or
- the dropdown's "Mark all as read".

Nothing marks read on render, on hover, or on route change. The scoped
`markNotificationsReadByType` API wrapper was removed so the auto-clear cannot be re-wired without
deliberately re-adding it; the backend endpoint is unchanged and still accepts `?type=`, since it
is correct for an explicit scoped dismissal.

`useSidebarBadgeCounts` gained the **visibilitychange refetch** the bell and
`useCheckedInHeartbeatLoop` already had — without it the sidebar badge sat stale on tab return
while the bell updated, and the two visibly disagreed. It also listens for
`NOTIFICATIONS_CHANGED_EVENT` (`modules/notification/notificationEvents.js`), which the bell fires
on every explicit dismissal: the two hooks read the same endpoint with no shared store, so
otherwise the badge showed a stale count for up to a full 60s poll after the user acted. A window
event rather than lifted state keeps them decoupled — neither imports the other, and §3 reserves
Zustand for genuine cross-page state, which a refresh ping is not.

`LEAVE_NOTIFICATION_TYPES` gained `leave_unapproved_absence` alongside the backend enum. Tests
assert against that exported constant rather than a literal array, so the badge filter cannot
silently drift from the enum and leave the bell showing a type the badge never counts.

#### Renewals due, above the Customers table (§7.42, 2026-08-06)

`ExpiringAmcPanel` surfaces AMCs renewing within 30 days or already overdue, so a renewal is
visible without opening each customer.

**Deliberately not the four-across card grid** `CustomerAmcSection` uses. That grid answers "what
does THIS customer's contract look like", where a card per term with amount and history earns its
space. This answers "whose renewals need action" — a worklist: one dense row per record, sorted
most-urgent-first by the server, with customer, renewal date, amount, days remaining and Renew.
Rendering both the same way would invite reading one as the other, the mistake Timeline and
Location made by both being bars.

**Hidden entirely when nothing is due** — not an empty state, not a collapsed shell. A permanently
empty panel above the table trains people to ignore that space. When there is something, the count
sits in the header so a collapsed panel still says how many, with overdue called out separately.
Overdue and expiring-soon get different tag colours, not just different words.

Renew reuses `AmcRenewModal` and `POST /amc/:id/renew` — one renew path, not two — and the row
leaves via refetch rather than a local splice, because the server's "renewed terms are marked
expired and drop out" rule then lives in one place. Gated on the existing `amc.edit`
`PermissionGate`, the same grant as the Customer Detail page's Renew button.

`customerName` arrives on each record from the single list query, so the panel costs one request
regardless of row count. Verified in a browser: six rows cost the same number of requests as two.

#### One explicit row action, no whole-row click (§7.4h, 2026-08-06)

`AttendanceTimeline` has no `onRow` handler. It used to, and that made the entire row a button:
every column opened the same `AttendancePhotoModal`, byte-identical, with nothing signalling it —
the two columns carrying visual widgets got clicked most and so *appeared* to share a behaviour
they didn't own. Date, Status and Employee opened it too.

The single route in is a **"View details"** action in the Actions cell, matching `PaymentsTable`'s
pattern (`type="text"` icon button + `Tooltip` + `aria-label`). A Date-cell link was the
alternative and was rejected: no table here links a cell to open a modal — links go to routes.

The Actions column is now always rendered; it was previously gated on `onMarkStatus`, which is
admin-only, so gating Details on it would have left Personal and Team views unable to open the
modal at all. Missing-day rows get no Details action, and keep their Popconfirm gap-filling
buttons. The Geofence chip keeps its own direct route to the map modal via `stopPropagation`.

#### ConnectivityGapBar shares the Timeline's segment function (§7.4h, 2026-08-06)

The last bar still using its own check-in→check-out scaling, a full-width green base, and native
`title` attributes — and it sat directly above the Geofence chip in the modal.

It now calls **`computeTimelineSegments`**, the same function the Timeline column uses, filtering
out only the break band. Sharing the function rather than the axis helper alone makes alignment
true by construction — there is one piece of code deciding where a gap goes, so it cannot land at
two different offsets. Off-shift hours show the shared gray base; the palette is identical to
Timeline (`green-400` connected, `red-500` gap) so a gap looks the same everywhere, and stays out
of the sky/violet geofence family. One controlled Tooltip, content keyed by hovered band.

#### The Geofence column is a chip, not a bar (§7.4g, 2026-08-06)

`GeofenceViolationBar` renders a status chip. §7.4f had already put it on the timeline's axis,
which fixed the arithmetic but not the reading — two bars of equal width side by side still
invited comparison, when one measures "was the device connected" across the day and the other
"how far from the check-in point". A chip reads as a value, like every other column.

Four states from `utils/geofenceSummary.js#summarizeGeofence`: **Within range**, **In progress**,
**N excursions · max 1.2 km** (count plus the largest `maxDistanceMeters`; metres under 1 km,
kilometres to one decimal above), and **No data** — gray *and dashed*, because a solid gray chip
beside a green one still scans as a pass. Header renamed from "Location", which read as "where
were they" — the Live Map's question, not this column's.

`no_data` is keyed on "no check-in on this record" and deliberately NOT on missing
`checkIn.coords`: `applyVisibilityRules` nulls those for any viewer without
`attendance.view_location`, so that would label a fully-tracked month "No data" for a manager
lacking the grant. The violation branch runs first because `geofenceViolations` is never stripped.

An excursion chip opens `AttendanceLocationMapModal` for that record's employee and date, with
violation points already plotted, and stops propagation so it doesn't also fire the row's click.
It is not wired to the Live Map tab — `LiveTrackingMap` is live-only and takes no employee/date
input, so it cannot show a past row's trail.

Tooltip is the same controlled AntD `Tooltip` the timeline uses, listing each violation's clock
range and distance. Never a native `title`, which a browser can render at the same time as an AntD
tooltip from the neighbouring column.

**Known limitation** (`docs/project-status.md`): a shift that checked in and then reported no
positions still reads "Within range". Closing it needs a ping count on the attendance payload.

#### Timeline and the (former) Location bar shared one 24-hour axis (§7.4f, 2026-08-06)

The two bars in an Attendance row are drawn against the same midnight→midnight axis, so a band at
a given x-offset means the same clock time in both columns. `utils/attendanceDayAxis.js` owns that
axis (`createDayAxis`, `resolveShiftMs`); `attendanceTimeline.js` and `attendanceGeofence.js` both
consume it and neither computes percentages itself — two components independently deriving a day
axis is precisely how they drifted apart. Previously Location stretched check-in→check-out across
its full width, making the halfway mark 12:00 in one column and 13:30 in the other.

Superseded by §7.4g above, which replaced that column with a chip — the axis helper stays because
the timeline still uses it, and it keeps its own tests for the midnight-bounds and
open-shift-runs-to-end-of-day edge cases.

#### One tooltip for the whole bar, content keyed by band (2026-08-06)

The bar originally carried a `Tooltip` **and** gave each colour segment its own. Since the bar is
an **ancestor** of every segment, its `mouseenter` fired by bubbling on each hover and two
tooltips opened simultaneously — the gray-base explanation and the segment's, overlapping each
other on screen.

Reproduced in a real browser before changing anything (jsdom has no meaningful hover or pointer
semantics), with a synthetic record covering all four bands and no database write. The
measurements identified the cause precisely: **two tooltips in the dead centre of every coloured
band**, gray base alone showing one. That ruled out sub-pixel segment overlap (which would only
misbehave at boundaries — and the segments deliberately *layer*, amber/red painted over green,
rather than abutting) and stale tooltips (a fast sweep settled back to zero).

The fix is a **single controlled `Tooltip` wrapping the bar, whose `title` is keyed by the
hovered band** — segments are plain positioned divs that set an `activeIndex`, and `null` means
the gray base. Removing the outer tooltip alone would have been the smaller change but would have
silently dropped the gray base band's own explanation, which is a real state (before check-in,
after check-out, or never checked in at all). Swapping one tooltip's content keeps all four
meanings and makes two-at-once structurally impossible rather than merely unlikely.

Verified in the browser after the fix: exactly one tooltip at the centre of every band, at all
eight segment boundaries (probed at ±1.5px, ±0.5px and dead-on), and throughout a fast sweep,
settling to zero on exit.

`AttendanceTimelineBar.tooltip.test.jsx` guards the structure. It replaces AntD's `Tooltip` with a
passthrough that *wraps* rather than clones, so triggers become countable — a first attempt that
asserted on the real rendered DOM passed against the **buggy** component and was discarded. The
kept version fails on 6 of its 9 cases if the old shape is restored.

**`utils/attendanceTimeline.js`** — two pure, independently-tested functions, kept separate from
the presentational component so the actual math has its own direct test coverage (matching this
project's established "extract pure decision logic" precedent, e.g.
`resolveDropDestination.test.js` for the Leads kanban board):
- **`computeTimelineSegments(record)`** → `[{ color, leftPercent, widthPercent }]`, the same
  left/width-percent-over-a-relative-container technique `ConnectivityGapBar`/
  `GeofenceViolationBar` already used, just computed against the full 24-hour day instead of
  just the shift window. **GRAY** (the bar's own background, no segment needed) = not checked in
  at all that day, or before check-in/after check-out; **GREEN** = checked in, connected
  normally; **RED** = a connectivity gap; **AMBER** = the break period
  (`breakIn.time`–`breakOut.time`) — the task's own stated assumption, adopted as given (gray was
  the offered alternative). A record with no `checkIn.time` at all returns an empty array — the
  component then renders a fully gray bar, per the task's explicit requirement.
- **`computeAttendanceDurations(record)`** → `{ shiftMs, connectedMs, issueMs }` — Total Shift
  Time (`checkOut - checkIn`), Total Connectivity Issue Time (summed gap durations), Total
  Connected/Normal Time (shift minus gaps minus break). All three `null` when there's no
  check-in/check-out to measure against (an absent day, or a still-open shift) — the component
  renders `-` for each in that case. `formatDuration(ms)` renders `"8h 15m"` (omitting the hours
  part entirely under an hour, e.g. `"45m"`) rather than raw minutes/seconds.

**Midnight-crossing shifts — confirmed possible, not assumed away, by reading the data model:**
`attendance.service.js#checkIn` sets `date: startOfDay(now)` at check-in time, and `checkOut`
never validates that the checkout timestamp falls on the same calendar day, nor caps shift
duration — so a shift starting just before midnight can legitimately end after it. Since this
timeline represents exactly one calendar day (`record.date`, local midnight to midnight), a
checkout landing after that boundary is **clamped to the end of the bar** (100%) rather than
overflowing past it or attempting to wrap onto a second row — there's no "continues on
tomorrow's row" marker; tomorrow's own row already independently reflects whatever was recorded
against that day's own `checkIn`/`checkOut`.

**`AttendanceTimelineBar.jsx`** — the presentational component: the bar itself (gray base,
absolutely-positioned colored segments from `computeTimelineSegments`), then the three duration
stats as small `Tooltip`-labeled text underneath (`Shift: 8h 15m`, `Connected: 7h 45m`,
`Issues: 20m`). `AttendanceTimeline.jsx`'s old five columns (Check-In, Check-Out, Working Hours,
Connectivity Gaps, plus the now-unused `ConnectivityGapBar` import) collapsed into one "Timeline"
column rendering this component — `GeofenceViolationBar`'s "Location" column is untouched,
still reading `geofenceViolations[]` exactly as before.

**Testing:** `attendanceTimeline.test.js` (12 tests) covers the pure functions directly — no
segments for no check-in, a plain green segment for a normal shift, gap+break overlaid with the
correct color/position/precedence (a gap wins over an overlapping break, since the connectivity
issue is the more actionable thing to surface), the midnight-crossing clamp, a still-open shift
running to the end of the bar, and all of `computeAttendanceDurations`'/`formatDuration`'s
branches (including the zero-duration `"0m"` case, which must not read as the `null`-duration
`"-"` case). `AttendanceTimeline.test.jsx` was rewritten (not just trimmed) for the new column —
the calculated duration stats render correctly, a connectivity gap renders as a real, correctly-
positioned red segment, a normal day renders green-only, and a no-attendance day renders a bar
with zero segments — the manually-adjusted-marker and Location-column tests were unaffected and
needed no changes. Full Attendance suite: 73/73 passing; full frontend suite: no new regressions
(same pre-existing, unrelated failures noted throughout this file). `npm run build` succeeds.

**Verified visually** by rendering `AttendanceTimelineBar` directly (bypassing the app's login,
which wasn't reachable with available dev credentials in this environment — see the 2026-08-04
Leaflet migration's changelog entry for the same constraint) against three representative
records via a throwaway Vite entry point, screenshotted, and deleted afterward — confirmed: a
gray-then-green-with-a-red-sliver-and-an-amber-sliver-then-gray bar for a shift with a gap and a
break, positioned proportionally correct; a plain green bar for a normal shift; and a fully gray
bar with zero segments for a day with no attendance at all, exactly matching the task's stated
verification criteria.

### Attendance corrections/additions — Break In/Out, admin exemption, permission-gated photo/location, notifications (§7.4c, 2026-07-31)

Frontend half of the backend's five §7.4c additions (see `backend/README.md`'s own Attendance
section for the full backend write-up).

**1. Admin exemption.** `PersonalAttendanceView.jsx` now conditionally renders
`<CheckInOutWidget />` — omitted entirely when `user?.role === "admin"`. The backend already
rejects an admin's own check-in (403), but hiding the widget here means an admin never even sees
a check-in prompt to begin with, not just a rejected attempt after tapping it. The rest of the
page (summary stats, records table, admin correction UI) is unaffected — an admin still visits
`/attendance` to correct records, just without a check-in widget above it.

**2. Break In/Out UI — extends `CheckInOutWidget.jsx`'s existing state machine.** New state:
Not Checked In → Checked In → (On Break) → Checked In → Checked Out. Two new derived booleans,
`isOnBreak`/`canBreakIn`, computed from the open record's `breakIn`/`breakOut` timestamps (same
"derive state from timestamps, don't track it separately" approach the widget's own
`isCheckedIn` already uses). Break In only renders when checked in, not on break, and the
shift's one break hasn't been used yet; Break Out only renders while on break — matching the
backend's own rejection conditions exactly, so the button a user *can* tap always succeeds.

- **No camera/photo step at all for either — a single click captures geolocation and submits
  immediately**, unlike check-in/check-out's own capture-then-confirm flow. New
  `requestGeolocationOnce()` (in `useGeolocation.js`, exported standalone alongside the existing
  stateful hook) wraps `navigator.geolocation.getCurrentPosition` in a plain Promise — the
  stateful hook's own "capturing.../error/retry" UI isn't needed for a flow with no camera step
  to render alongside, so a promise a handler can simply `await` is the right shape here, not a
  second hook.
- **The Check Out button is disabled (with an explanatory tooltip) while on break** — a UI nicety
  on top of the backend's own 409 rejection, so the user finds out *before* tapping Check Out
  that they need to end their break first, not after a failed request.
- **"On Break since {time}" tag**, shown alongside the existing "Checked In"/elapsed-time
  display, using the record's own `breakIn.time`.

**3. Permission-gated photo/location display — `AttendancePhotoModal.jsx` gains two new props,
`showPhotos`/`showLocation`.** The backend already strips `photoUrl`/`coords` server-side for a
viewer who lacks the corresponding permission, so the frontend's job is deciding whether to
render the SECTION at all, not the data itself:
- **`TeamAttendanceView.jsx`** computes both via `usePermission("attendance",
  "view_photos"/"view_location")` (admin bypasses both automatically, the same `can()`
  short-circuit every other permission check in this app already relies on) and passes them down
  through `AttendanceRecordsSection.jsx` to the modal.
- **`PersonalAttendanceView.jsx` passes `showPhotos={false}`/`showLocation={false}`
  unconditionally** — a hard rule, not permission-based, matching the backend's own "no override
  for self-viewing" behavior. Even an admin or a manager granted both permissions sees the
  stripped shape when viewing their OWN history through this same page.
- **Omitting the section entirely (not an empty "No photo"/"No coordinates" placeholder) when the
  viewer lacks the grant** — the empty-placeholder state already existed for a genuinely
  photo-less record (e.g. an admin manual correction); reusing it for "you don't have permission"
  would conflate two different reasons for absence, making a permission boundary look like a data
  problem. `PhotoSlot`'s `time` field is never gated — only the image and the coords line are.
  The modal's "Location" section header (the `GeofenceViolationBar` block) is gated the same way.
- **The Timeline/Calendar list views' own "Location" column is deliberately left ungated** — a
  judgment call, not an oversight: that column renders `GeofenceViolationBar`, a derived
  violation-timeline summary (did the shift stay within the geofence radius, for how long), not
  the raw GPS coordinates `attendance.view_location` actually governs. The backend itself never
  strips `geofenceViolations` for any viewer — only `photoUrl`/`coords` are permission-gated
  server-side — so gating this column on the frontend alone would be inconsistent with what the
  backend actually protects.

**4. Status filter — `TeamAttendanceView.jsx`.** A new `Select` alongside the existing Employee
filter, backed by new `ATTENDANCE_LIFECYCLE_FILTER_OPTIONS`/`deriveAttendanceLifecycleState`
(`attendance.constants.js`) — a DERIVED shift-lifecycle state (present/on-break/checked-out/
absent), computed client-side from the same `checkIn`/`checkOut`/`breakIn`/`breakOut`/`status`
fields already on each record, not a new backend query param (the existing Employee filter
already works this same "fetch the month, filter client-side" way). Deliberately distinct from
the raw `status` enum (`present`/`absent`/`half_day`/`on_leave`) — a `half_day`/`on_leave` record
with no real check-in matches none of the four lifecycle filter values and only shows under "All
statuses," which is correct: it genuinely isn't in any of those four shift states.

**5. Notifications — no backend-shape surprises, confirmed by reading the actual endpoint names/
types before starting (per this task's own instruction).** The bell (`NotificationBell.jsx`)
already renders any notification generically via its own `message` string — there was no
per-type icon/label mapping to extend for any EXISTING type, so the four new
`attendance_check_in`/`attendance_break_in`/`attendance_break_out`/`attendance_check_out` types
needed no bell-rendering changes at all. One small addition: `MODULE_ROUTES` gained
`attendance: () => "/attendance"` (matching `leave`'s own `() => "/leave"` — no per-record detail
route exists for either module, so a click just goes to the list/personal-view page, ignoring
`relatedEntity.id`) — previously, clicking an attendance notification did nothing at all.

**Testing:** `CheckInOutWidget.test.jsx` gained a new describe block (7 tests) — Break In shown/
hidden correctly, "On Break since" tag + Check Out disabled while on break, Break In/Out both
hidden once the one break is used, Break Out submits and refetches, a denied-geolocation error
for a break action, no break buttons at all when not checked in.
`AttendancePhotoModal.test.jsx`'s existing tests were updated to explicitly pass
`showPhotos`/`showLocation` (previously implicit/always-shown), plus a new describe block (3
tests) covering all four permission combinations. Full frontend suite passes (the same
established pre-existing flaky tests, unrelated to this change — confirmed via isolated re-runs);
`npm run build` succeeds.

**Live-verified end-to-end** against isolated, throwaway dev server instances (the shared local
dev servers' ports/CORS config didn't match this session's actual assigned ports, worked around
without touching anyone else's running instance) — created temporary manager+employee accounts,
drove the full flow: admin sees zero Check-In buttons on `/attendance`; employee checks in,
starts a break ("On Break since..." tag appears, Check Out visibly disabled), ends the break
(Check Out re-enabled), checks out; the manager's team view showed neither photo nor the
Location section before being granted `view_photos`/`view_location`, and both correctly appeared
immediately after the grant (via `PATCH /users/:id/permissions`) with a page reload; the Status
filter's "Checked Out" option correctly narrowed the table to just that one record; the
employee's own record modal showed times/connectivity-gaps only, no photo/coordinates; the
notification bell showed all four event confirmations with correct messages and timestamps.
Temporary accounts deleted afterward.

### Dashboard widget catalog (`src/modules/dashboard/`)

`/dashboard` is a **declarative widget catalog, not a runtime plugin/registry** — there's no
precedent anywhere else in this codebase for widgets registering themselves at runtime (the
permission system itself is a static constants object, `PERMISSION_REGISTRY`, not something
modules register into), and a full registry pattern would be real complexity for what's
currently 2 modules' worth of widgets.

**Three pieces:**
1. **`widgets/*.jsx`** — each widget is a small, self-contained component. It fetches its own
   data via the existing module APIs (`leadApi`/`customerApi`), renders itself, and handles its
   own loading/error/empty states independently via the shared `widgets/WidgetCard.jsx` shell —
   one widget's fetch failing shows an inline error on **that card only**, never throws up to
   `DashboardPage` and takes any other widget down with it.
2. **`dashboardConfig.js`** — a single `role → ordered widget-component list` map
   (`DASHBOARD_WIDGETS_BY_ROLE`), read via `getDashboardWidgetsForRole(role)`.
3. **`../../pages/DashboardPage.jsx`** — reads the current user's role from `sessionStore`,
   looks up their candidate widget list from the config, and renders them in a responsive
   Ant Design `Row`/`Col` grid (`xs={24} md={12} xl={8}`).

**Permission-gating is defense in depth, not just the config:** the config only decides which
widgets are *candidates* for a role. Every widget additionally calls `usePermission(module,
action)` itself and renders `null` if the check fails — because a specific user's permissions
can be overridden away from their role's template defaults at any time (§7.12's per-user
override), the role-level config alone can't be trusted as the real gate. This mirrors
`PermissionGate`/`MainLayout`'s own nav-filtering precedent exactly.

**Scoping is always reused, never reinvented:** every widget calls the exact same
scoped list-fetching function its module's own list page already calls (`listLeads()`,
`listCustomers()`) — the backend does org-wide/team/own scoping server-side based on the
caller's role (`lead.service.js`/`customer.service.js`), so a `sales_associate`'s widgets
automatically show only their own data with zero client-side scoping logic duplicated here.

**Widgets built (Leads + Customers, §7.20):**
- `LeadsPipelineWidget` — count of leads per `LEAD_STATUSES` status.
- `LeadsFollowUpWidget` — today + overdue follow-up counts, with a short linked list.
- `LeadsHotWidget` — currently-flagged-hot leads. `GET /leads` has no server-side `isHot`
  filter, so this fetches the same scoped list `LeadsPipelineWidget` does and filters
  client-side — the same precedent `TeamAttendanceView`'s employee selector already set for a
  filter the backend doesn't expose.
- `CustomersOverviewWidget` — total active customers + contract counts by type. No aggregated
  "contracts by type" endpoint exists, so (mirroring `useCustomers.js`'s own precedent) it
  fetches every visible active customer's contracts in parallel and derives real counts.
- `CustomersRecentWidget` — last few customers created. `listCustomers` already sorts by
  `createdAt` descending server-side, so no client-side re-sort is needed.

**Widgets built (operational glance metrics — Attendance/Leave/Tickets/AMC/Payments/Payroll,
§7.21):** none of these six modules has a real frontend page yet (still routing-skeleton
placeholders) — that's fine, these are glance-only summaries reusing each module's existing,
already-tested backend list endpoint, not a substitute for that module's eventual full CRUD
page. A "view all" link, where included, points at the existing placeholder route.
- `AttendancePresentTodayWidget` — count of employees `present`/`half_day` **today**.
  Admin/manager only (not shown to employee/sales_associate — a manager/admin-level glance
  metric by design, not a permission gap). `GET /attendance/team` takes a `month`, not a single
  day, so this fetches the current month via `getTeamAttendance` — the exact call
  `TeamAttendanceView` already makes — and filters client-side to today's date, the same
  precedent `LeadsHotWidget` already set for a filter the backend doesn't expose.
- `LeavePendingRequestsWidget` — count of leave requests awaiting approval. Originally
  admin-only (§5: "manager can view but not approve"); manager now holds `leave.approve` by
  default too (§7.5c, 2026-07-31 — see the dated Leave write-up above), so the widget's scope is
  now picked from whichever view-tier grant is actually held (`view_all` → `"all"`, `view_team` →
  `"team"`) rather than hard-coded to `listLeave("all")`, which would have 403'd for a manager.
  Reuses `useUserDirectory` (the same shared hook Leads' owner filter already uses) to resolve
  each pending request's employee name, and now also shows each request's Reason as a second line
  — no new backend endpoint.
- `TicketsOpenWidget` — total open tickets + open-and-unassigned, admin/manager per
  `tickets.view_all`. Reuses `listTickets("all")`, deriving both counts client-side (`GET
  /tickets` has no status/assignment aggregation of its own).
- `AmcRenewalsDueWidget` — count of AMC records renewing within 30 days. Reuses `listAmc()`
  with no filter params — `amc.service.js#listAMC` already scopes server-side by the caller
  (admin all, manager "own team", sales_associate "own") exactly per §5's `amc.view` pattern;
  the 30-day window is derived client-side. **Not a candidate for sales_associate**, even
  though they hold `amc.view` "own" by default — this widget is grouped with the other five
  admin/manager-only operational widgets by explicit design, not by what the data-scoping alone
  would allow.
- `PaymentsThisMonthWidget` — sum of payment amounts recorded in the current calendar month,
  **admin-only** (§5: `payments.view`/`create` are "–" for every other role, no ownership
  scoping exists at all for this module). Reuses `listPayments()` (takes no params) and sums
  client-side over the current month.
- `PayrollStatusWidget` — whether payroll has been run for the current month, and if so how
  many employees were processed, **admin-only** (Payroll has no `team` tier at all — Manager
  gets no grant whatsoever, unlike every other workforce module). Reuses
  `listPayroll({ scope: "all", month })`; both "has it run" and "how many" are derived from
  that response's length, not a new backend endpoint.

New minimal `api/*Api.js` files were added for the four modules with no frontend module folder
yet (`ticket`, `amc`, `payment`, `payroll`) — just the one `list*` function each widget needs,
matching the established one-function-per-endpoint convention; more functions belong there once
each module's own real frontend task is built. `attendance`/`leave` already had `api/` files
(their own frontend modules exist), reused as-is.

**Adding a future module's widget (Payroll's own payslip view, an Employee-facing "my hours this
month," ...) later:**
1. Write the widget component under `widgets/` — self-contained, reuses that module's existing
   scoped API function (or a minimal new `api/*Api.js` wrapper if that module has no frontend
   module yet), uses `WidgetCard` for loading/error/empty, gates itself internally with
   `usePermission`.
2. Import it in `dashboardConfig.js`.
3. Add it to whichever role arrays should see it as a candidate.

No other file needs to change — `DashboardPage.jsx` just renders whatever
`getDashboardWidgetsForRole` returns for the current user's role.

**Testing:** each widget has its own test file (mocked API data renders correctly, empty state,
inline error instead of a crash on a rejected mock, permission-gating hiding the widget for a
mocked user lacking the specific grant even when their role's config would normally include
it). `DashboardPage.test.jsx` covers the composition layer: the right widget set per mocked
session role (including manager's narrower 3-of-6 operational set), the empty-candidate-list
message for a role with none, permission-gating hiding a widget even when the role's config
would normally include it (a mocked user with an empty `permissions` object), and one widget's
mocked API rejection not affecting any other widget on the same page.

---

### Reports & Analytics module (`src/modules/reports/`, §7.23)

`/reports` — the app's first real analytics feature, replacing the `PlaceholderPage` that sat
there before, and distinct from the pre-existing raw export dispatcher (`POST
/reports/generate`, `services/reportApi.js`/`components/ReportDownloadButton.jsx`), which now
has a proper UI home on this same page instead of no UI at all.

**`POST /reports/generate` streams the file directly now, not a `{ downloadUrl }`
(2026-08-04).** The backend dispatcher used to upload the generated file to Cloudinary and
return a hosted URL; it now streams the raw file as the HTTP response body instead (see
`backend/README.md`'s Reports section for why). `reportApi.js#generateReport` sets
`responseType: "blob"` on the axios call so the binary body isn't misparsed as JSON, and the old
`triggerFileDownload(url, filename)` (which opened an already-hosted URL) was replaced with
`triggerBlobDownload(blob, filename)` — the standard object-URL → hidden `<a download>` click →
`revokeObjectURL` pattern, the same one `LeadsListPage.jsx#handleExport` already used for its own
blob export. `ReportDownloadButton.jsx` is the one place that calls both, so every module that
renders it (Leads, Customers, Attendance, Leave, Payroll, Transport — via this shared component
and/or `ExportForm.jsx`) picked up the new direct-download behavior automatically, with no
per-module changes needed.

**New dependency: `@ant-design/charts`** — chosen specifically because it renders through the
app's existing AntD `ConfigProvider`/brand theme (`App.jsx`'s `BRAND_THEME`, navy
`colorPrimary`) automatically, verified by checking its charts pick up that navy seed with zero
extra wiring, unlike a theme-agnostic charting library that would need its own separate color
config kept in sync by hand. This is the app's first chart/data-visualization library and first
chart of any kind — there was no precedent to follow, so the choices below are this task's own.

**Structure, mirroring the Dashboard widget catalog's own "self-contained component +
composition layer" split:**
1. **`api/analyticsApi.js`** — one function per new backend endpoint (11), matching the
   established one-function-per-endpoint convention.
2. **`hooks/useAnalyticsQuery.js`** — the same fetch/loading/error shape as `usePayments.js`,
   generalized: any endpoint function + params in, `{data, isLoading, error, refetch}` out. Each
   chart section calls this independently, so one section's fetch failing only ever sets that
   section's own `error` — it can never affect any other section on the page (same isolation
   principle `WidgetCard`/the Dashboard widgets already established).
3. **`hooks/useAnalyticsDateRange.js` + `utils/analyticsDateFilters.js` + `components/
   DateRangeFilter.jsx`** — one shared date-range control (This Month/Last 3 Months/This
   Financial Year/Custom Range) driving every trend-based chart (Leads Conversion, Customer
   Growth, Payments Trend, Attendance Trend, Payroll Cost Trend). "This Financial Year" (April
   1–March 31) reuses the exact computation `payment/utils/paymentDateFilters.js` already
   established for the Payments page (§7.22) — a small second copy in its own file, not a
   generalized shared utility, since the two option lists genuinely differ (Payments also offers
   Today/Yesterday/All Time; this page doesn't) and there's no third caller yet to justify
   extracting one.
4. **`components/ChartSectionCard.jsx`** — the same loading/error/empty-state shell as the
   Dashboard's `WidgetCard`, sized for a full chart instead of a glance-summary card.
5. **One component per chart/list** — each independently fetches via `useAnalyticsQuery`,
   transforms the response into the shape its chart needs (e.g. mapping raw enum values through
   each module's own existing label maps — `LEAD_STATUS_LABELS`, `CLIENT_TYPE_LABELS`,
   `CONTRACT_TYPE_LABELS` — rather than a new hardcoded label set), and renders through
   `ChartSectionCard`.
6. **`components/ReportsPageContent.jsx`** — the composition layer: reads the current user's
   permissions, decides which sections/cards to render, and owns the one shared
   `useAnalyticsDateRange` instance passed down to every trend chart.

**Chart-per-section mapping (`@ant-design/charts`):**
- **Leads** — pipeline (`Column`, not `Funnel`: Lead status isn't a strictly narrowing
  pipeline — a lead can sit in any status independent of how many came before it, and "lost"
  isn't a sub-stage of "won" — so a bar-per-status count reads more honestly than a Funnel
  implies), conversion trend (`Line`, `conversionRate` %), by source (`Pie`), by client type
  (`Column` — deliberately not a second `Pie` right next to the by-source one, which would read
  as visually redundant for a different axis).
- **Customers** — growth (`Area`, new customers per month), status split (`Pie` with
  `innerRadius={0.6}` as a donut), contract value by type (`Column`, summed `Contract.amount`).
- **Financial** — payments trend (`Line`), upcoming AMC renewals (`AmcRenewalsUpcomingList` — a
  plain AntD `List`, not a chart, per this task's own spec — with a day-window `Select`
  defaulting to 30).
- **Workforce** — attendance rate trend (`Line`), payroll cost trend (`Column`, summed
  `Payroll.netAmount`).

**Permission-gating** reuses the existing `PermissionGate` component — evaluated against
`dashboardConfig.js`'s role→widget-catalog pattern first and rejected for this page: that
pattern fits composing many independent pluggable dashboard widgets, not gating sections
*within* one page. Leads/Customers sections are each wrapped in a single `PermissionGate`
(`leads.view`/`customers.view` — every chart in that section shares the same grant). Financial
and Workforce instead check each card's own permission independently via `usePermission`
(`payments.view` vs. `amc.view`; `attendance.view_team || view_all` vs. `payroll.run`, the same
grant `PayrollStatusWidget` already gates on) and only render the section heading at all if at
least one card would be visible — those two headings each bundle two genuinely different
permissions that don't always travel together for a given role (e.g. a sales_associate can hold
`amc.view` "own" without `payments.view`, which has no non-admin tier at all).

**`ExportForm`** — the proper UI home for the pre-existing `POST /reports/generate` dispatcher:
a module Select + per-module filter inputs (attendance/transport: a date `RangePicker`;
leave/payroll: a scope Select; leads/customers: a status Select) + the existing
`ReportDownloadButton` for the actual format-picker + download, reusing that component's flow
rather than reimplementing it. The module list is filtered to whichever modules the current
user actually holds view access to, mirroring `report.service.js#MODULE_HANDLERS[module]
.canAccess` exactly (`attendance`: `view_team`/`view_all`; `transport`: `travelLogs.view_team`/
`view_all`; `leave`: any of `view`/`view_team`/`view_all`; `payroll`: `view`; `leads`/
`customers`: `view`) — so it never offers an option guaranteed to 403 on click; if none apply,
an `Empty` state renders instead of a broken form.

**Testing:** jsdom has no `HTMLCanvasElement.getContext`/`ResizeObserver` support — verified
directly: `@ant-design/charts` throws `"Not implemented: HTMLCanvasElement.prototype
.getContext"` trying to render for real in a test environment. `@ant-design/charts` is
therefore mocked to a plain stub (`Column`/`Line`/`Pie`/`Area` each rendering their `data` prop
as JSON text) in `analyticsCharts.test.jsx` (16 tests covering all 11 real chart/list
components' own data-fetch/transform/empty/loading/error behavior). A separate
`ReportsPageContent.test.jsx` (5 tests) instead mocks each *section component itself*, isolating
permission-gating and shared-date-range-propagation tests from chart-rendering concerns
entirely — the same "test composition separately from leaf widgets" split
`DashboardPage.test.jsx` already established. `ExportForm.test.jsx` (6 tests) covers the
module-list permission filtering, per-module filter payloads, and the dispatcher call → blob
response → `triggerBlobDownload` handoff (mocking `services/reportApi.js`, the same pattern
`ReportDownloadButton.test.jsx` already uses).

**Known deviations:** none from this task's own stated scope. Live-browser (CDP screenshot)
verification, the technique used for prior frontend tasks this session, was not available in
this environment — verification here rests on the test suites and a successful `npm run build`.

### Team Management module (`src/modules/team/`, §7.24, 2026-07-30)

`/settings/teams` — a new tab on `SettingsPage` alongside User Management/Permissions (same
tab-not-route pattern, `PermissionGate`d on `can(user, "teams", "manage")`, admin only).

- **`TeamManagementPage.jsx`** — list (name/type/head/derived member count/status), "Create
  Team" button, wires `TeamFormModal` + `TeamMembersModal`. `useUserDirectory` is fetched once
  here and passed down to both modals rather than each fetching its own copy.
- **`TeamFormModal.jsx`** — create/edit; head picker (`headManagerId`) filtered client-side to
  `role === "manager" || "admin"` from the same lightweight lookup every other "assign to"
  picker in this app already uses. **`type` field reworked 2026-07-31 (§7.30)** from a free-text
  `Input` to a `Select` populated from the new `useTeamTypes` hook (`GET /team-types`) — the
  direct mirror of how the Lead form's Source field already consumes `useLeadSources`, since
  `Team.type` is now validated server-side against that same admin-managed list. Filtered to
  `isActive` types only, **except** an existing team's own type value stays in the option list
  (labeled `"{name} (inactive)"`) even if it's since been deactivated — otherwise opening the
  edit form for a legacy team would silently blank out its type the moment the modal opens,
  purely because that type is no longer offered for *new* teams.
- **`TeamMembersModal.jsx`** — member list is always re-fetched fresh from `GET /teams/:id/
  members` on open, never derived/cached client-side (mirrors the backend's own "always live,
  never stored" design, see backend/README.md's Teams section). The add-picker is filtered to
  `employee`/`sales_associate`, but deliberately does **not** cross-check every other team's
  membership to grey out someone already on a different team — `GET /users/dropdown` doesn't
  return `managerId`, and fetching every team's membership just to grey out one dropdown option
  wasn't judged worth the extra requests for an admin-only, low-frequency action. A `Popconfirm`
  names the real consequence ("moves them here, doesn't add to both") before every add instead.
- Every new icon-only action button (manage members/edit/delete/remove-member) carries an
  explicit `title`/`aria-label` — a bare `Tooltip` only contributes `aria-describedby`, not an
  accessible name, the same gap already fixed for the Leads quick-action icons.
- **Testing:** `TeamManagementPage.test.jsx` (5 tests) — list rendering, create-modal open,
  edit-modal pre-fill, delete, and the full add-member flow (opens `TeamMembersModal`, picks a
  user via the `Select`, confirms via `Popconfirm`, asserts `addTeamMember` is called with the
  right ids).
- **Verification:** every flow (create/edit/add member/remove member/delete) was also driven
  live through a real browser session against the dev servers, not just the unit tests above —
  including creating a throwaway test employee first, since the dev database had no employee/
  sales_associate accounts to add to a team until then.
- **`useTeamTypes.js` (`src/modules/team/hooks/`, added 2026-07-31, §7.30)** — a structural
  mirror of `useLeadSources.js`: fetches `GET /team-types` once per mount, no refetch exposed
  (nothing in this app's frontend edits team types — see below for why no management UI exists).
  4 new tests in `TeamManagementPage.test.jsx` (create form's Type dropdown populated from the
  real list, a deactivated type excluded from it, an existing team's now-inactive type still
  shown in the edit form labeled `"(inactive)"`, and selecting a type submits its name in the
  create payload) — 17 total in that file now.
- **No Team Types admin management screen was built** — per this task's own explicit
  instruction not to build more UI for Team Types than the equivalent LeadSource feature has,
  and LeadSource has none (it's only ever consumed as a dropdown, never managed from a screen).
  The backend's `POST`/`PATCH /team-types` endpoints exist and are tested (see
  `backend/README.md`), but nothing in this frontend calls them yet.

### User/Team Management filters and delete-guards (§7.28, 2026-07-30)

Extends both existing modules — no rebuild of either.

- **`UserManagementPage.jsx` filter controls** — Role, Department (Team), and Active/Inactive
  `Select`s above the table, all wired straight to `useUsers(filters)` (already supported
  arbitrary query params passed through to `GET /users`, no hook changes needed). Department
  resolves to the new `teamId` query param.
- **Deactivate error surfacing** — `handleDeactivate` now wraps the API call in a try/catch and
  shows the backend's error message verbatim via `message.error(error.response?.data?.message ||
  ...)`, the same pattern already established for Add Customer's own unhandled-rejection fix —
  so the team-head guard's exact message (naming the team(s) to reassign) reaches the admin,
  not a generic failure toast.
- **`TeamManagementPage.jsx` filter controls** — Type and Active/Inactive `Select`s. `useTeams`
  gained an optional `filters` param (`type`/`isActive`) — every existing caller that wants the
  full unfiltered list (the Department picker in User Management/the New User form) keeps
  working unchanged by simply omitting it. The Type filter's own option list is deliberately
  derived from a **second, always-unfiltered** `useTeams()` call, not the (possibly filtered)
  main list — otherwise selecting "Sales" would make every other type disappear from the Type
  dropdown itself as soon as it was applied.
- **Delete confirmation member count** — the `Popconfirm`'s `description` now shows "This team
  has N member(s). Deleting it will not remove them, but they'll lose this team grouping.
  Continue?" (or "no members" for an empty team) using `team.memberCount`, which `GET /teams`
  already returns on every row — no new fetch, no new endpoint.
- **Testing:** 4 new tests in `UserManagementPage.test.jsx` (team-head rejection message shown
  verbatim; role/department/active filters each refetch correctly; combined filters use AND
  logic) and 5 new tests in `TeamManagementPage.test.jsx` (type/active filters refetch
  correctly; delete confirmation shows the accurate member count, including the zero-member
  case).
- **Verified live:** created a real team headed by an existing manager, confirmed the
  deactivate attempt on that manager was rejected (`400` network response, row stayed Active)
  and the delete confirmation showed the correct live member count.

### New User form rework (2026-07-30)

Scoped to **create mode only** — `UserFormModal.jsx`'s Edit mode is unchanged (still the full
`USER_ROLES` list, single-column layout, standalone Manager dropdown), since the task asked to
rework the "New User" form specifically and an admin still needs to view/edit existing
`sales_associate`/`customer` accounts without being blocked by a narrower create-only role list.

- **Role dropdown, create mode only:** exactly two options, `Manager` and `Executive`.
  "Executive" is a **display label only** for the existing `employee` role value — no schema/
  enum change, mirrors the already-resolved Executive=Employee decision (`user.model.js`'s own
  comment, `.context/final-plan.md` §11.1). This label mapping is local to this one dropdown
  (a small `CREATE_ROLE_OPTIONS` constant in `UserFormModal.jsx`) — the shared
  `USER_ROLE_LABELS` constant still says "Employee" everywhere else (e.g. the roster table's
  Role column), deliberately not touched.
  - **"Customer" removed entirely** — customer accounts are only ever created via the existing
    self-signup (email-domain-match) flow, never through internal User Management.
  - **Assumption, stated explicitly per the task's own request:** new `sales_associate`-role
    accounts can no longer be created via this form going forward. Existing `sales_associate`
    accounts are completely unaffected (Edit mode still shows/allows that role).
- **"Department" field** — a `Select` of existing Teams (`useTeams`, `src/modules/team/hooks/
  useTeams.js`, the same hook `TeamManagementPage` already uses), labeled `"{name} ({type})"`
  when the team has a type, just `"{name}"` otherwise.
  - **Design decision:** selecting a Department automatically sets the new user's `managerId`
    to that Team's `headManagerId` (`team.model.js`'s existing relationship — no new field) via
    a hidden `Form.Item`. There is **no separate standalone "Manager" dropdown** in create mode
    — Department alone determines it, avoiding two fields that could ever conflict. If a fully
    independent Manager field alongside Department was actually wanted instead, this resolves
    it differently — flag if so.
  - The UI-only `departmentTeamId` form field itself is stripped out before the payload is sent
    to `POST /auth/register` — only the derived `managerId` is submitted.
- **Layout** — `Row`/`Col` (`gutter={16}`, `span={12}`), the same compact-form pattern
  `ContractFormModal.jsx` already established: Row 1 Name+Email, Row 2 Phone+Password, Row 3
  Role+Department, Row 4 Salary alone, full width. "Salary" maps to the existing `baseSalary`
  field — confirmed no duplicate field was introduced.
- **Verified live:** created a real team + a real user selecting that team as Department, then
  confirmed via a direct DB read that the created user's `managerId` exactly matches the
  selected team's `headManagerId`; both cleaned up afterward.
- **Testing:** 4 new tests (`UserManagementPage.test.jsx`) — the 4-row layout renders with no
  standalone Manager field, the Role dropdown offers only Manager/Executive (not Sales
  Associate/Customer/the literal word "Employee"), the Department dropdown lists real teams
  with name+type, and selecting a Department produces the correct `managerId` in the submitted
  payload (with `departmentTeamId` itself absent from it).

### Sidebar count badges (§7.26, 2026-07-30; reworked to be notification-driven §7.29, 2026-07-31)

`MainLayout.jsx`'s Leads and Leave nav items each get a small AntD `Badge` next to their label,
showing a live count — the first badges on any sidebar item; establishes the pattern for
Tickets/AMC or any future module's badge.

**Reworked 2026-07-31 (§7.29) to reuse the existing Notification module entirely, replacing the
original record-count approach** — each badge is now just the caller's own unread-notification
count, filtered by type, via the same `GET /notifications` endpoint the bell dropdown already
uses (`?unreadOnly=true&type=...`), not a parallel `GET /leads/count`/`GET /leave/pending-count`
tracking system. The old endpoints and this hook's original shape are gone, not kept alongside.

- **Leads badge** — unread count where `type` is `lead_created` (the new admin/owner broadcast,
  see `backend/README.md`'s Notifications section) **or** `lead_assigned` (the pre-existing
  personal "you were assigned this" ping) — either one means "there's a lead you haven't looked
  at yet." Gated by `canViewLeads` the same as before (the fetch is skipped entirely, not just
  the badge, when the caller can't view Leads at all).
- **Leave badge** — unread count where `type` is `leave_requested`/`leave_approved`/
  `leave_declined`. **No longer admin-only** — a deliberate change from the original §7.26
  design, made because this badge is now naturally self-scoped by the Notification module
  itself: `leave_requested` only ever notifies admins (a request to review), while
  `leave_approved`/`leave_declined` only ever notify the employee whose request was decided — so
  the same badge is meaningfully non-zero for an admin (pending requests) or an employee (their
  own outcome), with no role gate needed to make that correct.
- **Marks-as-read on nav click** — clicking either nav item (a real navigation, not just seeing
  the badge) fires `PATCH /notifications/read-all?type=...` scoped to that badge's own types
  (`clearLeadsBadge`/`clearLeaveBadge` in the hook), zeroing the local count immediately rather
  than waiting for the next poll tick. Clicking Leads never touches an unread Leave notification
  and vice versa — each is its own type-scoped call, not the bell's unscoped "Mark all as read."
- **`useSidebarBadgeCounts`** (`src/hooks/`) — the shared hook backing both badges, now wrapping
  `listNotificationsByType`/`markNotificationsReadByType` (`modules/notification/api/
  notificationApi.js`) instead of the old per-module count APIs. Exports
  `LEADS_NOTIFICATION_TYPES`/`LEAVE_NOTIFICATION_TYPES` so `MainLayout.jsx` and this hook's own
  mark-read calls always agree on exactly which types each badge means — one list, not two that
  could drift. Still polls every 60 seconds (unchanged cadence), each count fetched and caught
  independently so one failing never blocks or breaks the other.
- **5px horizontal badge margin** (`mx-1.25`, the closest Tailwind scale value to 5px) applied
  consistently to all three badge instances — the bell icon (`NotificationBell.jsx`) and both
  sidebar badges — for even spacing; previously inconsistent across the three.
- **Attendance badge — explicitly deferred, not built.** This task's own notification-reuse
  pattern (unread-count-by-type + type-scoped mark-read-on-nav-click) would extend cleanly to an
  Attendance badge if one's ever wanted, but nothing in Attendance currently creates a
  notification at all (no `NOTIFICATION_TYPES` value, no `createNotification` call anywhere in
  `attendance.service.js`) — that's new backend scope this task didn't ask for, so it's called
  out here as a deliberate gap rather than silently expanded into.
- **Testing:** `useSidebarBadgeCounts.test.js` (8 tests) — correct type-filtered fetch calls for
  both badges, Leads fetch gated by `canViewLeads`, Leave fetch **not** gated by role, refetch on
  the poll interval, a failed poll not clobbering the last-known count, and both
  `clearLeadsBadge`/`clearLeaveBadge` calling the right scoped mark-read and zeroing only their
  own count. `MainLayout.test.jsx`'s badge describe block rewritten to match (7 tests) — correct
  type-filtered counts on each nav item, Leads badge hides at 0, Leave badge now shown for a
  non-admin too, and clicking either nav item fires the correctly-scoped mark-read without
  affecting the other badge.

### Permissions Management module (`src/modules/permission/`, §7.27, 2026-07-30)

`/settings/permissions` — the first real frontend for the `permission` module (backend
`PERMISSION_REGISTRY`/`RolePermissionTemplate`/per-user overrides have existed and been tested
since §7.12; this closes the long-standing UI gap), replacing the `PlaceholderPage` that sat
there before. Admin-only, gated the same way as the other Settings tabs — a plain flat tab on
`SettingsPage`, visible only when `can(user, "permissions", "manage")`.

- **`PermissionMatrix.jsx`** — the one shared component both tabs below use. Fetches nothing
  itself (`registry` is passed down from the page, fetched once); renders a row per
  `PERMISSION_REGISTRY` module and a column per the union of every action that appears anywhere
  in the registry, but only draws a checkbox in a cell where that specific module+action pair
  is actually valid — every other cell is blank, not a disabled/unchecked checkbox, so an
  invalid combination is never visually confused with a real "off" grant. Keeps its own local
  editing state (reset whenever the `value` prop changes, i.e. switching role/user) — this is an
  explicit "Save" form, not autosave-on-every-click, so in-progress edits never silently apply.
  The `onSave` callback receives the current local permissions object; each tab wires it to its
  own endpoint (template PATCH vs. user-permissions PATCH), keeping the matrix itself endpoint-
  agnostic.
- **Role Defaults tab** (`RoleDefaultsTab.jsx`) — a role `Select`, a prominent warning `Alert`
  ("changes here only affect users created after this save"), a "Last updated by X on Y" line
  (resolved via the same `useUserDirectory` Map-lookup convention used everywhere else),
  and the matrix wired to `GET/PATCH /permissions/templates/:role`.
- **User Overrides tab** (`UserOverridesTab.jsx`) — a user picker and the matrix wired to
  `GET/PATCH /users/:id/permissions`, plus a "Reset to Role Default" button
  (`POST /users/:id/permissions/reset`) behind a `Popconfirm` that states the real consequence
  ("applies the role's CURRENT template... any custom overrides will be lost"). The user picker
  reuses `useUserDirectory` (`GET /users/dropdown`) with a client-side `showSearch` filter — this
  app's dominant "assign to" picker pattern (Team's head/member pickers, Lead's owner picker),
  not the debounced server-side search Payments' Customer picker uses. That heavier pattern
  exists there specifically because the Customer list can be large; the user roster is the same
  small, already-fully-fetched-elsewhere list every other picker in this app already uses without
  issue, so there's no reason to introduce a second search mechanism just for this one picker.
- **Testing:** `PermissionManagementPage.test.jsx` (5 tests) — matrix renders the correct
  rows/columns per registry (an action valid for one module but not another only gets a checkbox
  on the valid one), Role Defaults loads/saves a role's template correctly, User Overrides loads/
  saves a specific user's actual permissions correctly, and Reset-to-Role-Default calls the reset
  endpoint and reflects the update. Non-admin access is already covered by the existing
  `SettingsPage.test.jsx` tab-visibility tests (permissions.manage gates the tab itself) — no
  separate gating logic needed inside this module.

### User Management Action column rework (§7.28, 2026-07-30)

`UserManagementPage.jsx`'s Actions column, extended again (following the filters/delete-guards
work above) — icon-only lifecycle buttons plus a new guarded, permanent Delete.

- **Deactivate/Reactivate verified end-to-end first** — same network-tab rigor as the earlier
  Customer status-persistence investigation. Both already worked correctly: a live deactivate
  attempt on a team head returned a real `400` (the existing team-head guard firing correctly),
  and a deactivate/reactivate round-trip on a non-team-head user returned `200`, updated the row,
  and persisted through a hard refresh. Nothing here was actually broken — the column rework
  below is a pure UI change, not a bug fix.
- **Icon-only Deactivate/Reactivate** — reuses the exact icon+`Tooltip` pattern already
  established by `customer/components/CustomerStatusToggleButton.jsx` (`StopOutlined`/
  `CheckCircleOutlined`, `type="text"`, wrapped in a `Tooltip`, `aria-label` kept identical to
  the old visible-text version so existing `getByRole("button", { name: /Deactivate/ })`-style
  test queries still match unchanged). **The `Popconfirm` around Deactivate was later removed
  entirely (§7.31, 2026-07-31)** — see that section below for why (an async impact check has to
  run before any confirmation UI can even be decided).
- **Guarded hard-delete — a deliberate reversal of the earlier "no hard delete for Users"
  decision** (see `.context/final-plan.md` §6.1/§7.0 for the dated reasoning). New `DELETE
  /users/:id` (backend, admin only — see `backend/README.md`'s User Management section for the
  exact guard order and the new `DeletedUserAuditLog` collection). The Delete icon (`DeleteOutlined`,
  same icon-only+`Tooltip` treatment) only ever renders for an already-**Inactive** user — there is
  no way to reach it from an Active row at all, matching the backend's own first guard.
- **`DeleteUserModal.jsx`** — a dedicated modal, not a bare `Popconfirm`, mirroring
  `payment/components/DeletePaymentModal.jsx`'s exact pattern: a required `reason` field (client-
  side validated, so the backend's own reason-required guard is never actually hit from this UI
  in the normal case) and explicit warning copy — *"This permanently deletes {name}. Their name
  will no longer resolve in past records (leads, attendance, payments, etc.) — this cannot be
  undone."*
- **No cascade cleanup needed** — existing records referencing a deleted user's id (Lead owner,
  Attendance, Payment collector, etc.) already resolve an unknown id to `"—"` via the same
  Map-lookup-with-fallback convention used throughout this app (e.g. this same page's own
  `managerNameById`), so nothing elsewhere needed to change.
- **Testing:** 3 new tests in `UserManagementPage.test.jsx` — Delete icon only shows on an
  Inactive row, never an Active one; the modal blocks submission and shows the validation
  message until a reason is typed; a successful delete calls `deleteUser(id, reason)`, shows the
  success toast, and the row disappears from the list on the next `refetch()`. Existing
  Deactivate/Reactivate tests needed no changes — the preserved `aria-label` keeps them passing
  unchanged.
- **Verified live:** the full flow was driven through a real browser session against the dev
  servers — icon-only buttons render with no visible "Deactivate"/"Reactivate" text, the Delete
  icon appears only on the Inactive test row, submitting the modal empty shows the validation
  message, and submitting it with a reason returns a real `200` from `DELETE /users/:id`, removes
  the row, and the deletion survives a hard refresh.

### Deactivate reworked to guided reassignment (§7.31, 2026-07-31)

Reverses the §7.28 hard-block guard: clicking Deactivate no longer immediately shows a plain
confirm (or, for a team head, an immediate rejection) — it checks
`GET /users/:id/deactivation-impact` first and only then decides which UI to show.

- **`handleDeactivateClick`** (`UserManagementPage.jsx`) replaces the old `Popconfirm`-wrapped
  button entirely — an async check has to run before there's anything to confirm, which a
  `Popconfirm`'s open-on-click model can't express. Nothing to reassign → `modal.confirm(...)`
  (via `App.useApp()`, the same hook-based pattern `message` already needed — see §7.28's
  message-rendering fix) shows the exact same `"Deactivate {name}?"` text the `Popconfirm` used
  to, so the no-reassignment path looks and behaves identically to before. Something to
  reassign → `DeactivationReassignModal` instead.
- **`DeactivationReassignModal.jsx`** — one `Select` per led team (`"New head for \"{name}\" ({N}
  member(s))"`, filtered to `manager`/`admin`, excluding the person being deactivated themselves
  from their own replacement-head options) and, if they own active leads, one more `Select`
  (`"Reassign {N} active lead(s) to"`, filtered to `sales_associate`/`employee`/`manager`). Uses
  `useUserDirectory` for both pickers' option lists — the same shared, active-users-only lookup
  every other "assign to" picker in this app already uses. The Deactivate button inside this
  modal is blocked by AntD `Form`'s own required-field validation until every picker has a
  value — no separate "is everything filled in" boolean tracked by hand.
- **Failure keeps the modal open** — `handleReassignSubmit` calls `deactivateUser` directly
  (not through the plain-confirm path's `handleDeactivate`, which swallows its own errors and
  would otherwise close the modal even on failure) and only closes it on success, surfacing the
  backend's exact rejection message verbatim on failure — e.g. a race where something changed
  between the impact check and this submit.
- **Testing:** 6 new tests in `UserManagementPage.test.jsx` — impact checked first and the
  no-reassignment path deactivates directly with no modal shown; the modal opens instead when a
  team needs a new head; submission is blocked until the head is picked, then submits
  `{ reassignTeamsTo, reassignLeadsTo }` correctly; the lead-owner picker shows when active leads
  exist; both pickers show together when the person has both, each still independently required;
  the modal stays open and surfaces the exact error on a post-reassignment failure. The existing
  `useUserDirectory` mock in this test file had to become a `vi.fn()` (rather than a plain arrow
  function) so these new tests could override its return value with real, role-tagged users to
  pick from — every other existing test in the file is unaffected by that change (still gets the
  same empty-list default).
- **Verified live:** a real browser session against the dev servers — created a temporary
  employee and a temporary open lead so a real user ("Testing User," who already headed a real
  team) had both a team and an active lead needing reassignment, drove the full flow (modal
  opens naming both, submitting empty is blocked, filling in both pickers and submitting
  succeeds), then confirmed directly in the database that the team's `headManagerId` and the
  lead's `ownerId` both actually changed to the picked users and the person was deactivated —
  then restored the original state and removed the temporary data.

### User Detail Page (`src/pages/UserDetailPage.jsx`, §7.32, 2026-07-31)

New route `/settings/users/:id` (`ROUTE_PATHS.USER_DETAIL`) — the first dedicated detail view for
a single user, consolidating data scattered across Attendance, Leave, Teams, Leads, Payroll, and
Permissions onto one page. A user-management table row now navigates here on click (`onRow`/
`onCell` pattern from `LeadsTable.jsx`); the list's existing quick Edit modal is unchanged and
still works from the table directly — this page is an *additional* view, not a replacement.

Every section is its own `WidgetCard`-based card (reused cross-module from
`dashboard/widgets/WidgetCard.jsx`, same isolation contract as a Dashboard widget: one section's
fetch failing shows only that card's own inline error, never blanks the rest of the page) and is
permission-gated independently:

| Card | Component | Reuses |
|---|---|---|
| Header | `UserActionButtons.jsx` (new, extracted from the list's Actions column) | Same Edit/Reset Password/Deactivate/Reactivate/Delete icon+`Tooltip` buttons and `aria-label`s as `UserManagementPage.jsx` |
| Basic Info | `UserBasicInfoCard.jsx` | `getUser(id)` (new thin wrapper — the backend endpoint already existed). `baseSalary` intentionally omitted: `User.baseSalary` has `select: false` everywhere, so no endpoint currently returns a real value; asked the user, confirmed frontend-only for now, no backend change made |
| Attendance Summary | `UserAttendanceSummaryCard.jsx` | `getMyAttendance`/`getTeamAttendance` + `AttendanceSummaryStats`'s summary calc, scoped to one employee client-side (self-view calls `getMyAttendance` directly; viewing someone else fetches team-wide via `getTeamAttendance` and filters, since that endpoint has no `employeeId` param) |
| Leave | `UserLeaveCard.jsx` | `useLeaveBalance(user._id)` → `GET /leave/balance?employeeId=` |
| Team | `UserTeamCard.jsx` | `useTeams()` (fetched once at the page level and passed down, same as `UserManagementPage` already does — an infrequently-changing reference list); derives led-team vs. member-of-team client-side |
| Owned Leads (sales_associate/manager only) | `UserOwnedLeadsCard.jsx` | `listLeads({ owner: user._id })`, filtered client-side to exclude `["won", "lost"]` — `GET /leads/count` only supports one exact status, not a `$nin` |
| Permissions | `UserPermissionsCard.jsx` | `getPermissionRegistry` + `getUserPermissions` + `getRoleTemplate` fetched in parallel, diffed to a compact override summary (not the full matrix); "Manage overrides" links to `/settings/permissions?userId=` |
| Payroll History (admin-only) | `UserPayrollHistoryCard.jsx` | `listPayroll({ scope: "all" })`, filtered client-side by `employeeId` — `GET /payroll` has no `employeeId` filter at all |

**Shared lifecycle hook, not a second copy of `UserManagementPage`'s logic:**
`useUserLifecycleActions({ refetch, onDeleted })` (new hook) holds every create/edit/reset-
password/guarded-deactivate-with-reassignment/reactivate/guarded-hard-delete handler and its modal
state; `<UserLifecycleModals actions={...} userDirectory={...} />` (new component) renders the
four wired modals. `UserManagementPage.jsx` was refactored to use both instead of keeping its own
copy — this page and the list page now share one implementation.

**Permissions deep link:** `PermissionManagementPage.jsx` now reads `?userId=` via
`useSearchParams()` and pre-selects the "User Overrides" tab with that user, passed to
`UserOverridesTab` as `initialUserId` (a `useState` initializer, not `useEffect`-synced, so the
user can still pick someone else afterward without being yanked back).

**Two pre-existing bugs found and fixed while building this:**
- A raw `dayjs()` object passed straight to `getMyAttendance`/`getTeamAttendance` serializes to a
  full ISO string over axios, which the backend's month parser rejects with 400 — fixed by keeping
  both a `dayjs()` object (for `AttendanceSummaryStats`'s own dayjs-method calls) and a separately
  formatted `"YYYY-MM"` string (for the actual API calls), matching `CheckInOutWidget.jsx`'s
  existing convention.
- `useLeaveBalance` (`modules/leave/hooks/useLeaveBalance.js`) had no `.catch()` at all; a failure
  left `balance` stuck at `null` with no way to tell "loading" from "failed." Added `error` state;
  the hook now returns `{ balance, isLoading, error }` (its one other consumer,
  `LeaveBalanceCard.jsx`, is unaffected since it only destructures `{ balance, isLoading }`).

**Testing:** 12 new tests in `UserDetailPage.test.jsx` (per-section failure isolation, permission-
gating, deep-link href, guarded deactivate/delete flows), 2 new tests in
`UserManagementPage.test.jsx` (row-click navigation vs. action-button clicks not double-
navigating), 2 new tests in `PermissionManagementPage.test.jsx` (deep link pre-selects tab/user).
Full suite re-run clean (only the pre-existing flaky AntD-Select tests in untouched files);
`npm run build` succeeds. Live-verified in a real browser: deep link, full deactivate→reactivate
cycle, self-view section omissions.

---

### Attendance & Leave pass — tiles, tabs, columns, header check-in, 4 bug fixes (2026-08-05)

**Map tiles -> CARTO Positron.** `LeafletMapView.jsx` is the single place a `TileLayer` is defined
(Live map, History map, and the Attendance location modal all render through it), so the swap was
one component. OSM's default raster competes with this app's own semantic marker colors (red =
connectivity issue, orange = geofence issue); Positron's muted greyscale leaves those pins as the
only saturated thing on the map. Free and key-less, same as OSM, so nothing about deploy or config
changes. URL `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`, `subdomains="abcd"`,
attribution crediting both OpenStreetMap (the data) and CARTO (the styling) as CARTO's basemap
terms require. Live-verified: 18 tile requests, all 200, zero OSM requests.

**Attendance Own/Team tabs (`AttendancePage.jsx`).** `TeamAttendanceView` and its endpoint both
already worked, but nothing ever routed to it — this page only rendered `PersonalAttendanceView`
for non-admins, so team attendance was unreachable in the UI for a manager. Tabs are built exactly
the way `LeaveListPage` already builds its own (§7.5e): derived from the grants actually held, and
hidden entirely when there is only one real choice. A manager (`attendance.view_team`) now sees
Own/Team; a plain employee still sees just their own list with no tab UI, unchanged. Admin is
untouched — still routed straight to `AdminAttendanceView`.

**Team/Department column** on both the Admin Attendance table and the Admin Leave table. Both
derive it from exactly the two sources their own Team *filter* already uses (`useTeams()` plus each
employee's `managerId` from the full roster fetch), so the column and the filter can never disagree
about who is on which team, and neither needs an extra request. Falls back to an em dash for
someone in no team. In `AttendanceTimeline` the column only renders when the caller actually passes
the mapping, so the Personal view — which has no notion of other people's teams — is unaffected.

**Fixed-header Check-In button (`HeaderCheckInButton.jsx`).** Starting a shift no longer requires
navigating to `/attendance` first. Two states, never both: a compact "Check In" button, or — once
checked in — a live elapsed-time badge ticking every second, which replaces the button entirely and
opens the check-out flow when clicked. Not rendered at all for admin (exempt from attendance,
§7.4c, so it would be a guaranteed 403); gated in `MainLayout` too, so it isn't even mounted for
that role and fires no `GET /attendance/me`.

To avoid a second divergent copy of the camera + geolocation flow, that step was **extracted** from
`CheckInOutWidget` into `AttendanceCaptureFlow.jsx`, which both entry points now render — the widget
inline, the header in a modal. Because two independent `useMyAttendance` instances are now mounted
at once, `utils/attendanceEvents.js` adds a one-`Set` pub/sub: any check-in/out broadcasts, and
every mounted instance re-reads itself, so the header timer and the `/attendance` widget can never
disagree. It is deliberately not a store — there is no shared *state*, only a "re-read it" signal.

**Manager-scoped Team view.** `TeamManagementPage` now renders for the new read-only
`teams.view_team` tier as well as `teams.manage`, deciding for itself which it got: same table, same
filters, but no Create button, no Edit/Delete row actions, and `TeamMembersModal` in a new
`readOnly` mode (roster only, no add picker, no remove buttons). The backend scopes `GET /teams` to
the team the caller heads, so a manager simply sees their own row. Reused rather than forked into a
separate "manager teams page" so the table/filters have one implementation. See `backend/README.md`
for why membership editing was deliberately *not* extended to managers.

**Mark Absent / Mark Half Day on missing days.** The table only ever rendered real records, so a day
nobody checked in on had no row at all — there was nothing to hang a gap-filling action off.
`utils/missingAttendanceDays.js` synthesizes those rows, but **only when a single employee is
selected**: "which days are missing" is a per-person question, and generating it org-wide would add
employees x days rows to a table that otherwise shows real events only. Future dates are excluded
(an unstarted day isn't a gap); today is included (a shift that never started is a real absence).

Synthetic rows are merged into the **table only**, never into `AttendanceSummaryStats` — a day with
no record has no outcome, and counting it would silently inflate the stats the moment the filter was
applied. They render a "No record" tag, no timeline/location, and are not clickable (no photo to
show). The two actions appear on those rows and **only** those rows: a real record has no actions in
this column at all. Each opens a confirmation naming the date before submitting.

`date` on a synthetic row is a plain `YYYY-MM-DD` day key, not an ISO timestamp — `toISOString()`
converts local midnight to UTC and lands on the *previous* day for any timezone east of UTC, which
would have rendered and submitted every gap one day off. Caught by a unit test.

**Four bug fixes, each with the real root cause found by live reproduction rather than the reported
one:**

- **Attendance Employee filter blanked the name column.** Not a response-shape mismatch:
  `showEmployeeColumn={!selectedEmployeeId}` in `AdminAttendanceView`/`TeamAttendanceView`
  deliberately dropped the whole Employee column once a specific employee was picked, so filtered
  rows no longer identified who they belonged to. Now always shown in these org/team-wide views.
- **Leave Approve appeared to do nothing.** The endpoint works for both admin and manager. The
  fault was that `handleApprove`/`handleDecline`/`handleMarkAbsence`/`handleDelete` had **no error
  handling at all** and there is no global axios error toast, so any rejection was swallowed
  entirely — the Popconfirm closed and nothing happened. Two real 409 triggers reproduced:
  approving a paid request longer than 1 day, and approving one when that month's single paid leave
  is already used. All four handlers now surface the backend's own message.
- **Manager couldn't delete their own team's leave.** Backend delete works for a manager on a direct
  report. The action buttons rendered from a blanket `usePermission("leave", "delete")` check with
  no per-row scope test, so on a manager's **Own** tab — where every row is their *own* request —
  all four actions hit `ensureCanActOnLeave`, which requires `employee.managerId === caller`, false
  for one's own record, and 403'd silently. A `canActOnRow` gate now mirrors the backend rule.
- **Team edit failed on save** — see `backend/README.md`; the cause was server-side.

Tests: 4 new in `LeaveListPage.test.jsx` (all four verified to fail without the fix), 5 in
`HeaderCheckInButton.test.jsx`, 7 in `missingAttendanceDays.test.js`, 4 in
`AdminAttendanceView.test.jsx` (gap rows, actions only on gaps, submit payload), 3 in
`AttendancePage.test.jsx` (tabs), 3 in `TeamManagementPage.test.jsx` (read-only tier), plus Team
column coverage on both tables. `npm run build` succeeds. Live-verified in a real browser: Positron
tiles, Team columns on both tables, gap rows with actions on exactly the missing days, and a Team
edit save now returning 200 where it previously returned 400.

---

### Customer Detail restructure + wider Lead panel (2026-08-05)

**Section order.** Site & Installation Details moved above Billing Details. For a solar install
that's the identifying "what is this job" information, so it now reads before the commercial
terms rather than after them — a deliberate divergence from
`leads-customer-functional-spec.md`'s original ordering.

**Invoice History removed entirely** — `CustomerInvoicePlaceholder.jsx` deleted, not hidden.
Invoicing is descoped: `Invoice` is a backend placeholder model with no service or controller,
and `GET /customers/:id/invoices`/`/ledger` were never built, so the section could never show
real data. There was no accompanying data fetch to remove — the placeholder was static and
`useCustomerDetail` never requested invoices. `customerApi.js`'s note about the missing
endpoints now points at this README instead of the deleted component.

**Contacts and Contracts side by side.** Both are short list sections that each wasted a
full-page-width row when stacked. `Row gutter={16}` + `Col xs={24} lg={12}`, so they pair up
only from `lg` (992px) and stack again below it — a two-column split on a phone or tablet would
squeeze both list rows (name + tags + action buttons) past readability, and the point is to
reclaim vertical space where there's width to spare, not to force two columns everywhere. No
fixed widths, so nothing can overflow horizontally. Verified at 390px (cards stack, distinct
top offsets) and 1600px (identical top offsets, i.e. genuinely side by side).

**Add/Edit Contact form is two-column.** Every field used to be stacked full-width, making a
five-field form taller than it needed to be. Paired by what belongs together — identity
(Name + Designation), then reachability (Email + Phone) — with the Primary-contact checkbox
keeping its own full-width row, since pairing a lone toggle against a text input would read as
though the two were related. Uses the same `Row gutter={16}` / `Col span={12}` pattern as
`CustomerEditModal`/`LeadFormModal` rather than new spacing values. One component serves both
Add and Edit, so Edit Contact gets the identical layout.

**Activity Log now shows who did it.** `CustomerActivity.performedBy` has always been stored
(required, `ref: "User"`) — it was simply never rendered. `customer.service.js#listActivity`
returns it UNPOPULATED, so the API hands over a raw ObjectId; the name is resolved client-side
against `useUserDirectory()` (`GET /users/dropdown` — authenticate-only, already fetched by
pickers across the app) rather than adding a `.populate()` server-side, keeping this change
frontend-only as scoped. The renderer accepts either a raw id or a populated object, so it
won't need revisiting if that backend read ever starts populating.

Known limitation, deliberately not papered over: that dropdown lists `isActive: true` users
only, so an entry performed by a since-deactivated or deleted user renders "—" rather than
blank. Same for any entry with no `performedBy` at all. If attributing actions to departed
staff matters, the fix is a one-line `.populate("performedBy", "name")` on the backend read.

**Lead detail panel widened, 640 -> `min(920px, 100vw)`.** Site Details' two-column
`Descriptions` was cramped at 640 — long values (site address, "Estimated Units Consumed")
wrapped over several lines against their labels. Widening the PANEL rather than that one
section's columns keeps every section in step: Contact Info, Site Details and Call History all
gain the same room, and none ends up visually out of step with the others. `min()` rather than a
bare number so the panel is exactly viewport-width on mobile — a fixed 920 would overflow a
phone. Verified: 920px at a 1600px viewport, 390px at a 390px viewport (unchanged full-width
behavior there).

Tests: `CustomerDetailPage.test.jsx` gains an explicit "no Invoice History section" test (also
asserting the Create Invoice/View Ledger buttons are gone) and a section-order test; its
"renders every section" test no longer asserts the removed section. Customers + Leads suites
otherwise unchanged and passing; `npm run build` succeeds.

Pre-existing and NOT introduced here (measured identical with these changes stashed): the
Customer Detail page horizontally overflows a 390px viewport by ~43px. The offenders are
`CustomerHeaderSection`'s Edit/Deactivate/Delete button row and the two-column `Descriptions`
tables in the Site/Billing cards, neither of which this task edited — only reordered.

---

### AMC moved onto the Customer Detail page; standalone `/amc` retired (2026-08-05)

AMC only ever made sense per-customer, and a separate top-level page meant leaving the customer
you were looking at to check their contract. `src/pages/AmcPage.jsx` is deleted, along with the
`/amc` route and its left-nav item.

**`src/modules/amc/api/amcApi.js` deliberately SURVIVED that removal** — the Dashboard's
`AmcRenewalsDueWidget` and the Reports module still read from it. Deleting the whole module
directory, as the task's wording suggested, would have broken both. It gained
`listAmcForCustomer(customerId)` and `renewAmc(id, payload)`.

**One card per CURRENT term, not per record.** Renewals chain via `previousAmcId`, so a customer
renewed three times has four records but should still read as ONE ongoing AMC. `buildChains`
walks the links and renders only each chain's head; past terms fold into an expandable
"Renewed N×" line instead of competing for attention as top-level cards. A chain's head is the
record nothing else points at. Records whose predecessor isn't in the fetched set (possible if
scoping hid it) still head their own chain rather than vanishing, and a cyclic link is guarded
against rather than hanging the page.

**Three visually distinct card states, deliberately not two.** "Expiring soon" is an amber call
to act (still live, running out); "expired" is a neutral statement of fact about a term that
already ended; "active" is plain. Rendering the first two alike would bury the one that needs
attention. `isExpiringSoon` comes straight from the API — the 30-day threshold is defined once
server-side and deliberately not recomputed here.

**Four per row** via `xl={6}`, stepping down through `lg`/`sm` so cards stay readable rather than
shrinking to four cramped columns on a tablet.

**Renew** reuses the existing `amc.edit` grant through `PermissionGate` — no new permission key,
since renewing is a management action on the record exactly like editing one. It opens a modal
pre-filled with precisely the defaults the server would derive on its own, so confirming without
edits produces the same record as posting an empty body, and every field stays editable first.
Dates are sent as plain `YYYY-MM-DD` via dayjs's local formatter — never `toISOString()` on a
local-midnight value, which lands a day early at UTC+5:30 (the bug caught in the previous batch);
a test asserts the payload contains no `T`.

The section fetches its own records rather than being threaded through `useCustomerDetail`, so a
customer with no AMC costs nothing on the rest of the page and an AMC failure can't break the
whole detail view. A failed fetch renders a distinct error state, not an empty list.

**Follow-up needed, not done here:** `AmcRenewalsDueWidget`'s "View all AMC records →" link still
points at the now-removed `/amc` route. That file has uncommitted work from a concurrent session,
so fixing it would have meant either committing someone else's WIP or leaving a stray edit
behind. `ROUTE_PATHS.AMC` was kept so the link resolves to a string rather than `undefined`; it
should be repointed at `/customers`.

---

### Attendance absorbs Leave; tabs, date presets, timeline fixes (2026-08-05)

**`/leave` is gone.** Its route, nav item and `LeavePage.jsx` are deleted; everything it did now
lives in a tab on `/attendance`. Attendance and leave were always the same question — was this
person at work, and if not, why — split across two pages. **The backend is untouched: this is a
relocation, not a permission change.** Managers keep the exact approve / decline /
mark-unapproved-absence / delete parity built in §7.5c/§7.5d.

**Tabs are role-shaped, not permission-derived**, matching how each role uses the page:

| Role | Tabs |
|---|---|
| Employee | My Attendance · Apply Leave · My Leave |
| Manager | My Attendance · Team Attendance · Leave |
| Admin | Attendance · Leave Requests · Leave History |

The manager's existing Own/Team split stays INSIDE the Leave tab as a sub-filter rather than
becoming two more top-level tabs, so the top level stays about "whose attendance" and the
sub-filter about "whose leave". A manager without `attendance.view_team` falls back to the
employee set. `LeaveListPage.jsx` became `LeaveSection.jsx` — a reusable sub-component taking a
`view` prop (`pending` / `history` / `all`) — via `git mv`, so its history and every carefully
built behaviour move with it rather than being retyped.

**Everything the old page had is preserved**, verified by its own suite moving across intact: the
Team/Department column, the fetch-error `Alert` (a real failure must never look like "no
requests"), the Leave Balance card, the per-row `canActOnRow` scope gate, and the icon + Tooltip +
`aria-label` action pattern.

**Pending requests are cards; decided ones stay a table.** A pending request is a decision, and
the old table truncated the reason — the field the decision actually turns on — behind an
ellipsis tooltip. `LeaveApprovalCards` gives it room to be read without hovering and puts the
three actions beside it. Anything already decided is history, where scanning and comparing rows
matters more than reading any one, so it stays tabular.

**One date-range dropdown replaces the month picker AND the start/end pickers.** Today (default),
Yesterday, This Month, Custom — start/end inputs appear only under Custom, and month-wise
filtering is gone entirely.

The list endpoints (`GET /attendance/me`, `/team`) accept **only `?month=`** — verified against
`validateMonthQuery`, which rejects anything else; only `/attendance/report` takes a real range.
Rather than change a permission-scoped backend endpoint, an arbitrary range fetches each calendar
month it touches and narrows client-side, the same approach `AdminAttendanceView` already used
for its own custom range. In practice that's one request: Today, Yesterday and This Month never
span two months, and only a month-straddling Custom range costs a second.

**New `src/utils/date.utils.js`** — created because no shared local-date helper existed and
`dayjs(x).format("YYYY-MM-DD")` was written out inline in half a dozen components, which is
exactly how one copy quietly drifts into `toISOString()`. It holds `toLocalDateKey`,
`resolveDateRange`, `monthKeysInRange` and `isWithinRange`. **Nothing here ever calls
`toISOString()` on a local-midnight value** — that lands a day early at UTC+5:30, the bug shipped
in a previous batch; a test asserts the local calendar day survives.

**Layout:** stat cards at the top, filters below them, with all filters and the report button on
one row.

**Timeline:** "Issues / Total Connectivity Issue Time" renamed **"Not Tracked"** — it describes
what the number measures (time with no signal) without implying fault. Every colour band now has
a hover tooltip giving its meaning AND its clock range: green = connected, red = connectivity
issue, amber = on break, and the gray base = not tracked, which was previously the one band with
no explanation at all. `computeTimelineSegments` carries `startMs`/`endMs` on each segment so the
view labels them without recomputing any geometry.

The leave notification badge moved from the retired Leave nav item onto Attendance, since that is
where leave now lives.

---

### User controls moved to the top strip; full play/pause/stop attendance control (2026-08-05)

**The sidebar footer is gone.** Avatar, name, gear and Sign out moved into the fixed blue top
strip, right-aligned as `[bell] [gear] [name] [sign out]` (`HeaderUserControls`). The
notification bell is the SAME `NotificationBell` instance relocated — not a second one — so its
polling and visibilitychange refetch (both in `useNotifications`) are untouched.

Clicking the name opens Edit Profile. That mattered: the sidebar avatar was the only entry point
to that modal, so removing the footer without rewiring it would have stranded `EditProfileModal`
with no way in.

**Responsive:** below `sm`, the name and Sign out collapse into an avatar dropdown — at 390px the
full row plus the attendance controls would otherwise overflow. Nothing is dropped, just one tap
deeper. Verified at 390px: `scrollWidth === innerWidth`, no horizontal scroll.

**`HeaderAttendanceControl` extends the earlier header check-in button into the whole shift
state machine**, so a full day can be driven without opening `/attendance`:

| State | Controls |
|---|---|
| Not checked in | Play → check-in (camera + geolocation) |
| Checked in | live timer · Pause → break in · Stop → check out |
| On break | amber timer + "On break" · Play → resume (break out) · **Stop disabled** |
| Break already used | **Pause disabled** · Stop still available |
| Checked out | back to Play for the next shift |

Two backend rules are MIRRORED, not re-implemented, and both render as a **disabled control with
a Tooltip** rather than a hidden one — a control that vanishes leaves the user wondering what
they did wrong, whereas a disabled one explains itself:
- Check-out is rejected (409) during a break → Stop is disabled while on break.
- One break per shift → Pause is disabled once `breakOut` is set.

Check-in AND check-out both require a photo server-side, so both open the shared
`AttendanceCaptureFlow` modal — there is no quiet photo-less check-in path. Break in/out need
geolocation only and submit immediately, matching `CheckInOutWidget` exactly. Every action goes
through the existing endpoints; `notifyAttendanceChanged()` keeps this control and the
`/attendance` widget in agreement.

**Admin renders no attendance control or timer at all** (exempt, §7.4c) — gated in `MainLayout`
so the component isn't mounted and no `GET /attendance/me` fires. The bell/gear/name/sign-out
block still renders for admin.

**Deliberately placed in `layouts/`, not in the attendance module.** The task that created it
also forbade editing `frontend/src/modules/attendance/` (a concurrent session owned it), and the
component it extends — `HeaderCheckInButton.jsx` — lives inside that directory. Rather than edit
another session's area, the extended control was built in header-owned territory and CONSUMES
the attendance module's hooks, API and `AttendanceCaptureFlow` without modifying any of them.
**`modules/attendance/components/HeaderCheckInButton.jsx` and its test are now unused** — nothing
imports them — and should be deleted by whoever owns that module next.

Also fixed in passing: `NotificationBell`'s `MODULE_ROUTES` still mapped leave notifications to
the `/leave` route removed earlier the same day; it now points at `/attendance`, where leave
lives.

22 new tests across the two components cover every state transition, the two disabled-with-reason
rules, that Play never submits a photo-less check-in, that Pause/Resume use geolocation with no
camera step, and that the relocated bell still fetches.

---

### AMC moved to the top of Customer Detail (2026-08-05, second pass)

The AMC section now LEADS the page, above Site & Installation Details. For an existing customer
the live question is almost always "is their contract current, and when does it renew" — an
expiring-soon AMC is the only time-sensitive thing on the page, and it previously sat below the
static install spec.

Section order is now: **AMC → Site & Installation → Billing → Contacts | Contracts → Activity Log.**

Verified rendering rather than assumed: cards show amount, start date, renewal date and status;
the expiring-soon card carries an amber border/background plus an "Expiring soon" tag, visually
distinct from the neutral "Expired" treatment; renewal chains still collapse to one card with a
"Renewed N×" expander; and Renew appears on each card. A test asserts the three leading section
headings in order.

**Still outstanding — `AmcRenewalsDueWidget` links to the removed `/amc` route.** That file
STILL carries another session's uncommitted change (a `text-right` → `text-left` tweak on the
line directly above the link), so repointing it would mean committing their work-in-progress.
Reported instead of committed, per the task's own instruction. `ROUTE_PATHS.AMC` remains defined
so the link resolves to a string rather than `undefined`; it should be repointed at `/customers`
once that file is free.

---

### Attendance/Leave tab fixes: layout, filter labels, admin leave stats, status filter (2026-08-05)

**Two items in this batch were previously REPORTED as done but had not actually shipped.** Both
are now genuinely fixed and covered by tests:

- **Stat cards were still BELOW the filters.** `AttendanceSummaryStats` rendered inside
  `AttendanceRecordsSection`, which every view renders *after* its filter row — so a code comment
  claiming the cards had moved was simply wrong. The stats now render at the top of each of the
  three views (Admin, Team, Personal), above the filters; `AttendanceRecordsSection` owns the
  table and photo modal only.
- **The Leave Requests tab still showed "Your Paid Leave Balance This Month."**
  `LeaveBalanceCard` rendered unconditionally in `LeaveSection`, so an admin saw their own
  personal balance on an approval screen.

**`LeaveAdminStats` replaces it for admins** — four cards derived from the already-fetched list,
no extra requests: Pending Requests (what needs action), On Leave Today (count **plus names**,
because "3 people" isn't actionable but "Priya, Sam, Dev" is), Upcoming This Week, and Unapproved
Absences This Month (feeds the 2× deduction rule). The employee's own balance card is untouched on
their own tabs.

**Employee filter no longer renders raw ObjectIds.** The name map was built from
`useUserDirectory()`, which lists *active* users only, so a record belonging to a deactivated or
deleted employee fell through to printing its Mongo id. It's now built from the full roster, and
anything still unresolved shows "Unknown employee" rather than an id. Fixed in both the Admin and
Team views.

**The Leave Requests tab reuses the Attendance date preset** (Today / Yesterday / This Month /
Custom) via the existing `date.utils.js` — no second implementation. It defaults to **This Month**
rather than Today: a leave queue spanning only today is usually empty, and an approver needs the
month's backlog.

**The Leave History tab is gone**, replaced by a Status filter on Leave Requests (Pending /
Approved / Declined / Unapproved Absence / All). Two tabs made you guess which one a request was
currently in. "Unapproved Absence" is deliberately not in the status enum — it's the derived
`isDoubleDeduction` flag, filtered separately.

**Fixed a duplication bug introduced by the earlier tab work:** an admin saw every pending request
TWICE, once as an approval card and again as a table row. A request now renders as *either* a card
*or* a row, never both — pending as cards (for anyone who can act), decided as the table. Someone
who can't act gets the plain table for everything, so an employee's own pending requests don't
vanish. **Delete was also added to the approval cards**: pending requests now render only as cards,
so leaving it off would have silently removed the ability to delete one.

**Also fixed: `LeaveSection.test.jsx` had not run at all since the `git mv`** — its internal import
still pointed at `./LeaveListPage`, so the suite failed to *collect*. A collection failure produces
no per-test `×` line, which is why an earlier report counting only `×` lines wrongly concluded
every failure was pre-existing.

---

### Live Map tab; standalone /location page retired (§B6, 2026-08-05)

A **Live Map** tab on `/attendance` for admin and anyone holding
`attendance.view_location`: every currently-checked-in employee's check-in point, their ping trail
since, and their latest position. The standalone `/location` page, route and nav item are deleted.
`locationApi` SURVIVES — `useCheckedInHeartbeatLoop` imports it — so only the page went, the same
treatment AMC got. `LiveMapView`, its test and `useLiveLocations` were deleted as newly-dead code;
`HistoryMapView` stays, still used by the Attendance map modal.

**Two premises in the task turned out not to match the code, and are handled by derivation rather
than a backend change:**

1. **"Geofence violations are already computed per ping" — they are not.** `LocationPing` stores
   only `{employeeId, attendanceId, coords, capturedAt}`; there is no per-ping flag. Violations
   live on the *Attendance* record as time INTERVALS (`{start, end, maxDistanceMeters}`), computed
   per shift. A ping is therefore marked as violating when its `capturedAt` falls inside one of
   those windows — an open window (`end: null`) extends to now.
2. **"Reuse HistoryMapView" doesn't fit.** That component renders ONE employee's single polyline
   and can't show several at once. Rather than build a second map, `LeafletMapView` gained an
   additive `paths` prop for multiple polylines; `path` still behaves exactly as before, so History
   and the Attendance modal are untouched. There is still exactly one `TileLayer` (CARTO Positron)
   in the app and no OSM requests.

**Staleness is treated as a first-class state**, because the dangerous failure here is a frozen
marker that still looks live — browser geolocation stops entirely when a tab is backgrounded or a
phone locks. A position older than 10 minutes renders red on the map, its trail turns red, and the
list shows an explicit "Stale · last updated Xm ago" tag with a tooltip explaining why tracking
may have stopped. Fresh positions are green.

Marker semantics: blue = check-in start (taken from the attendance record's existing check-in
coords, which already serve as the geofence centre — nothing is stored twice), green = current and
fresh, red = current but stale, orange = a ping recorded during a geofence violation.

**Polling** is 45s (inside the 30-60s brief) plus a `visibilitychange` refetch, the same pattern
`useCheckedInHeartbeatLoop` and the notification hook use — a backgrounded tab's timers are
throttled, so a returning user must not be shown minutes-stale data. An in-flight guard prevents
overlapping cycles.

**Checked-out employees drop off by themselves**: `GET /location/live` only returns open
attendance records. Their trail remains in History.

**Known cost, flagged rather than hidden:** there is no batched trail endpoint, so each poll fans
out to one `/location/history` call per checked-in employee. Fine for a handful of people on a 45s
cycle; a large org would want a batched endpoint instead.

**Also fixed:** the attendance table pushed the whole PAGE into horizontal scroll at 390px. It now
scrolls inside its own container (`scroll={{ x: "max-content" }}`), the treatment the Leave table
already had. All three tabs verified clean at 390px.

---

### Two-factor authentication — frontend (§7.38, 2026-08-05)

**Login is now two-step when a second factor is outstanding.** `sessionStore.login` no longer
assumes a session: when the backend returns a `preAuthToken` it does NOT mark the store
authenticated, because doing so would render a signed-in shell to someone who has supplied only a
password. `LoginPage` holds the pre-auth token in component state for the few seconds between the
two steps — never persisted, since it is deliberately not a cookie.

**`TwoFactorChallenge`** is the one blocking login screen — a single field accepting a TOTP *or* a
recovery code (the backend decides which). Asking someone locked out of their phone to first find
the right input is friction at the worst possible moment. On a 429 the form is replaced by "Start
again", because further codes — even correct ones — are refused until the login restarts.

**`TwoFactorEnrolment`** used to serve a second, blocking login screen as well: the mandatory
enrolment gate for admin/manager, which took a `preAuthToken`. That gate was removed 2026-08-08
(see "Two-factor is opt-in, with a self-service off switch" below), so the component is now
reached only from Settings and the prop went with it.

The QR is generated **client-side** from the `otpauth://` URI, never via a third-party chart
service — that is exactly how a 2FA secret quietly leaks. The manual key is always shown too,
since many desktop authenticators cannot scan.

Recovery codes appear once, behind an explicit "I've saved these codes somewhere safe" checkbox
that gates the Continue button. They cannot be retrieved afterwards, so the confirmation is the
point rather than ceremony.

**Settings → Account** is available to EVERY signed-in user (2FA status/enrolment, recovery-code
regeneration, password change) — personal security settings, not administrative ones. As a
result Settings is no longer wholly off-limits to a non-admin; the administrative tabs remain
permission-gated exactly as before.

**Deliberately NO "reset password by email" link here.** Production SMTP points at a placeholder
host and `/auth/forgot-password` returns 500, so offering it to a signed-in user would send them
down a path that cannot work when they can simply change their password directly. The signed-out
`/forgot-password` page is untouched.

---

### Permissions matrix — level + scope (§7.41, 2026-08-06)

Replaces the checkbox grid, which had one column per action across the union of every action in
the registry: it scrolled horizontally on every screen and got wider each time a module gained a
key. Now **one row per module** — a level (None/View/Edit/Full), a scope (Own/Team/All), and
standalone capability keys as toggle chips.

**The layout contract.** Both selectors are fixed-width (236px / 172px); the label column absorbs
the remainder with `min-width: 0` and truncates, carrying the full name in `title`. That
`min-width: 0` is load-bearing — a flex item defaults to `min-width: auto` and refuses to shrink
below its content, which is the usual way a row like this starts scrolling. Below ~900px the row
wraps: selectors move under the label, chips wrap onto as many lines as they need. Verified in a
real browser at 1280 / 1024 / 390: `documentElement.scrollWidth === clientWidth` at all three,
15 rows, zero overflowing. jsdom performs no layout (both values are 0 there), so the jsdom test
asserts the structural cause instead — that adding actions to a module changes what a level maps
to and adds chips, never a control.

**The ladder is per-module**, derived from each module's own registry entry — see
`permissionModel.js`. A universal view→create→edit→delete ladder would emit keys that don't exist
for `leave` (delete, no edit), `amc` (edit, no delete) or `tickets` (no plain view), and the
backend validator 400s on an unknown action — so it wouldn't merely mis-render those rows, it
would make them unsaveable. Levels that would produce an identical key set aren't offered at all
(`amc` has no Full; `leave` has no Edit).

**Scope renders inert where it isn't a permission key.** Leads, Customers, Payments and AMC scope
by record ownership resolved from the role in the service layer, not by a stored key, so the
control is disabled with that stated as the reason rather than offering a choice with nowhere to
save. Tickets is chips-only: its tiers are own/assigned/all, and "assigned" is not "team".

**Nothing is rewritten on load.** The selection carries the actual key sets and only re-expands on
an explicit choice. Loading `manager.location` (stored as `view_team` with no `view`) and saving
it would otherwise silently add `location.view` — a grant nobody asked for, on a row that was only
looked at. Same trap on a partial ladder. Confirmed live: the real manager template opens with
Save disabled and "No unsaved changes".

**Drift.** Changed rows are marked with their previous value ("was View · Team") and counted in
the header; Save is disabled until something actually differs. On the user-override screen a
second baseline — that user's role template — marks every divergent row, because
`reconcileRoleTemplate` repairs templates but never existing users, so template→user drift is
permanent until someone resets. Removing your OWN `permissions.manage` requires an explicit
confirmation; it is the one change that locks you out of this page with no way back.

### Remember this device (§7.40, 2026-08-05)

A checkbox on `TwoFactorChallenge`, **unchecked by default** — opt-in, never opt-out. Its wording
is deliberately specific ("Skip the code on this browser next time. You'll still enter your
password.") rather than the usual vague "keep me signed in", which invites people to assume it
does more than it does. `verifyTwoFactor(preAuthToken, token, rememberDevice)` passes it through;
everything else about the flag lives server-side.

The device token itself is an httpOnly cookie, so **no frontend code can read it**. Settings →
Account therefore renders the server's own safe view of the list — label ("Chrome on Windows")
plus trusted/expires dates — with per-device **Revoke** and a **Revoke all**. That card only
renders when 2FA is on: with no second factor there is nothing for a trusted device to skip.

Changing your password revokes every trusted device server-side, so the success message says so
and the list refetches rather than sitting stale.

### Employee-facing pages (§7.39, 2026-08-05)

Employees get their own destinations; **admin and manager keep the combined tabbed Attendance
page unchanged.**

| Route | What it shows |
|---|---|
| `/attendance` | Attendance ONLY for this role — one tab, so no tab bar renders |
| `/leave` | Apply + own history, via `LeaveSection view="all"` |
| `/team` | Team head + teammate names; contacts only if the team opted in |
| `/profile` | Own details; photo always editable, name/phone gated, email read-only |
| `/settings` | Own role + permissions READ-ONLY, plus Account (2FA, password) |

**`LeaveSection` is reused, not rebuilt** — `/leave` is a thin wrapper. Writing a second leave
component would duplicate the Balance card, the fetch-error Alert, the per-row scope gate and the
request modal, and let the two drift.

**`/team` reads `GET /teams/mine`, a self endpoint added for this.** `GET /teams` is gated on
`teams.manage`/`teams.view_team` and an employee holds neither (`view_team` is scoped to teams you
HEAD, which an employee never does), so the page would have 403'd without it. It also returns the
head as a named person: `getTeamMembers` lists users whose `managerId` IS the head, so the head is
by construction absent from that list.

**Contact details are omitted by the SERVER**, not hidden here. The component renders whatever it
is given, so there is no client-side check to bypass — and it deliberately shows no attendance or
leave status of teammates, which is a manager-level question and would leak colleagues'
whereabouts to their peers.

**`/profile` renders name and phone as read-only TEXT when `canEditOwnProfile` is false** — not a
disabled-looking input that fails on save. It also only ever SENDS the fields the server will
accept for that user, because `PATCH /users/me` refuses a whole request containing a gated field
rather than ignoring it. Email is never an input in either state.

**Settings is no longer admin-gated** — it carries every user's own Account. Which tabs appear
inside is still permission-gated, and an employee gets their own read-only access view instead of
the administrative tab set.

**Admin/manager controls:** a contact-visibility switch per row on the Team page (the team's own
head may use it, not just admin — the backend enforces head-or-admin), and a "let them edit their
own name and phone" switch on the user detail page (that person's manager, or admin).

### Two-factor is opt-in, with a self-service off switch (2026-08-08)

2FA was mandatory for admin and manager, enforced by a **blocking enrolment screen at login** they
could not get past. It is now opt-in for every role, and every user can turn their own on or off
from Settings → Account.

**Gone:** the blocking enrolment branch in `LoginPage`, `utils/twoFactor.utils.js` (the
`isTwoFactorMandatory` mirror of the backend rule), the "Required for your role" notice and its
red tag, and the `preAuthToken` prop on `TwoFactorEnrolment`. None of it was left behind disabled.

**The card is now one `Switch` showing current state.** Turning it ON opens the unchanged
enrolment flow — QR, verify-before-enabling, one-time recovery codes behind the "I've saved these"
confirmation.

**Turning it OFF opens a confirmation that asks for the current password AND a code**
(authenticator or recovery), because the backend requires both. Flipping the switch alone calls no
API at all — a test asserts exactly that, since a control that removed a security protection on a
single click would be the bug. The modal states plainly that **every trusted device will be signed
out**, which is what the backend does, rather than letting people discover it later.

A failure is surfaced in the modal and the modal stays open, so the switch never reports a state
the server didn't agree to.

### Tickets deferred from the UI (2026-08-07)

**Hidden, not removed.** Tickets is still a core module in `final-plan.md` (§7.8, Phase 5) with a
Customer Portal dependency — this is a scope deferral, and the backend module, routes, model and
data were not touched at all.

| Gone | Kept, and why |
|---|---|
| The Tickets nav item (commented out in `MainLayout.jsx`) | `modules/ticket/api/ticketApi.js` — `TicketsOpenWidget` still calls it |
| `/tickets` and `/tickets/:id` routes | The `TicketsOpenWidget` itself; its counts come from a live backend |
| `TicketsPage.jsx`, `TicketDetailPage.jsx` (both `PlaceholderPage` stubs) | `tickets.*` permission tiers — the backend enforces them and the Permissions matrix still manages them |
| `ROUTE_PATHS.TICKETS` / `TICKET_DETAIL` | The whole backend `ticket` module and all its data |

**The point of the exercise was the links, not the route.** `/amc` was retired months ago and
`AmcRenewalsDueWidget` has been pointing at the dead route ever since, because nothing checked.
So the widget's "View all tickets →" link is gone (the counts stay — they're still real), and
`src/routes/deferredModules.test.js` now scans every source file for client-side navigation to
`/tickets` and fails if any comes back. That scan deliberately ignores
`apiClient.get("/tickets")` — the backend endpoint is live and still in use; only navigation to a
route that no longer exists is a defect.

**Notification routing.** Tickets is one of only four modules that create notifications, and the
backend still creates them. Rather than stop generating them (that would mean touching the
backend, which was out of scope) their entry was removed from the shared route table in
`notificationRoutes.js` *and* `public/sw.js`, so they now resolve to `null`: the bell shows and
marks them read in place without navigating, and a push opens the app root. Sending someone to a
dead `/tickets/:id` would be strictly worse than not moving them at all.

To restore: uncomment the nav block in `MainLayout.jsx`, uncomment the two constants in
`routePaths.constants.js`, re-add the two routes and their imports in `router.jsx` (the pages
were 7-line placeholders), and put `tickets` back in both route tables.

### Web Push — the client half (§6.7, 2026-08-07)

The backend has been able to send pushes since Phase 9 (2026-07-16); nothing could receive
them, because a browser only gets a push through a **service worker**, and there was none.
This is that half.

| File | Role |
|---|---|
| `public/sw.js` | The worker. `push` → show a notification; `notificationclick` → go to the record |
| `src/modules/notification/pushSubscription.js` | Subscribe/unsubscribe, permission state, rotation |
| `src/modules/notification/components/PushNotificationToggle.jsx` | The Settings → Account control |
| `src/modules/notification/notificationRoutes.js` | One route table, shared with the bell |

**The worker is registered on load; permission is NOT requested on load.** Those are separate
things and conflating them is the classic mistake: a browser shows the permission prompt once,
users reflexively deny it, and **a denial cannot be re-requested programmatically — ever.** So
`App.jsx` registers the worker silently at startup, and the only thing that ever calls
`Notification.requestPermission()` is the user clicking the toggle in Settings → Account.

The toggle reports the four states honestly rather than pretending:

| State | What renders |
|---|---|
| Unsupported (no `serviceWorker`/`PushManager`) | **Nothing** — a control that errors on click is worse than no control |
| `VITE_VAPID_PUBLIC_KEY` unset | **Nothing** — subscribing is impossible without it, so don't offer it |
| `default` | Switch, off. Clicking it prompts |
| `granted` | Switch, reflecting whether a subscription actually exists |
| `denied` | Switch **disabled**, plus a notice saying it has to be changed in browser settings |

That last row is the one worth stating plainly: with `denied`, an enabled-looking switch would
do nothing at all when clicked, forever, with no way for the user to work out why.

`sw.js` deliberately **caches nothing** and has no `fetch` handler. A cache here would serve
stale HTML after a deploy — trading the problem push solves for a worse one. It also carries
its own copy of the route table, because a service worker is a standalone script served from
the site root and cannot import from `src/`. `notificationRoutes.test.js` parses the real
`sw.js` off disk and asserts the two copies agree, so a route added in one and not the other
fails the suite instead of quietly sending pushes to a dead URL.

Clicking a notification **focuses an existing tab** and navigates it, only opening a new window
if the app isn't already open — otherwise every push costs the user their current page state.

Subscriptions rotate: a browser can silently issue a new endpoint. `syncSubscription()` runs on
load, compares the current endpoint against the last one sent (localStorage), and re-POSTs on a
mismatch. Without that, pushes keep going to the old endpoint, 410, and get deactivated
server-side — push stops working with no visible cause.

**Verified in a real browser, not jsdom** — neither service workers nor `PushManager` exist
there. A real push was signed by the backend's own `sendPush()`, accepted by FCM (`201`), and
observed being displayed by the worker with the correct title, body and click target. Two
things that cost time and are worth writing down: **Chrome disables the Push API in incognito**
(so Playwright needs `launch_persistent_context`, since ordinary contexts are
incognito-equivalent), and **headless Chromium always reports `Notification.permission ===
"denied"`** no matter what `grant_permissions` says — the enable path is simply unreachable
headless.

---

## Env Vars

```
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_GOOGLE_MAPS_API_KEY=
VITE_VAPID_PUBLIC_KEY=
```

`.env`/`.env.local` are gitignored (see `.gitignore`) — only `.env.example` is committed.

**Gitignored is not the same as not-deployed.** The Vercel CLI uploads `.env` anyway, and Vite
inlines a `.env` value for any variable that is **not also set in the Vercel project's own env
settings** — a real env var wins, an absent one does not. So a var that exists locally but not
in Vercel gets its *local* value baked into the production bundle. That shipped the local dev
VAPID key to production on 2026-08-07 before it was caught.

The guard is `.vercelignore` **at the repo root** — not here. Vercel uploads from the repo root
and the project's Root Directory setting (`frontend`) only says where to *build*; a
`frontend/.vercelignore` is never read. It also *replaces* `.gitignore` for upload filtering, so
`node_modules`/`dist` have to be restated in it rather than inherited.
