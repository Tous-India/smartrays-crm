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
| `attendance` (Attendance) | ✅ **Built.** `CheckInOutWidget` (`/attendance`, top of the Personal view) — camera capture via native `getUserMedia` + a `<canvas>` snapshot (no library, see below), geolocation via the native `Geolocation` API, both mandatory before Confirm enables (mirroring the backend's server-side-enforced photo requirement, §7.4). Fetches current status on mount rather than assuming — correctly shows "Checked In" + a live elapsed-time counter if the page loads mid-shift, and (see below) resumes the heartbeat/ping loop in that same case. `/attendance` now routes by role (2026-07-31, §7.4 reversal): admin gets `AdminAttendanceView` (org-wide, 5 filters — see the dated write-up below), Manager/Employee/Sales Associate keep `PersonalAttendanceView` unchanged. Personal, Team (`/attendance/team`, `TeamAttendanceView`), and Admin views all render through one shared `AttendanceRecordsSection` — summary stats and a read-only photo-viewer modal, on top of the original `AttendanceTimeline` table (Check-In/Check-Out/Working Hours/Status) with connectivity gaps (`connectivityGaps[]`, §6.5) rendered as visually distinct red segments on a proportional bar (`ConnectivityGapBar`). **List/Calendar toggle removed (2026-07-31, §7.5e)** — list/timeline-only now, no calendar view anywhere; see the dated write-up below. **Attendance is UI-read-only for every role, including admin (2026-07-31)** — the admin manual-correction UI (Add Record/Edit) was removed; see the dated write-up below. Team view keeps its employee selector (client-side filter; the backend endpoint has no per-employee filter), gated by `attendance.view_team`/`view_all` via a 403 `Result` in `AttendanceTeamPage.jsx` (not `PermissionGate`, which only expresses a single module+action pair — this needs an OR of two). Every view's report button hits the unified `POST /reports/generate` dispatcher (`module: "attendance"`) via the shared `ReportDownloadButton`/`reportApi.js`. **Extended later** with geofence-violation display — a "Location" column/section/marker alongside every existing connectivity-gap one — see "Geofencing" below for the full write-up. |
| `leave` (Leave) | ✅ **Built.** `LeaveListPage` (`/leave`) — **list/table only, no calendar view, no "All" tab (2026-07-31, §7.5e)**, tabs are role-shaped (admin: none, a single unified filterable view; manager: Own + Team; everyone else: none, just their own list) — see the dated write-up below. A Request Leave modal (`paid`/`unpaid` only — `unapproved_absence` is never requestable, only via a separate action; hidden entirely for admin, §7.5c), and Approve/Decline/Mark Unapproved Absence/**Delete** (§7.5d/§7.5e) actions gated per-action on `leave.approve`/`decline`/`mark_unapproved_absence`/`delete` (admin org-wide, manager on their own team — reverses the original "admin-only" restriction, §7.5c). The mark-unapproved-absence confirmation shows its 2x-deduction consequence **directly in the `Popconfirm`'s description text**, not a tooltip, since burying it there would fail the whole point of confirming before an irreversible-feeling action; Delete gets the same confirm-first treatment. Report download via the same shared `ReportDownloadButton` (`module: "leave"`, `filters: { scope }`). **Extended later** with half-day support, a leave balance card, a Decline action, manager parity, a required Reason field, and Admin filters (including a corrected Team filter, §7.5e) — see "Half-day, balance, decline, calendar & notifications", "Manager parity, admin exemption, Reason field & Admin filters (§7.5c)", and the dated §7.5e write-up below for the full write-ups. |
| `location` (Live Map) | ✅ **Built — a new route, `/location`** (§7.4b had no frontend before this task). Live view (`LiveMapView`) re-polls `GET /location/live` every ~12s and plots one marker per visible, currently-checked-in employee; History view (`HistoryMapView`) — an employee + date picker rendering that day's `GET /location/history` ping trail as a polyline. Gated by the existing `location` `PERMISSION_REGISTRY` set (any of `view`/`view_team`/`view_all`), same 403-`Result` pattern as Team Attendance. Uses `GoogleMapView` (`src/components/`) + `useGoogleMapsScript` (`src/hooks/`) — see "Maps & camera dependency decisions" below. Now actually receives pings — see "Heartbeat & location-ping loop" below. |
| `user` (User Management) | ✅ **Built (§7.19, 2026-07-17)** — a new `/settings/users` route (added since §8's original route map didn't list one; gated on `users.view_all`/`users.view_team`, same as the backend scoping). Roster list (admin sees everyone, manager sees their own team — entirely server-side scoping, no client-side filtering), per-user Edit (name/email/phone/role/managerId/baseSalary via the existing `PATCH /users/:id`), Deactivate/Reactivate, an admin password-reset action (supports both an admin-typed exact password and a backend-generated one-time temp password, shown once), a link to the Permissions module (**now built — see below**, no longer a placeholder), and Create User (admin only, via the existing `POST /auth/register` — no new backend endpoint). **Create ("New User") form reworked 2026-07-30** — see below. |
| `dashboard` (Dashboard) | ✅ **Built (§7.20/§7.21)** — the `/dashboard` shell, composing widgets by role via a declarative catalog rather than four separate per-role dashboards. Leads + Customers widgets (§7.20), plus 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/Payroll (§7.21) — see "Dashboard widget catalog" below for the full list and how to extend it. |
| `payment` (Payments) | ✅ **Built** — the first real UI for this previously backend-only module (`/payments`, admin-only per §5's matrix). `PaymentsListPage` — a `Segmented` date-range filter (Today/Yesterday/This Month/Financial Year/All Time, computed client-side and sent as `from`/`to`; Financial Year is April 1–March 31, no existing FY utility anywhere else in this codebase, added fresh) driving a server-paginated `PaymentsTable` (Date/Customer/Amount/Notes/Recorded By — `customerId`/`recordedBy` resolved to names via the same Map-lookup convention `CustomersTable`'s Owner column already uses, not a backend join). `GET /payments` gained real `from`/`to`/`page`/`limit` support for this — the first server-side pagination in this backend, everything else paginates client-side (see `backend/README.md`'s Payments section). A "Record Payment" modal (`RecordPaymentModal`, gated separately behind `payments.create`) — its Customer field is a genuinely debounced search-as-you-type `Select` against the existing `GET /customers?search=` endpoint, not the fully-fetched-once-then-client-filtered `showSearch` pattern every other picker in this app uses (Owner/Project Manager pickers), since fetching every Customer up front defeats the purpose. Scoped to system customers only for this first version — `manualClientName` (cash/non-system entries) and invoice-linking (partial reconciliation against an outstanding Invoice) are backend-supported but deliberately left for a future pass. **Edit/delete audit trail added 2026-07-30** — an Actions column (History/Edit/Delete icon buttons, Edit/Delete gated behind `payments.edit`/`payments.delete` via `PermissionGate`) drives `EditPaymentModal` (pre-filled amount/date/notes/collectedBy plus a required "Reason for edit"; customerId/manualClientName/invoiceId are read-only in this form, matching the backend's own restriction), `DeletePaymentModal` (a small dedicated modal, not a bare `Popconfirm`, since deleting needs a typed reason — required "Reason for deletion"), and `PaymentAuditLogModal` ("View History," read-only, fetched fresh on every open; no per-row "has history" badge on the main table — that would need either an N+1 request per row or a backend list-shape change, noted as a reasonable future addition rather than built now). Soft-delete (see `backend/README.md`'s Payments section for the full soft-vs-hard-delete reasoning) means a deleted row simply disappears from the table on refetch, not a client-side filter. 20 tests total (`PaymentsListPage.test.jsx`), all passing. |
| `reports` (Reports & Analytics) | ✅ **Built (§7.23)** — the app's first real analytics feature and first chart library (`@ant-design/charts`, new dependency), replacing the `PlaceholderPage` at `/reports`. See "Reports & Analytics module" below for the full write-up. |
| `permission` (Permissions Management) | ✅ **Built (§7.27, 2026-07-30)** — replaces the long-standing `PlaceholderPage` at `/settings/permissions`. See "Permissions Management module" below for the full write-up. |
| Every other module (`payroll`, `travel-logs`, `tickets`, `amc`) | Routing skeleton + placeholder page only — real components/api/hooks not built yet, see `docs/project-status.md` for what's next. |

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
/reports/generate`, still `services/reportApi.js`/`components/ReportDownloadButton.jsx`,
untouched), which now has a proper UI home on this same page instead of no UI at all.

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
module-list permission filtering, per-module filter payloads, and the dispatcher call →
`downloadUrl` → download handoff (mocking `services/reportApi.js`, the same pattern
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

## Env Vars

```
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_GOOGLE_MAPS_API_KEY=
```

`.env`/`.env.local` are gitignored (see `.gitignore`) — only `.env.example` is committed.
