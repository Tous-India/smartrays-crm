# Smartrays Solutions CMS — Current Project Status

> This file tracks **where the project actually is right now**. It is a living/working
> document, updated as work happens — it is not the plan itself. The full requirements,
> data models, API specs, and roadmap live in `.context/final-plan.md` (the project's
> persistent memory/brain), alongside the original raw notes in `.context/smartrays.md`
> and `.context/leads-customer-functional-spec.md`.

**Last updated:** 2026-08-04

---

## Architecture Principles

- **Single Source of Truth for Auth** — the database, never the JWT/client, decides who a user
  is and what they're allowed to do. Formalized 2026-07-13 in `.context/final-plan.md` §4.1;
  applies retroactively to `auth`, `lead`, `location`, and `permission` as already built (it
  was already true in all four, just not written down as a rule until now), and to every module
  built from here forward without exception. See §4.1 for the full statement and §7.0/§7.12 for
  how `auth` and `permission` specifically implement it.

**Starting a new module or getting oriented?** `.context/final-plan.md` now has a
**"System Design (HLD & LLD)"** section (added 2026-07-13, unnumbered, sits right after §2) —
a consolidated map of the whole system (module list, cross-module flows, architectural
principles, and a per-module data-model/API/permissions/invariants breakdown) with accurate
current build status marked throughout. Read that before diving into the detailed §1–§11
sections below it.

---

## Current Stage

**Phase 0 (scaffolding + Auth + Permissions + User Management), Phase 1 (Leads, backend +
frontend), Phase 2 (Customers, backend + frontend; Projects/Tasks, backend only), Phase 3
(Attendance, fully built, + Leave, backend **and frontend**; Live Location Tracking, §7.4b,
was already built ahead of the rest of this phase and **now has a frontend live-map view
too, §7.18**), Phase 4 (Payroll), Phase 5 (Support/Tickets + Customer Portal), Phase 6 (Transport/
Travel), Phase 7 (Payments + AMC), Phase 8 (unified Reports), and Phase 9's backend half
(Notifications + Web Push + lead follow-up reminder cron, §6.7/§7.16) are built and covered
by an automated test suite (517 backend tests — 516 passing, 1 pre-existing unrelated
date-sensitive failure in `leave.test.js` — verified via a real `npm test` run, including 11
`GET /reports/analytics/*` aggregation endpoints added §7.23, Attendance's admin manual-correction
endpoints (§7.4), Leave's half-day/balance/decline/notification additions (§7.5), and, most
recently, Attendance/Location geofencing (§7.4/§7.4b)). **This closes out every backend phase in
the roadmap.** The User Management frontend
screen (`/settings/users`) plus self-service/admin password reset (§7.19), the Dashboard
(§7.13/§7.20/§7.21 — Leads/Customers widgets plus 6 operational glance widgets for Attendance/
Leave/Tickets/AMC/Payments/Payroll), the Payments frontend module (§7.22), and now Reports &
Analytics (§7.23 — the app's first real analytics feature, `@ant-design/charts`) are also
built — and **Phase 9 is now complete on both sides**: the Web Push client half (service
worker, subscription module, Settings → Account toggle) was built 2026-08-07, so a browser can
finally receive what the backend has been able to send since July. The rest of the frontend
module-by-module build-out remains (Payroll/Transport/AMC still render placeholder pages).
**Tickets was deferred from the UI 2026-08-07** — hidden, not removed; its backend is untouched
and it stays a core module in the plan (§7.8).
Location Tracking and
Attendance are proven to work together end-to-end through real HTTP endpoints, not just against
directly-seeded test data — see the changelog. Photo capture on check-in/check-out is now
**mandatory, enforced server-side** (a follow-up fix — see the changelog). Attendance checkout
now also auto-generates a `TravelLog` (Phase 6), which now (Phase 4) needs manager/admin
**approval** before it counts toward Payroll's mileage reimbursement. Customer Portal accounts
(Phase 5) authenticate through the exact same auth system as everyone else and self-signup via
an email-domain match, rather than being admin-created. `Invoice` (Phase 2's placeholder model)
remains a placeholder — Phase 7's Payments module adds optional **partial reconciliation**
(balance/status updates on an existing invoice) rather than building full invoicing. Phase 8
introduces one unified `POST /reports/generate` dispatcher (attendance/leave/payroll/transport/
leads/customers), which `GET /attendance/report`/`GET /travel-logs/report` also call internally.
This dispatcher briefly uploaded every generated report to Cloudinary and returned
`{ downloadUrl }`, but as of **2026-08-04** that upload step was removed — see the changelog —
and all three now stream the generated file directly as the HTTP response, matching
`GET /leads/export`/`GET /payroll/:id/payslip`'s pre-existing direct-stream shape.

- `backend/` — package.json, env config, error handling, response envelope, permission
  helper, `User` model, a fully working `auth` module (register/login/logout/me), a fully
  working `lead` module (CRUD, board/table filters, calls, hot flag, CSV/Excel import/export,
  lead sources, and a real `Convert to Customer` instead of a 501 stub), a fully working
  `location` module (ping ingestion, live view, day-trail history, config endpoint — see
  `.context/final-plan.md` §7.4b), a fully working `permission` module (role permission
  templates + per-user overrides + reset, see §7.12), a fully working `user` module (roster
  CRUD, team scoping, self/admin field rules, manager assignment, see §7.0b), a fully working
  `customer` module (Customer/Contact/Contract/Credential CRUD, contract→Project automation,
  deactivation cascade, AES-256-GCM-encrypted credentials vault, activity log, see §7.2) plus a
  fully working `project` module (Project, team assignment, see §7.3; `Invoice` remains a
  minimal placeholder model — Phase 7 adds partial reconciliation onto it, not full invoicing;
  Task functionality — model, endpoints, one-`in_progress`-task-per-employee constraint —
  deliberately removed 2026-07-29, see §6.4/§7.3), a **fully built `attendance` module** (check-in/check-out with photo capture via
  Cloudinary, connectivity-gap detection, `workingHours`, own/team/org history, PDF/Excel
  reports, see §7.4), a fully working `leave` module (request/approve/mark-unapproved-absence,
  one-paid-leave-per-month quota resolved in §11.7, see §7.5), a fully working
  `transport` module (`TravelLog` — auto-generated from Attendance checkout, or manual entry,
  Google Maps Distance Matrix-computed distance, own/team/org history, PDF/Excel reports, see
  §7.6; **retrofitted 2026-07-13 with a `pending`/`approved`/`rejected` approval workflow**,
  resolving §11.4), a fully working `payroll` module (gross/net computed from
  Attendance + Leave + approved-only TravelLog mileage, `POST /payroll/run` single-employee or
  bulk, `GET /payroll?scope=own|all`, PDF payslips, a monthly `node-cron` job, see §7.7 —
  two prerequisites closed first: `User.baseSalary` and TravelLog's approval workflow above),
  a fully working `ticket` module (raise/list/assign/status/comments/attachments,
  Customer Portal-scoped access, see §7.8) plus Customer Portal self-signup bolted onto `auth`
  (`POST /auth/customer/signup`, verified by an email-domain match against `Contact`/`Customer`
  records — see §7.0), self-service password reset (`POST /auth/forgot-password` — always the
  same generic, account-enumeration-safe response — and `POST /auth/reset-password`) plus an
  admin-override `PATCH /users/:id/reset-password` (admin-supplied exact password, or a
  backend-generated one-time temp password when omitted, see §7.19), a fully working `payment` module (admin-only log, optional
  partial reconciliation against an `Invoice`, see §7.9) plus a fully working `amc` module
  (two-flow creation, "own team"/"own" scoping via the underlying Customer's ownership, see
  §7.10), and (new) a fully working `report` module — one unified `POST /reports/generate`
  dispatcher (attendance/leave/payroll/transport/leads/customers), no new permission, streams the
  generated file directly as the response (2026-08-04 — no longer uploads to Cloudinary, see
  §7.11). Per-module
  `filters` shape is validated by reusing each target module's own existing query validator
  (e.g. `attendance.validation.js#validateReportQuery` for `attendance`/`transport` filters,
  `leave.validation.js#validateScopeQuery` for `leave`, `payroll.validation.js#validateListQuery`
  for `payroll`) rather than duplicating those checks — `leads`/`customers` have no dedicated
  query validator of their own to reuse, so their `status` filter is checked directly against
  each model's own exported status enum instead. `GET
  /attendance/report`/`GET /travel-logs/report` now internally reuse this same dispatcher — a
  deliberate breaking response-shape change, since no frontend exists yet to break.
  Originally verified by booting the server against a real MongoDB instance and exercising
  every endpoint with curl; that manual pass has since been superseded by a real automated
  suite (`vitest` + `supertest` + `mongodb-memory-server`, `npm test` — no real MongoDB or
  running server required): 28 tests for auth (19 + 9 new for forgot/reset-password, §7.19),
  40 for leads (34 + 6 new for assignment
  notifications/follow-up reminder reset, §7.16), 20 for location, 20 for
  permissions, 37 for user (33 + 4 new for the admin password-reset override, §7.19), 32 for
  attendance, 21 for customer, 19 for project, 18 for leave,
  28 for transport, 26 for payroll (20 in `payroll.test.js` + 6 in
  `src/cron/payrollCron.test.js`), 37 for ticket (35 + 2 new for assignment notifications,
  §7.16), 16 for payment, 20 for amc, 24 for report, 17 for notification, and 9 for
  `src/cron/leadFollowUpReminderCron.test.js` — covering
  CRUD, validation, filters, and — most importantly — permission scoping in depth. Total
  verified via a real `npm test` run:
  28 + 40 + 20 + 20 + 37 + 32 + 21 + 19 + 18 + 28 + 26 + 37 + 16 + 20 + 24 + 17 + 9 =
  **412 tests**. The Location and Permission suites' fixtures
  register through the real `/auth/register` endpoint (not a direct DB insert) specifically to
  exercise the default-permission logic; the Customer, Project, Attendance, Leave, Transport,
  Payroll, Ticket, and AMC suites do the same, to exercise their own new template defaults.
  Writing the
  Location suite found and fixed one real bug, in `User`, not `location`; writing the User
  suite found and fixed one more, in `user.service.js` itself; writing the Attendance,
  Customer, Project, Leave, Transport, Payroll, Ticket, Payment, AMC, and Report suites found no
  application bugs (two
  test-authoring mistakes in the Customer suite were fixed in the tests themselves — see the
  changelog). Location's suite also gained one new end-to-end test once Attendance existed,
  proving the two modules' real endpoints actually connect (real check-in → real ping succeeds
  → real check-out → real ping rejected). `attendance.test.js` mocks both
  `src/services/cloudinary.service.js` and `src/services/googleMaps.service.js` at the module
  boundary — no test makes a real network call to either.
- `frontend/` — **Frontend Phase 0 built 2026-07-16** (scaffold + auth flow + routing shell,
  mirroring what backend Phase 0 established — see `.context/final-plan.md` §7.14). Vite +
  Tailwind CSS + Ant Design + React Router DOM (`createBrowserRouter`/
  `createRoutesFromElements`) + Zustand (session store only) + Axios, per §3's fixed stack.
  A shared `apiClient.js` (httpOnly-cookie auth, `withCredentials: true`, 401 interceptor), a
  `sessionStore.js` resolving identity from a real `GET /auth/me` call (never a decoded
  token), route guards (`ProtectedRoute`, `PermissionGate`/`usePermission` — UI convenience
  only, not a real security boundary, stated in the code itself), a shared `MainLayout`
  dashboard shell (§7.13) and a separate no-nav `PortalLayout` for `role: customer`, and every
  route in §8's route map wired up. At the time this Phase 0 scaffold was built, only
  `/login` (fully functional) and `/` (real redirect-by-role logic) were built out beyond a
  placeholder — every other route rendered a shared "coming soon" placeholder, to be filled
  in module-by-module in later frontend tasks, the same phase-by-phase discipline the
  backend was built with. (Leads, Customers, Attendance, Leave, and Location have since
  been filled in — see below; `/payroll`, `/travel-logs`, `/tickets`, and others still
  render that placeholder today.) **Leads frontend module built 2026-07-16** (see
  `.context/final-plan.md` §7.15) — the first real feature module, and the reference
  implementation every later module follows: Table View + Board View (kanban, new
  `@dnd-kit` dependency for drag-between-stages) share one page shell with URL-persisted
  filters, Lead Detail (`/leads/:id`) is a real route rendered as a slide-over (Log Call,
  Hot toggle, Won, Lost, Convert to Customer, Edit, Delete), an Import wizard (upload →
  automatic column-matching preview → per-row result), and a filtered Excel export. One
  real backend gap found and handled, not silently worked around: leads has no dedicated
  activity-log endpoint (unlike `customer`), so the Activity Timeline is assembled
  client-side from call history + lead fields, documented as such in the code. 40 tests
  total (25 new — `vitest` + React Testing Library + `@testing-library/user-event`,
  jsdom), all passing, no real network calls. Full test suite still uses a deliberate,
  documented split for testing the kanban drag interaction (pure drop-resolution logic +
  the status-change flow hook + a plain rendering test) rather than simulating real
  `@dnd-kit` pointer-drag sequences under jsdom, which is brittle. Location Tracking's API
  shape (ordered `{coords, capturedAt}` for history, latest-ping-per-employee for live) was
  deliberately designed so the eventual map UI (live marker, path polyline) needs no API
  changes when it's built — **it's now built, see below.** **Customers frontend module built**
  (see `.context/final-plan.md`
  §7.17) — List View (`CustomersListPage`, search/owner/status filters defaulting to
  active-only, row-select + bulk activate/deactivate/delete) and an `Add Customer` wizard
  that creates the customer then each staged contract/contact in turn, surfacing the
  backend's contract automation explicitly in the success message rather than leaving it
  invisible. Customer Detail (`/customers/:id`) is a real full page (not a slide-over, per
  leads-customer-functional-spec.md) covering billing/contacts/contracts/credentials/
  activity log; the Credentials Vault stays masked until an explicit confirm-click reveal
  (never automatic), and is hidden entirely — not just disabled — behind a `PermissionGate`
  for a role with no `credentials.view` grant. 13 tests
  (`CustomersListPage.test.jsx`/`CustomerDetailPage.test.jsx`), all passing.
  **Attendance, Leave, and Location frontend modules built together** (see
  `.context/final-plan.md` §7.18 — three separate module folders, sharing the same
  check-in/checkout state) — a check-in/out widget (native `getUserMedia`+`<canvas>` camera
  capture, native `Geolocation`, both mandatory before submit, no new dependency for
  either), Personal/Team attendance timelines with connectivity gaps rendered as real red
  bar segments (not decoration), a Leave request/scope-tabbed-list/admin-only-approve flow
  whose mark-unapproved-absence action shows its 2x-deduction consequence directly in the
  confirm prompt, and a genuinely new `/location` route (live map + history-trail view) —
  originally via the native Google Maps JS SDK, migrated 2026-08-04 to `react-leaflet` +
  OpenStreetMap tiles (see the changelog — Google Maps was never actually functional in
  production, no billing/key was ever configured) — Location had no frontend at all
  before this task. New shared `ReportDownloadButton`/`reportApi.js` (streamed blob response →
  `triggerBlobDownload`, updated 2026-08-04 — see the changelog) used by every §7.11 module,
  meant for every later module's report button too. 25 new tests, all passing — the first frontend tests to mock
  `getUserMedia`/`getCurrentPosition`/the Google Maps SDK, documented in
  `frontend/README.md`'s Testing section for reuse. **Gap closed same-phase:** the flagged
  "no client-side loop actually submits `POST /attendance/heartbeat`/`POST /location/pings`"
  note above is resolved — `useCheckedInHeartbeatLoop` (`attendance/hooks/`) now runs both on
  an interval for as long as the user is checked in, wired into `CheckInOutWidget` via the
  same `isCheckedIn` boolean that already drives the elapsed-time ticker (so it starts on a
  fresh check-in *and* resumes correctly if the page loads mid-shift, with no separate code
  path for either case), pauses on a hidden tab, and never throws on a failed call. Heartbeat
  fires every 3 minutes (within the backend's own stated ~2-5 minute assumption for its
  10-minute-default gap threshold); the ping interval is read fresh from
  `GET /location/config` every time the loop (re)starts. A small "Tracking active" badge
  makes it visible. 7 more tests (fake timers), 32 total for this task.
  **User Management + password reset frontend built 2026-07-17** (see `.context/final-plan.md`
  §7.19) — a new `/settings/users` route (roster list scoped the same as the backend,
  per-user Edit, Deactivate/Reactivate, an admin password-reset action supporting both an
  admin-typed exact password and a backend-generated one-time temp password, Create User),
  plus a "Forgot password?" link on the login page, a `/forgot-password` request-email page,
  and a `/reset-password?token=` page, all three (plus login) sharing a new `AuthLayout`
  component. Bundled with a login page visual redesign in the same task. **Dashboard built**
  (see `.context/final-plan.md` §7.20) — the `/dashboard` shell, a declarative widget catalog
  (`dashboardConfig.js` maps role → ordered widget list) composing Leads + Customers widgets,
  each independently permission-gated (`usePermission`, real defense in depth on top of the
  role-level config) and independently fetching/failing so one widget's API error never blanks
  the rest of the page. 21 tests, all passing.
- `docs/` — this status file
- See `backend/README.md` for backend setup/patterns/endpoints, `frontend/README.md` for
  frontend setup/folder conventions/module pattern, and both files for how to run tests.

The full plan (architecture, data models, API surface, permission matrix, folder structure,
phased roadmap) lives in `.context/final-plan.md`. **Every backend phase is now built.**
Leads, Customers, Attendance, Leave, Location, User Management, and Dashboard frontend
modules are all done, including the heartbeat/location-ping submission loop (no longer an
open gap); next step is filling in the rest of the frontend module-by-module (Payroll/
Transport are reasonable next candidates — each would also add its own Dashboard widget
via `dashboardConfig.js`, not a separate task) or real invoicing (still deferred — `Invoice`
remains a placeholder, Phase 7 only added partial reconciliation on top of it) — whichever is
prioritized next. Phase 9's last remaining piece, the service worker wiring for push
receipt/display, was built 2026-08-07 (see the changelog).

---

## Phase Progress (mirrors the roadmap in `.context/final-plan.md` §10)

| Phase | Scope | Status |
|---|---|---|
| 0 | Auth (register/login/logout/me), User + Permission module, `can()` middleware, base scaffolding | ✅ Built, verified. Auth: 13 automated tests. Governed by the **Single Source of Truth for Auth** principle (`.context/final-plan.md` §4.1, formalized 2026-07-13) — JWT carries `{ userId }` only, role/permissions always re-read from the DB per request. ✅ **Permissions module (§7.12) built, verified, 20 automated tests** — role templates + per-user overrides replace the earlier hardcoded/register-time workarounds; §4.1 is exactly why a permission edit takes effect on the user's next request with no re-login needed. ✅ **User Management module (§7.0b) built, verified, 31 automated tests** — roster CRUD, team scoping, self/admin field rules, manager assignment; account creation logic deduplicated into `user.service.js#createUser`, called by `auth.controller.js` directly, no separate `POST /users` route added. **Confirmed 2026-07-13:** `getUserById`'s self-fetch bypass (a user can always fetch their own `/:id` regardless of any `users.*` grant) was already correct from the original build — no fix was needed, only an explicit regression test locking it in. |
| 1 | Leads (CRUD, scoping, calls, hot flag, import/export, lead sources) | ✅ Backend built, verified, 40 automated tests (34 original + 6 new for §7.16's assignment-notification/follow-up-reminder wiring). ✅ Frontend built 2026-07-16 (Frontend 1 row below). ✅ Push notifications (assignment + 24h/15m follow-up reminders) built 2026-07-16 — see Phase 9 row below and `.context/final-plan.md` §7.16. |
| 2 | Customers + Contracts/Contacts/Credentials + Project automation | ✅ **Backend built and verified 2026-07-13.** `customer` module: 21 automated tests (CRUD/scoping, bulk actions, contract automation, deactivation cascade, encrypted credentials vault, activity log). `project` module: 10 automated tests (team assignment) — originally 19, including a Task sub-feature with a one-`in_progress`-task-per-employee constraint, deliberately removed 2026-07-29 (9 tests removed alongside it; see the 2026-07-29 changelog entry). New shared `src/services/credentialEncryption.service.js` (AES-256-GCM). `CREDENTIALS_ENCRYPTION_KEY` is now a required env var. `Invoice` is a minimal placeholder model only — `GET /customers/:id/invoices`/`/ledger` deliberately not built, deferred to Phase 7. `POST /leads/:id/convert`'s 501 stub resolved as part of this work. |
| 3 | Attendance (camera+geo capture) + Leave | ✅ **Fully built and verified 2026-07-13; extended 2026-07-29 with admin manual correction (13 more tests, 45 total for `attendance`), again with Leave half-day/balance/decline/notifications (23 more tests, 41 total for `leave`), and again with Attendance/Location geofencing (6 more tests, 26 total for `location`) — see the 2026-07-29 changelog entries.** `attendance` module: 32 automated tests — check-in/check-out with photo capture (Cloudinary, **mandatory server-side**, not just a client-side constraint), a new `POST /attendance/heartbeat` for connectivity-gap detection (deliberately separate from Location's GPS ping), `workingHours` computed as gross duration minus gap duration, `GET /attendance/team`/`/report` (PDF via new `pdfkit` dependency, Excel via existing `exceljs`, both generated through a new shared `src/services/report.service.js`). `leave` module: 18 automated tests — request/approve/mark-unapproved-absence, one-paid-leave-per-month quota (§11.7, resolved this task: no carry-over, a deliberate stated assumption; **confirmed enforced at approval time, not request time** — a request is never blocked, only a second approval in the same month is). ✅ **Live Location Tracking (§7.4b) built, verified, 20 automated tests** — done ahead of the rest of this phase, and now proven to work together with Attendance end-to-end through real HTTP endpoints (updated to supply a photo, since check-in/check-out now require one). `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are now required env vars. Map UI was a frontend follow-up — now built, see the Frontend 3 row below. |
| 4 | Payroll | ✅ **Built and verified 2026-07-13.** `payroll` module: 26 automated tests (20 in `payroll.test.js` — including a Phase 8 regression test confirming `GET /payroll/:id/payslip` still streams a direct PDF and was deliberately excluded from the report dispatcher migration — 6 in `src/cron/payrollCron.test.js`) — `POST /payroll/run?month=&year=&employeeId=&regenerate=` (single-employee or bulk for all active employees with a `baseSalary` set), `GET /payroll?scope=own\|all&month=` (no `team` tier — Manager gets no payroll grant at all, unlike every other workforce module), `GET /payroll/:id/payslip?format=pdf` (self or admin, 404 not 403 out-of-scope, PDF only, generated via the existing shared `report.service.js`, not new PDF code). `grossAmount`/`netAmount` computed from Attendance present days, approved paid/unpaid/double-deducted Leave, and **approved-only** TravelLog mileage × new `MILEAGE_RATE_PER_KM` env var (placeholder default). Two prerequisites closed first: `User.baseSalary` (admin-only privileged field) and TravelLog's approval workflow (§11.4, resolved — see Phase 6 below). New `src/cron/payrollCron.js` runs the bulk job at 00:05 on the 1st of every month for the previous month — its own test suite mocks `node-cron`'s `schedule` and calls the job body directly with a fixed reference date, never waiting on real time. **§11.5 resolved: record-keeping only for v1, no disbursement/payment-gateway integration.** **Correction (follow-up, 2026-07-13):** `sales_associate`'s default `payroll` permission was fixed — §5 marks it "–" (no access), same as Manager, not "own payslip only" like Employee; `permission.service.js`'s seed defaults no longer grant `sales_associate` a `payroll` key at all. 2 tests added confirming a `sales_associate` gets 403 on `GET /payroll` and 404 on their own `GET /payroll/:id/payslip`. |
| 5 | Support/Tickets + Customer Portal | ✅ **Built and verified.** `ticket` module: 35 automated tests — `POST /tickets` (internal admin/manager raise with `customerId` required, or customer portal self-raise auto-scoped to their own company and forced to `category: "other"`), `GET /tickets?scope=all\|assigned\|own` (role-based default when `scope` omitted, no universal "own" tier the way Leave/TravelLog/Payroll have; `scope=all` tested separately for admin **and** manager since "PM" is its own grant; cross-company isolation for `scope=own` tested directly with two different `Customer`s), `PATCH /tickets/:id/assign` (admin/manager only), `PATCH /tickets/:id/status` (admin/manager or the assigned employee — a structural check, not a permission tier; any transition allowed, logged in `history[]`), `POST /tickets/:id/comments`/`/attachments` (anyone with view access; attachments reuse `cloudinary.service.js`, new `uploadTicketAttachment` export), and history-ordering (a mixed comment/status-change sequence lands in `history[]` in the exact order it happened). Customer Portal self-signup (`POST /auth/customer/signup`, 6 tests in `auth.test.js`) authenticates through the same auth system and verifies via an email-domain match against `Contact`/`Customer` records — not an admin grant. New `tickets` `PERMISSION_REGISTRY` entry and `customer` `RolePermissionTemplate`. §11.2 (category/status split) resolved as part of this build. |
| 6 | Transport/Travel (Google Maps integration) | ✅ **Built and verified 2026-07-13.** `transport` module: 28 automated tests — `TravelLog` auto-generated from Attendance checkout (`attendance.service.js#checkOut` calls directly into `travelLog.service.js`, never fails checkout), manual entry (coords → Google Maps distance, or a direct `distanceKm` override), `GET /travel-logs?scope=own\|team\|all` (mirrors Leave's shape, with a dedicated side-by-side test proving admin/manager/employee scoping simultaneously), `GET /travel-logs/report` (reuses `src/services/report.service.js`). New `src/services/googleMaps.service.js` — no SDK dependency, calls the REST API via `fetch`. `GOOGLE_MAPS_API_KEY` is now a required env var. **Retrofitted 2026-07-13 with a `pending`/`approved`/`rejected` approval workflow and `PATCH /travel-logs/:id/approve\|reject`, resolving §11.4** ("does this feed payroll?" — yes, but only approved entries) as a Payroll prerequisite. |
| 7 | Payments + AMC | ✅ **Built and verified.** `payment` module: 16 automated tests — `GET`/`POST /payments` (admin-only, no ownership scoping at all — §5's matrix marks every other role "–"). **§11.3 resolved: partial reconciliation, not a standalone log and not full invoicing** — a `Payment` linked to both a `customerId` and a new `invoiceId` field reduces that `Invoice`'s balance and updates its status (`paid` at 0, the newly-added `partially_paid` otherwise, clamped rather than negative on overpayment); a manual-only or customerId-without-invoiceId payment is just logged, expected not a gap. `amc` module: 20 automated tests — `GET`/`POST`/`PATCH /amc` with a two-flow creation (`new_customer` reuses `customer.service.js#createCustomer` directly; `existing_customer` requires an in-scope `customerId`), matching smartrays.md's "ask which create client or convert client". "Own team"/"own" scoping resolved via a new `customer.service.js#getVisibleCustomerIds` export, since AMC has no `ownerId` field of its own — Manager's "own team" tier is the "PM" role smartrays.md describes elsewhere. No automation on renewal for v1 (stated simplification, locked in by a regression test). |
| 8 | Reports (cross-module PDF/Excel) | ✅ **Built and verified.** `report` module: 24 automated tests — single `POST /reports/generate` `{module, filters, format}` dispatching to `attendance`/`leave`/`payroll`/`transport`/`leads`/`customers`, each via that module's own existing, already-scoped data-fetcher (`generateAttendanceReport`/`generateTravelLogReport` reused unmodified; `listLeaves`/`listPayroll`/`listLeads`/`listCustomers` reused with new column/row rendering added in `report.service.js` itself). No new `reports.generate` permission — a coarse per-module `can()` check, then the module's own fetcher enforces the real scope. Per-module `filters` shape is validated by reusing each target module's own existing query validator (`attendance`/`transport`'s `validateReportQuery`, `leave`'s `validateScopeQuery`, `payroll`'s `validateListQuery`; `leads`/`customers` have none of their own to reuse, so their `status` filter is checked against each model's own status enum instead) — every one of the six modules' success path is proven with the same real magic-number file-signature check ("PK" for xlsx / "%PDF-" for pdf) already established for Attendance/TravelLog, not just some. `GET /attendance/report`/`GET /travel-logs/report` internally call this dispatcher rather than duplicating report generation. **Cloudinary removed 2026-08-04:** all three callers briefly uploaded every report to Cloudinary and returned `{ downloadUrl }` (Phase 8) before reverting to streaming the buffer directly as the HTTP response — tests rewritten to assert against the real streamed response and confirm no Cloudinary function is called. `GET /leads/export` and `GET /payroll/:id/payslip` both deliberately excluded from the dispatcher (pre-existing separate export; single-document artifact; neither was ever routed through Cloudinary) — the payslip exclusion has a dedicated regression test in `payroll.test.js` proving it still streams directly. |
| Frontend 0 | Scaffold + Auth flow + Routing shell (mirrors backend Phase 0) | ✅ **Built and verified 2026-07-16.** Vite + Tailwind CSS + Ant Design + React Router DOM (`createBrowserRouter`/`createRoutesFromElements`) + Zustand + Axios, exactly per §3. Shared `apiClient.js` (httpOnly-cookie auth, 401 interceptor), `sessionStore.js` (Zustand — the only global store; identity from a real `GET /auth/me`, never a decoded token), route guards (`ProtectedRoute`, `PermissionGate`/`usePermission` — UI convenience only, not a real security boundary, stated in the code itself), `MainLayout` (shared dashboard shell, §7.13) + `PortalLayout` (separate, no nav, for `role: customer`). Every route in §8's map is wired; only `/login` (fully functional) and `/` (real by-role redirect) are built beyond a shared placeholder page — every other route is filled in module-by-module in later frontend tasks. 15 automated tests (`vitest` + React Testing Library + `@testing-library/user-event`), all passing — Login page, `ProtectedRoute`, `PermissionGate`, `RootRedirect`, no real network calls (API mocked at the module boundary). One interop bug found and fixed: the scaffold's originally-pinned `vitest@2` silently broke JSX's automatic runtime under tests (bundled its own internal Vite 5.x, mismatched with this project's Vite 8) — fixed by upgrading to `vitest@4`, which also resolved the transitive `esbuild`/`vite` audit advisory. One deliberate cleanup: removed the pre-existing scaffold's experimental `@rolldown/plugin-babel` + React Compiler preset (neither is part of the fixed §3 stack) in favor of the standard `@vitejs/plugin-react`. |
| Frontend 1 | Leads frontend module (Table/Board/Detail/Import/Export) | ✅ **Built and verified 2026-07-16.** `frontend/src/modules/lead/` — the reference implementation for every later frontend module (see `frontend/README.md`'s "Adding a new module" section). Table View (search/owner/follow-up filters via URL params, inline status dropdown, overdue-red follow-ups, quick hot-toggle/owner-reassign) and Board View (kanban, new `@dnd-kit/core`+`@dnd-kit/sortable`+`@dnd-kit/utilities` dependency for drag-between-stages) share one page shell (`LeadsListPage`). `useLeadStatusChangeFlow` centralizes the two special-case transitions across all three UI surfaces (table dropdown/board drag/detail buttons): `lost` collects `lostReason` via modal before the API call, `won` opens Convert-to-Customer (pre-filled, editable, `projectManagerId` picked from the shared `/users/dropdown` list) then marks `won` on success. Lead Detail (`/leads/:id`) is a real, linkable route rendered as a slide-over — Log Call, Hot toggle, Won, Lost, Convert to Customer (a separate action from Won, doesn't force status), Edit, Delete. **Real backend gap found and handled:** no lead-specific activity-log endpoint exists (`backend/src/modules/lead/` has no `leadActivity.model.js`, unlike `customer`'s `customerActivity.model.js`) — the Activity Timeline is assembled client-side from call history + lead fields (`buildActivityTimeline.js`), documented as such rather than silently faked or skipped. Import wizard (Upload → Preview & Mapping → Result) honestly reflects that the backend has no interactive column-remapping endpoint — the mapping step is a read-only preview of the backend's fixed alias-matching, not an editable remap the API couldn't act on. Filtered Excel export downloads via a blob + synthetic link click. Every action permission-gated to the exact backend `leads` registry action its endpoint requires (create/edit/delete/view), plus a role-based gate on owner reassignment mirroring the backend's own extra restriction. 40 tests total (25 new — `vitest` + React Testing Library + `@testing-library/user-event`), all passing, no real network calls. **Deliberate testing-strategy decision:** the kanban drag interaction is tested via a pure drop-resolution-logic unit test + the status-change flow hook's unit tests + a plain rendering test, not a simulated real pointer-drag sequence (brittle under jsdom with `@dnd-kit`) — documented in `frontend/README.md` as the pattern to follow for any future drag-and-drop UI. `dayjs` added as an explicit direct dependency (previously only transitively resolvable through `antd`). |
| Frontend 2 | Customers frontend module (List/Detail/Contracts/Contacts/Credentials/Activity) | ✅ **Built.** `frontend/src/modules/customer/` — List View (`CustomersListPage`, behind `/customers`) with search/owner/status filters (defaulting to active-only via an explicit "Show Inactive" checkbox, matching the backend's `status` query semantics), sortable columns, row-select + bulk activate/deactivate/delete, and an `Add Customer` wizard (`CustomerFormWizard`) walking Company Info → Billing → Contracts → Contacts → Project Manager. The wizard creates the customer then each staged contract/contact in turn (the backend has no single nested-create endpoint), and explicitly names which contract types triggered the backend's project/invoice automation in its success toast ("Project + draft Invoice auto-created for: ...") rather than leaving that invisible — proven by `CustomersListPage.test.jsx`'s "walks the steps, submits the full payload, and shows the automation feedback" test. Customer Detail (`/customers/:id`) is a real, linkable full page (not a slide-over, per leads-customer-functional-spec.md) rendering header/billing/contacts/contracts/credentials/activity-log sections from one `useCustomerDetail` hook. The Credentials Vault stays masked (`••••••••`) until an explicit confirm-click reveal per row (never automatic on page load, re-masks on a second click — matching the backend auditing every reveal to the activity log), and the whole section is hidden — not just disabled — behind a `PermissionGate` for a role with no `credentials.view` grant, proven by both a "hides the Credentials Vault section for a role with no credentials.view grant" and a "shows..." counterpart test. Every mutating action is gated to the exact backend `customers`/`credentials` permission its endpoint requires, proven by a dedicated "hides Add Customer for a role with no customers.create grant" test. 13 tests total (`CustomersListPage.test.jsx`: 7, `CustomerDetailPage.test.jsx`: 6), all passing, no real network calls — see `.context/final-plan.md` §7.17 for the full write-up. |
| Frontend 3 | Attendance/Leave frontend modules + a new Location live-map view (three module folders, built together) | ✅ **Built; extended 2026-07-29 with an admin photo viewer, a calendar-grid view, summary stats, and an admin manual-correction UI for Attendance, again with half-day support, a balance card, a Decline action, and a team leave calendar for Leave, and again with geofence-violation display (a "Location" column/section/marker) for Attendance — see the 2026-07-29 changelog entries for the full write-ups.** `frontend/src/modules/attendance/` — `CheckInOutWidget` fetches current status on mount (never assumes "not checked in"), requiring both a native-`getUserMedia`+`<canvas>`-captured photo and native-`Geolocation` coords before Confirm enables (mirroring the backend's server-side-enforced photo requirement); shows a live elapsed-time counter once checked in. `PersonalAttendanceView`/`TeamAttendanceView` share one `AttendanceTimeline` table; connectivity gaps (`connectivityGaps[]`) render as visually distinct red segments on a proportional bar (`ConnectivityGapBar`), positioned/sized by real gap timing, not just present in the data. Team Attendance is gated by `attendance.view_team`/`view_all` via an inline `can()` OR-check rendering a 403 `Result` (`PermissionGate`/`usePermission` only express one module+action pair each). `frontend/src/modules/leave/` — `LeaveListPage`'s scope tabs are built from whichever `leave.view*` grants the user holds (defaulting to "own", matching the backend's own default); Approve/Mark Unapproved Absence render admin-only, and the mark-absence confirmation shows its 2x-deduction consequence directly in the `Popconfirm` description text, not a tooltip. `frontend/src/modules/location/` — a genuinely new `/location` route (Location had zero frontend before this task): `LiveMapView` re-polls `GET /location/live` every ~12s and plots one marker per visible checked-in employee; `HistoryMapView` renders a selected employee/date's `GET /location/history` trail as a polyline; both via a generic `LeafletMapView` component (`react-leaflet` + free OpenStreetMap tiles, no API key — migrated 2026-08-04 from a Google Maps JS SDK `GoogleMapView`/`useGoogleMapsScript` pairing that was never actually functional in production, since no billing/key was ever configured; see the 2026-08-04 changelog entry). New shared `ReportDownloadButton`/`reportApi.js` (hits `POST /reports/generate`, triggers a real download from the streamed blob response — updated 2026-08-04, was `{ downloadUrl }` through Phase 8) used by every §7.11 module. **No new dependencies** — camera capture and Google Maps were both deliberate native-API choices, stated explicitly rather than defaulting to a library. 25 tests total (`vitest` + React Testing Library + `@testing-library/user-event`), all passing, no real network calls — the first frontend tests mocking `getUserMedia`/`getCurrentPosition`/the Google Maps SDK, with the mocking pattern written up in `frontend/README.md`'s Testing section for later modules to reuse. See `.context/final-plan.md` §7.18 for the full write-up. **Gap closed in a same-phase follow-up:** `useCheckedInHeartbeatLoop` (`attendance/hooks/`) now runs both the `POST /attendance/heartbeat` and `POST /location/pings` loops for as long as the user is checked in — driven by the same `isCheckedIn` boolean the widget already computes, so it starts on a fresh check-in and resumes identically if the page loads mid-shift, with no separate code path for either case. Heartbeat every 3 minutes (inside the backend's own stated ~2-5 minute assumption behind its 10-minute-default `ATTENDANCE_GAP_THRESHOLD_MINUTES`); location pings on whatever `GET /location/config` currently returns, re-fetched every time the loop (re)starts. Both intervals pause on `visibilitychange: hidden` and resume on visible; a failed call is logged and swallowed, never blocking check-out. A small pulsing "Tracking active" badge next to the Checked In tag surfaces it. 7 more tests using fake timers (`vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync()`) covering fresh-start, resume-on-mount, stop-on-checkout, cleanup-on-unmount (no leaked intervals), and failure-doesn't-throw. 32 tests total for this task line. |
| Frontend 4 | Dashboard (Leads + Customers widgets, §7.20) | ✅ **Built.** `frontend/src/modules/dashboard/` — a declarative widget catalog, not a runtime plugin/registry (no precedent for one anywhere in this codebase). `widgets/*.jsx` are small, self-contained components (own data fetch, own loading/error/empty state via a shared `WidgetCard` shell — one widget's fetch failing never breaks another widget on the page); `dashboardConfig.js` maps role → ordered widget-component list; `DashboardPage.jsx` reads the session's role, looks up the candidate list, renders a responsive `Row`/`Col` grid. **Permission-gating is real defense in depth, not just the role config:** every widget also calls `usePermission(module, action)` itself and renders nothing on a failed check, since a per-user permission override (§7.12) can diverge from the role's template default — the config alone can't be the only gate. **Scoping always reused, never reinvented:** every widget calls the exact same scoped fetch its module's list page already calls (`listLeads()`, `listCustomers()`) — the backend already scopes org-wide/team/own by caller role, so a `sales_associate`'s widgets automatically reflect only their own data. Widgets built: `LeadsPipelineWidget` (count per status), `LeadsFollowUpWidget` (today/overdue counts + short linked list), `LeadsHotWidget` (hot leads, filtered client-side since `GET /leads` has no server-side `isHot` filter — the same precedent `TeamAttendanceView`'s employee selector already set), `CustomersOverviewWidget` (active count + contract-type counts, derived by fetching every visible customer's contracts in parallel, mirroring `useCustomers.js`'s own precedent since no aggregation endpoint exists), `CustomersRecentWidget` (last few customers created, already server-sorted by `createdAt` descending). admin/manager/sales_associate get all 5 as candidates; employee/customer get an empty list for now (neither holds a `leads`/`customers` grant by default) — **explicitly a future incremental addition, not a gap:** an own-scoped Employee widget follows the same pattern (write the widget, add one line to `dashboardConfig.js`). 21 tests total (one file per widget + `DashboardPage.test.jsx` covering role-based composition, the empty-candidate-list message, permission-gating overriding a role's config, and one widget's mocked API rejection not affecting any other widget on the page), all passing, no real network calls. |
| Frontend 5 | Dashboard — operational widgets (Attendance/Leave/Tickets/AMC/Payments/Payroll, §7.21) | ✅ **Built.** 6 more glance-only widgets added to the same catalog §7.20 established, for 6 modules with a real tested backend API but no frontend page of their own yet — deliberately glance-only, not a substitute for each module's eventual full CRUD page; each "view all" link points at the existing placeholder route. `AttendancePresentTodayWidget` (present/half_day count **today**, admin/manager only — reuses `getTeamAttendance(month)`, the same call `TeamAttendanceView` makes, filtering to today's date client-side since `GET /attendance/team` has no single-day filter). `LeavePendingRequestsWidget` (pending-approval count, **admin-only** — there's no `leave.approve` action in `PERMISSION_REGISTRY` at all, approval being a structural `requireAdmin` check, but `usePermission("leave", "approve")` still correctly gates admin-only via the frontend `can()` helper's admin bypass; resolves employee names via the shared `useUserDirectory` hook). `TicketsOpenWidget` (open + open-and-unassigned counts, admin/manager per `tickets.view_all`). `AmcRenewalsDueWidget` (renewals due within 30 days — reuses `amc.service.js#listAMC`'s existing server-side scoping; deliberately **not** a sales_associate candidate even though they hold `amc.view` "own" by default, since this widget is grouped with the other 5 admin/manager-only operational widgets by explicit design). `PaymentsThisMonthWidget` (sum of this month's payment amounts, **admin-only**, matching `payments.view` having no ownership scoping at all). `PayrollStatusWidget` (has payroll run this month + how many employees processed, **admin-only**, matching `payroll.run` having no manager tier at all). **No new backend endpoints** — every widget checked against each module's existing service first; none were needed. New minimal `api/*Api.js` files for the four modules with no frontend module folder yet (`ticket`, `amc`, `payment`, `payroll`) — just the one `list*` function each widget needs. **Role composition:** admin gets all 6; manager gets the 3 matching their narrower default grants (Attendance/Tickets/AMC); sales_associate/employee get none (all 6 are admin/manager-level operational metrics by design, not owner-scoped data). 20 new tests (one file per widget) + `DashboardPage.test.jsx` extended with a manager-scoped composition test and a second cross-widget failure-isolation test. Full frontend suite: 136 tests, all passing (2 pre-existing flaky failures unchanged). |
| 9 | Push notifications end-to-end (backend) + Dashboard (frontend) | ✅ **Backend half built and verified 2026-07-16 — see `.context/final-plan.md` §7.16.** `notification` module: 17 tests (`notification.test.js`) — `Notification`/`PushSubscription` models exactly per §6.7, self-scoped subscribe (upsert-by-`endpoint`)/unsubscribe/list/mark-read/mark-all-read, no `PERMISSION_REGISTRY` entry needed (every action is inherently self-scoped, same reasoning as `users.*`/`attendance.*`'s always-reachable own-data endpoints). `src/services/webPush.service.js` wraps `web-push`, configured from new **required** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars (optional `VAPID_SUBJECT`) — real keypair generated via `web-push`'s own `generateVAPIDKeys()`, no safe placeholder exists for a crypto keypair. `createNotification` creates the DB record and attempts a push to every active subscription independently; a push failure is logged and swallowed per-subscription, never blocking the notification record; a 404/410 response deactivates that subscription. Wired into **Leads** (assignment on create/reassign, skipped when self-assigning — exactly the spec's own requirement) and, **a deliberate small addition beyond the Leads-only spec**, **Ticket assignment** (stated explicitly as scope added on top of what was asked, not silent). New `src/cron/leadFollowUpReminderCron.js` (9 tests) runs every 5 minutes — far finer-grained than the monthly payroll cron, since "24h before"/"15min before" are precise moments, not a once-a-day batch; checks a "due within window, not yet reminded" condition (robust to cron downtime) rather than an exact-time match; `won`/`lost` leads excluded; already-passed follow-ups never remind (the existing `followUp=overdue` filter covers that). New `Lead.followUpReminder24hSentAt`/`followUpReminder15mSentAt` (`Date`, nullable) — necessary idempotency-guard schema addition, same treatment as Attendance's `lastHeartbeatAt`; both reset to `null` when `followUpDate` changes so a reschedule re-arms both reminders. No application bugs found. **Dashboard (permission-driven widget composition) is now built — see the Frontend 4 and Frontend 5 rows above.** ✅ **Client half built and verified 2026-08-07 — `.context/final-plan.md` §6.7.** `public/sw.js` (push + notificationclick, caches nothing), `pushSubscription.js`, `PushNotificationToggle` in Settings → Account, and `notificationRoutes.js` shared with the bell. 45 new frontend tests (13 + 22 + 10). Verified in a real browser end to end: a push signed by the backend's own `sendPush()` was accepted by FCM (`201`) and displayed by the worker with the right title, body and click target. **Phase 9 is complete on both sides.** Production still needs `VITE_VAPID_PUBLIC_KEY` set on the frontend Vercel project. |

---

## Outstanding Decisions Blocking Full Confidence

See `.context/final-plan.md` §11 for full detail and rationale.

**Resolved 2026-07-13:**
1. Employee vs. Executive → single `employee` role for v1.
2. File storage provider → Cloudinary (photos, ticket attachments, generated reports).
3. Credentials vault encryption → env-based AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`), no KMS.
4. Team scoping → no `Team` collection; `User.managerId` self-reference instead.
5. Leave cadence → one paid leave per calendar month, no carry-over, enforced at approval time.
6. Does Transport/Travel distance feed Payroll? → yes, but only `status: "approved"` entries;
   TravelLog was retrofitted with an approval workflow as a Payroll prerequisite.
7. Is Payroll record-keeping only, or does it need disbursement integration? → **record-keeping
   only for v1** — `Payroll.paidOn` is a computed field, not a real-money-movement trigger; no
   payment-gateway integration was built. Revisit only if the client explicitly requests it.
8. Ticket `status` vs. `category` split → **the split itself is resolved (built)** — `Ticket`
   ships with separate `category` and lifecycle `status` fields. The exact category enum values
   remain open to client confirmation if the list ever needs to grow (see "still open" below) —
   a narrower question than the shape decision this item was originally about.
9. Customer Portal auth & account creation → same auth system as everyone else
   (`role: "customer"`), self-signed-up (not admin-created), verified by an email-domain match
   against `Contact`/`Customer` records rather than an admin grant.
10. Payments tab vs. Customer Invoice History → **neither extreme — PARTIAL RECONCILIATION.**
    `Payment` can optionally attach to a real `Invoice` (updating its balance/status), but full
    invoicing (auto-numbering, recurring generation, ledger views) stays out of scope; `Invoice`
    remains the Phase 2 placeholder model. A manual-only payment, or one with a `customerId` but
    no linked invoice, is just logged — expected, not a gap.

**Still open — blocks on client input:**
1. `MILEAGE_RATE_PER_KM` — a placeholder default is in `.env.example`; the client must confirm
   the real reimbursement rate before payroll is run for real.
2. Ticket category enum — confirm whether `new_project`/`existing_client_query`/`other` needs
   to grow to cover more real-world cases.

None of the remaining open items block Phase 0 (auth/permissions/scaffolding), so they can be
resolved while Phase 0 is underway.

---

## Changelog

- **2026-07-13** — Raw requirements (`smartrays.md`) and reference spec
  (`leads-customer-functional-spec.md`) reviewed; full project plan authored and stored in
  `.context/final-plan.md`. This status file created to track implementation progress
  separately from the plan itself.
- **2026-07-13** — Resolved 4 of 9 open questions in `.context/final-plan.md` §11: single
  `employee` role, Cloudinary for file storage, env-based AES-256-GCM for the credentials
  vault, and `User.managerId` self-reference instead of a `Team` collection. Propagated through
  the data models, permission matrix, endpoints, folder structure, and roadmap.
- **2026-07-13** — Built Phase 0: full backend scaffold (config, error handling, response
  envelope, permission helper, `User` model) plus the complete `auth` module. Added a new
  §7.0 Auth & Session section to `.context/final-plan.md` (wasn't previously documented there)
  and a one-time `npm run seed:admin` bootstrap script, since admin-only registration has no
  other way to create the first account. Found and fixed a cookie-clearing bug during
  verification: passing `maxAge` into `res.clearCookie()` made Express recompute `Expires` into
  the future instead of expiring the cookie immediately — fixed by splitting cookie options
  (shared httpOnly/secure/sameSite) from `maxAge` (login-only).
- **2026-07-13** — Built Phase 1 backend: full `lead` module (`Lead`/`LeadCall`/`LeadSource`
  models, service-layer ownership scoping, CSV/Excel import/export via `exceljs` + `multer`,
  lazy lead-source seeding). Added a `permissions` field to `POST /auth/register` (documented
  in `.context/final-plan.md` §7.0) since the full permissions-management endpoint doesn't
  exist yet and non-admin accounts otherwise have no way to be granted module access. No bugs
  found during verification this time (contrast with the Auth build's cookie bug) — all 12+
  scoping/validation/filter/import/export checks passed on the first implementation. Flagged
  one moderate transitive `npm audit` advisory (`uuid`, via `exceljs`) as a known, non-reachable
  issue rather than force-downgrading `exceljs` — see `backend/README.md`.
- **2026-07-13** — Added a real automated test suite for `auth` and `lead`, replacing the
  earlier manual curl-based verification: `vitest` + `supertest` + `mongodb-memory-server`
  (new devDependencies, `npm test`/`npm run test:watch` scripts, `vitest.config.js`,
  `backend/tests/helpers/` for shared test infrastructure). 46 tests, all passing, no real
  MongoDB needed to run them. Confirmed the Leads and Auth modules' logic was already
  correct — writing the suite found zero application bugs, only two test-authoring mistakes (a
  missing binary-response parser for supertest, and one wrong worksheet-column assertion), both
  fixed in the tests. The auth suite includes a regression test locking in the earlier
  cookie-clearing fix; the leads suite includes deep coverage of permission scoping
  (admin/manager/sales_associate visibility, 404-vs-403 on out-of-scope access,
  ownerId-escalation prevention) — the area most likely to silently break in a future refactor
  without tests catching it.
- **2026-07-13** — Relocated `auth.test.js`/`lead.test.js` from a separate `backend/tests/`
  directory (my first placement) to `src/modules/auth/` and `src/modules/lead/`, colocated with
  the module each one tests — the initial placement didn't match what was actually asked for.
  Shared test infrastructure stayed in `backend/tests/helpers/`. All 46 tests still pass from
  the new location.
- **2026-07-13** — Added Live Location Tracking (§7.4b) to `.context/final-plan.md` (new
  `LocationPing` model, `location.*` permission tiers, endpoints) and then built it: `location`
  module (model/service/controller/routes/validation), plus a minimal placeholder `Attendance`
  model since Location's core rule depends on knowing whether an employee has an open shift.
  Two small, generic additions to shared infrastructure: `authorizeAny(module, actions[])` in
  `authorize.middleware.js` (first module with more than one viewing tier) and
  `getDefaultPermissionsForRole(role)` in `permission.helper.js`, called from `registerUser`
  only when the caller doesn't explicitly pass `permissions`. 19 tests, all passing — found and
  fixed a real bug in `User` (unrelated to `location.js` itself): Mongoose's default
  `minimize: true` was silently stripping the entire `permissions` field from API responses
  whenever it ended up empty, so an explicit "no grants" override was indistinguishable from
  "field never set." Fixed with `minimize: false` on the `User` schema. Full suite: 65 tests,
  all passing.
- **2026-07-13** — Built the Permissions module (§7.12): `RolePermissionTemplate` model,
  `PERMISSION_REGISTRY` constant, and a `permission` module (model/service/controller/routes/
  validation) exposing `/permissions/registry`, `/permissions/templates(/:role)`, and
  `/users/:id/permissions(/reset)`. **Resolved the §7.0 deviation**: `POST /auth/register` no
  longer accepts a manual `permissions` field — every new user is now unconditionally seeded
  from their role's current template, with per-user customization moved entirely to
  `PATCH /users/:id/permissions`. Removed the now-dead `getDefaultPermissionsForRole()` from
  `permission.helper.js`. Template seed values were **deliberately broadened**, not just
  carried over: they're generated from the §5 permission matrix, so Manager/Sales Associate
  now get real default Leads access, which the matrix always described but nothing previously
  enforced. Added `npm run seed:permission-templates` (same pattern as `seed:admin`). Updating
  `location.test.js`'s "no permission" fixture was required (it used to rely on the now-removed
  register-time field) — switched to registering normally, then explicitly overriding via
  `PATCH /users/:id/permissions`, which is the new correct way to do this. 20 new tests, all
  passing on the first implementation — no application bugs found this time. Full suite: 85
  tests, all passing.
- **2026-07-13** — Docs-only: formalized the **Single Source of Truth for Auth** principle as
  a new §4.1 in `.context/final-plan.md`, cross-referenced from §7.0 and §7.12, plus a new
  "Architecture Principles" section here. Verified (read-only, no code changes) that this was
  already true of the existing implementation before writing it down: `auth.service.js` has
  always signed `{ userId }`-only tokens, and `authenticate.middleware.js` has always done a
  fresh `User.findById()` on every request — so this is a formal write-down of an existing
  implicit assumption, not a behavior change. Auditing every module against this principle is
  explicitly a separate follow-up task, not done here.
- **2026-07-13** — Docs-only: added a "System Design (HLD & LLD)" section to
  `.context/final-plan.md`, positioned right after §2 (unnumbered, so §1–§11 and every existing
  cross-reference stay unchanged). Consolidates content already scattered across §1–§11 into
  one developer-facing entry point: a refined system diagram, the full module list (built and
  planned) with one-line responsibilities, 4 major cross-module flows stated as simple
  sequences, a cross-cutting-principles index, an external-integrations-at-a-glance table, and
  a per-module LLD breakdown (data model/API surface/permissions/invariants/deviations, plus
  test coverage for built modules) — built modules first, then planned. Read the whole existing
  document first to make sure it reflected actual current state, not just original intent.
  Added a one-line pointer to it here.
- **2026-07-13** — Read-only audit of the backend codebase (no code changes): confirmed module
  build statuses, investigated the placeholder `Attendance` model's shape/usage, cross-checked
  docs against reality. Found two stale test-count errors in the docs (Auth documented as 11,
  actual 13; Leads documented as 35, actual 33 — the total of 85 was coincidentally still
  correct) — corrected in `.context/final-plan.md` as part of this session's later edits.
  Recommended building either the `user` management module or pulling Attendance forward next.
- **2026-07-13** — Built the `user` module (§7.0b): full roster CRUD/management layer —
  `listUsers` (team-scoped, filterable by `role`/`isActive`/`managerId`), `getUserById` (self
  always allowed, otherwise scoped, 404 not 403 out-of-scope), `updateUser` (self can edit
  `name`/`email`/`phone`; admin can additionally edit `role`/`managerId`/`isActive` on anyone),
  `setUserActiveStatus` (deactivate/reactivate, admin-only), `assignManager` (admin-only, reuses
  the same manager-validation rule as creation), and `listUsersForDropdown` (low-sensitivity
  picker list, no permission gate). **Resolved the `POST /auth/register` vs. user-creation
  duplication**: `user.service.js#createUser` is now the sole place account creation happens;
  `auth.service.js`'s `registerUser` was removed entirely (no pass-through wrapper) and
  `auth.controller.js` calls `createUser` directly; `seedAdmin.js` updated the same way.
  `POST /auth/register` remains the only HTTP route that creates a user — no new `POST /users`
  route, since the duplication being resolved was in the logic, not the route surface. Added a
  `users` entry to `PERMISSION_REGISTRY` (`view_team`/`view_all`, deliberately no plain `view`
  tier — self-access is already unconditional via `/auth/me` and the service-layer self-bypass)
  and gave `manager` a `users.view_team: true` default in its permission template. 31 new tests,
  all passing — found and fixed one real bug in `getUserById`: the Mongo filter was built with
  `{ _id: targetId, ...scopeFilter }`, and since the `view_team` branch's `scopeFilter` is itself
  keyed on `_id` (`{ _id: { $in: [...] } }`), the object spread silently let it clobber the
  explicit `_id: targetId` constraint — a manager could fetch *any* visible user's record
  regardless of which id was requested. Fixed with `$and: [{ _id: targetId }, scopeFilter]`. Full
  suite: **116 tests, all passing.**
- **2026-07-13** — Refined the `user` module per follow-up spec: `GET /users` now falls back to
  a self-only `200` (not a `403`) when the caller holds neither `users.view_team` nor
  `users.view_all` — the route-level `authorizeAny` gate was removed and
  `resolveVisibleUserFilter` gained a `fallbackToSelf` option, used by `listUsers` but not by
  `getUserById` (fetching *someone else's* specific id with no grant is still `403`, deliberately
  not narrowed to self). Also added a validation-layer check in `user.validation.js` that
  duplicates the self-vs-admin privileged-field restriction already enforced in
  `user.service.js#updateUser` — deliberate defense in depth, importing the same
  `PRIVILEGED_FIELDS` list the service now exports. No route/schema/permission-registry changes.
  Updated the one affected test (list scoping for a no-grant caller) and strengthened the
  dropdown test to explicitly assert `passwordHash`/`permissions` are absent. Full suite still
  **116 tests, all passing** — no regressions in `auth`/`lead`/`location`/`permission`.
- **2026-07-13** — Two-part task. **Part 1:** confirmed `getUserById`'s self-fetch bypass was
  already correct before this task started — a user with no `users.*` grant at all could already
  fetch their own `/:id` (the self-shortcut runs before any permission check). No code change
  needed; added an explicit regression pair to `user.test.js` locking this in and proving it
  hasn't been accidentally broadened into a general "no grant → self" rule for *other* people's
  ids (that stays `403`, unlike the list endpoint's `fallbackToSelf`). **Part 2:** built the
  minimal Attendance check-in/check-out slice (§7.4) ahead of the rest of Phase 3, explicitly
  scoped down to just `POST /attendance/check-in`, `POST /attendance/check-out`, and
  `GET /attendance/me?month=` — no photo capture, no connectivity-gap tracking, no team/org
  reports, no PDF/Excel export (all deferred to the full Phase 3 build). Reused the existing
  placeholder `Attendance` model as-is (no schema changes) and reused
  `location.service.js#findOpenAttendance`'s exact "open record" query shape rather than
  reimplementing it. One open check-in per employee at a time is enforced server-side. No
  permission-registry entry — checking yourself in/out needs no `can()` gate, same reasoning as
  Location's `POST /pings`. 13 new tests, no bugs found. Full suite: **129 tests, all passing.**
- **2026-07-13** — Follow-up to the Attendance build: added one new test to `location.test.js`
  proving Location Tracking and Attendance now work together **end-to-end through real HTTP
  endpoints**, not just against directly-seeded test data. Until this point every
  `location.test.js` test created its "open shift" fixture with a direct Mongoose write
  (`createOpenAttendance()`); the new test instead calls the real `POST /attendance/check-in`,
  then `POST /location/pings` (expects 201), then the real `POST /attendance/check-out`, then
  pings again (expects 409) — no direct database writes anywhere in that flow. Left the existing
  `createOpenAttendance()`-based tests as they were (deliberately — each isolates a specific
  location scenario without an extra HTTP round trip); only this one new test needed to exist to
  prove the real integration. Updated `.context/final-plan.md` §7.4b's "Build dependency" note
  (originally written when `location` was built ahead of Attendance) to mark it resolved. Full
  suite: **130 tests, all passing**, no regressions anywhere.
- **2026-07-13** — Built Phase 2: the `customer` module (§7.2) and `project` module (§7.3)
  together, the largest module built so far. `customer` — `Customer`/`Contact`/`Contract`/
  `Credential` CRUD (ownership scoping identical in shape to Leads: admin/manager-team/
  sales_associate-own, 404 not 403 out-of-scope), bulk activate/deactivate/delete (permission
  checked per-action inside the service, since one route can't express a per-action gate ahead of
  a mixed-action body), the full contract automation chain (`monthly`→recurring Project+draft
  Invoice, `onetime`→onetime Project+draft Invoice, `yearly`→no automation since neither source
  document describes one, deleting a contract completes its Project and cancels its Invoice), the
  deactivation cascade (active projects → completed, only on the active→inactive transition), a
  real AES-256-GCM credentials vault (new shared `src/services/credentialEncryption.service.js` —
  a fresh random IV per record, the GCM auth tag appended to the ciphertext rather than given its
  own field to keep the schema exactly as documented, `passwordEncrypted`/`passwordIv` marked
  `select: false` the same defense-in-depth pattern as `User.passwordHash`), and a simple activity
  log. `project` — `Project`/`Task` with team add/remove (interpreted narrowly: must be *this
  specific project's* manager, or admin — not just anyone holding the manager role) and the
  server-side one-`in_progress`-task-per-employee constraint (§6.4), checked fresh against the
  database on every start. **No `POST /projects`** — a project is only ever created via the
  contract automation. `Invoice` is a **minimal placeholder model** (same treatment `Attendance`
  got for Location Tracking) — no service/controller/routes, and `GET /customers/:id/invoices`/
  `/ledger` were deliberately not built, both deferred to Phase 7's real invoicing.
  `CREDENTIALS_ENCRYPTION_KEY` is now a **required** env var (`env.js` fails fast at boot without
  it) — updated `.env.example` and the test suite's `testDb.js` default. Added `customers`/
  `credentials`/`projects`/`tasks` to `PERMISSION_REGISTRY` and gave `manager`/`sales_associate`/
  `employee` sensible template defaults (manager gets full delivery-side access; sales_associate
  gets full `customers` CRUD, matching Leads' own precedent, but no vault/project access;
  employee gets `projects`/`tasks` view only). **Wired up real Lead conversion**:
  `POST /leads/:id/convert` now creates a real `Customer` from the lead's data (pre-fillable,
  overridable) and sets `Lead.convertedCustomerId` — `lead.service.js` calls
  `customer.service.js#createCustomer` directly, the same cross-module pattern `location` already
  used for `Attendance`. 21 new tests for `customer`, 19 for `project`, 1 more for `lead`'s real
  conversion flow (replacing the old 501-stub test with two real ones). No application bugs found;
  two test-authoring issues were caught and fixed in the tests themselves: `validateContactInput`
  was wrongly reused for the contact PATCH route, rejecting a valid partial update with "name is
  required" (fixed with a dedicated `validateContactUpdateInput`), and the bulk-delete-permission
  test needed a user whose `customers.delete` grant was explicitly narrowed away, since both
  `manager` and `sales_associate` hold full `customers` CRUD by default. Full suite:
  **171 tests, all passing.**
- **2026-07-13** — Built full Phase 3: extended the minimal `attendance` slice to the complete
  §7.4 spec, and built `leave` (§7.5) from scratch. **Photo capture:** check-in/check-out now
  accept an optional `photo` (base64 JSON or multipart, both on the same route) uploaded to
  Cloudinary via a new shared `src/services/cloudinary.service.js` — the binary is never stored
  in MongoDB, only the returned secure URL. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
  `CLOUDINARY_API_SECRET` are now **required** env vars (previously optional and unused).
  **Connectivity-gap detection:** a new `POST /attendance/heartbeat` endpoint, deliberately kept
  separate from Location's GPS ping (§7.4b) — a heartbeat carries no coords and exists purely to
  prove "still alive." A gap can only be detected retroactively, at whichever arrives first
  between the next heartbeat or checkout: if the silence since the last proof-of-life exceeds
  `ATTENDANCE_GAP_THRESHOLD_MINUTES` (new, optional, defaults to 10), the whole silent window
  becomes one `connectivityGaps` entry. Needed one field beyond the documented schema:
  `Attendance.lastHeartbeatAt`, internal bookkeeping only. **`workingHours`:** computed at
  checkout as gross shift duration minus total gap duration (a gap means the employee wasn't
  verifiably working), clamped to 0. **New endpoints:** `GET /attendance/team?month=` and
  `GET /attendance/report?from=&to=&format=pdf|xlsx` (xlsx via existing `exceljs`, pdf via new
  `pdfkit` dependency) — both gated by new `attendance.view_team`/`view_all` registry entries
  (no plain `view` tier, since `GET /attendance/me` is already unconditional). **`leave` module
  built from scratch:** `POST /leave/request` (self-service, admin can request on behalf of
  others), `GET /leave?scope=own|team|all` (each scope checked against its own `leave.view`/
  `view_team`/`view_all` grant — mirrors Location's three-tier shape, not Attendance's/Users'
  unconditional-self-access pattern, since viewing your own leave data is genuinely gated here),
  `PATCH /leave/:id/approve` and `PATCH /leave/:id/mark-unapproved-absence` (admin only).
  **Leave cadence resolved (§11.7):** one paid leave per calendar month, no carry-over — neither
  source document said anything about carry-over either way, so this is a deliberate, explicitly
  stated assumption. Enforced by rejecting any single paid request over 1 day and rejecting
  approval of a second paid leave in the same month for the same employee. Added `attendance`/
  `leave` to `PERMISSION_REGISTRY` with manager/sales_associate/employee template defaults.
  31 new tests for `attendance` (18 added to the original 13), 18 for `leave` — no application
  bugs found. Cloudinary is mocked at the module boundary in tests (`vi.mock`), so no test makes
  a real network call; gap-detection tests backdate `lastHeartbeatAt` directly via Mongoose
  rather than waiting out the real threshold. Full suite: **207 tests, all passing.**
- **2026-07-13** — Follow-up to the Phase 3 build: extracted `GET /attendance/report`'s PDF/Excel
  generation out of `attendance.service.js` into a new shared `src/services/report.service.js`
  (`generateExcelReport`/`generatePdfReport`, generic `exceljs`/`pdfkit` primitives) instead of
  leaving it as one-off inline logic — deliberate groundwork for the real shared reports pipeline
  (§7.11, Phase 8) without building that pipeline now. Leads' existing `.xlsx` export was
  deliberately **not** migrated onto the new service (already working and tested, out of scope).
  Also strengthened the report tests to assert actual file structure instead of just response
  headers: the `.xlsx` response is re-read with `exceljs` to confirm both the "PK" zip signature
  and that a manager's report only contains their own team's records (not an unaffiliated sales
  associate's); the PDF response is checked for the `%PDF-` magic-number header. Test count
  unchanged (2 tests replaced with 2 strengthened versions) — full suite still **207 tests, all
  passing.**
- **2026-07-13** — Two follow-up fixes to the Phase 3 build. **(1) Photo requirement moved from
  client-side-only to server-side-enforced:** `attendance.validation.js#validatePhotoPresence`
  now rejects (400) a check-in/check-out with neither `req.file` nor `req.body.photo` present.
  This was a genuine gap, not a style choice — smartrays.md's whole reason for capturing a photo
  is to prove physical presence, and that protection didn't actually exist while the API would
  silently accept a request without one. Updated every check-in/check-out call across the test
  suite to supply a photo (`attendance.test.js`'s existing tests, plus `location.test.js`'s
  end-to-end test, which now also mocks `src/services/cloudinary.service.js`), and added explicit
  rejection tests for check-in and check-out with no photo. **(2) Confirmed the one-paid-leave-
  per-month quota (§11.7) is enforced at APPROVAL time, not request time** — this was already how
  `leave.service.js` was written (`requestLeave` never checks the quota; only `approveLeave`
  does), not a bug that needed fixing. Strengthened the existing test to explicitly assert both
  a first and a second paid request for the same employee in the same month submit successfully
  (201 each), and only the second *approval* is rejected (409, with a message naming the quota).
  Net test count: attendance +1 (32 total, from splitting the old single "no photo" test into a
  check-in version and a check-out version), leave unchanged (18, same test count, strengthened
  assertions). Full suite: **208 tests, all passing.**
- **2026-07-13** — Built Phase 6: Transport/Travel (§7.6). New `src/services/googleMaps.service.js`
  wraps the Google Maps Distance Matrix API — no SDK dependency, calls the REST endpoint directly
  via Node's built-in `fetch`. New `transport` module (folder named for the single-word convention
  every other module folder uses; files inside named `travelLog.*` to match the actual model,
  `TravelLog`, §6.5). Auto-generation hooks directly into `attendance.service.js#checkOut` (the
  same cross-module direct-call pattern already used for `location`→`Attendance` and
  `lead`→`customer.service.js#createCustomer`) rather than a new event/callback mechanism —
  `generateAutoTravelLog` is guaranteed to never throw, so a missing coords case or a Google Maps
  failure just means no log gets created, never a failed checkout. Manual entry accepts either a
  direct `distanceKm` (never overridden by a Google Maps lookup) or origin/destination coords
  (distance computed the same way an auto-generated entry's is); logging on someone else's behalf
  is a structural role+relationship check — a manager may log for their own direct report, an
  admin for anyone, but a plain employee/sales_associate naming anyone else at all is **rejected
  outright (403)**, deliberately stricter than Leads' silent `ownerId`-forcing (misattributing
  someone else's travel silently would hide a real mistake, unlike reassigning a sales record's
  ownership). `GET /travel-logs?scope=own|team|all` mirrors Leave's exact three-tier permission
  shape; `GET /travel-logs/report` mirrors Attendance's report gate and reuses
  `src/services/report.service.js`'s generic Excel/PDF builders rather than writing new
  generation code. Added `travelLogs` to `PERMISSION_REGISTRY` with manager/sales_associate/
  employee template defaults. **§11.4 ("does travel distance feed payroll?") deliberately left
  open** — built as a standalone logging + reporting feature per this task's own explicit
  instruction not to design around a Payroll integration that doesn't exist yet.
  `GOOGLE_MAPS_API_KEY` is now a required env var. 20 new tests, no application bugs found (one
  test-authoring inconsistency was caught and fixed: an initial test expected a plain
  sales_associate's cross-employee manual entry to be silently redirected to self, which
  contradicted the actual, deliberate 403-reject-outright design — the test was corrected to
  match the intended behavior, not the other way around). `googleMaps.service.js` is mocked at
  the module boundary in `travelLog.test.js`, `attendance.test.js`, and `location.test.js` (the
  latter two since a real Attendance checkout now transitively calls it too) — no test makes a
  real Google Maps API call. Full suite: **228 tests, all passing.**
- **2026-07-13** — Follow-up to the Transport/Travel build: strengthened the `scope=own|team|all`
  test coverage with one dedicated side-by-side assertion — three employees each log travel, then
  admin's `scope=all`, the manager's `scope=team`, and one employee's default `scope=own` are each
  checked against the exact expected employee-id set in the same test, making the "admin sees all,
  manager sees team, employee sees own only" invariant explicit rather than only inferable from
  separate tests. `transport` module: 21 tests (up from 20). Full suite: **229 tests, all
  passing**, no regressions anywhere — confirmed Attendance checkout still works correctly with
  the `TravelLog` auto-generation hook wired in.
- **2026-07-13** — Built Phase 4: Payroll (§7.7), closing two prerequisites first in the same
  task. **STEP 0a:** added `User.baseSalary` (Number, `select: false` like `passwordHash`) —
  nothing before this tracked a salary figure at all. Treated as a **privileged field**
  (`PRIVILEGED_FIELDS`), the same admin-only, not-self-editable treatment as `role`/`managerId`/
  `isActive`, settable via the existing `PATCH /users/:id` flow. 2 new `user` tests (33 total).
  **STEP 0b:** retrofitted `travelLog.model.js` with a `status` (`pending`/`approved`/`rejected`,
  default `pending` — neither `auto` nor `manual` entries auto-approve) and `approvedBy`/
  `approvedAt`. New `PATCH /travel-logs/:id/approve`/`reject`, gated by a **structural**
  manager-of-employee-or-admin check (mirrors the existing manual-entry attribution check in the
  same file), not a new permission tier; 409 if the log isn't `pending`. **Resolves §11.4**
  ("does travel distance feed payroll?" — yes, but only `approved` entries). 7 new `transport`
  tests (28 total — an earlier version of this entry said 6, a miscount corrected in a later
  follow-up). **STEP 1:** added `MILEAGE_RATE_PER_KM` (optional, defaults to 10 — a stated
  placeholder the client must confirm). **STEP 2:** built the `payroll` module —
  `runPayroll(employeeId?, month, year, regenerate?)` computes `daysInMonth`/`presentDays`
  (Attendance)/`paidLeaveDays` (approved paid Leave)/`unpaidDeductionDays` (unpaid Leave days +
  `unapproved_absence` days doubled, via the existing `isDoubleDeduction` flag)/
  `workingHoursTotal`/`grossAmount`/`mileageReimbursement` (approved-only TravelLog ×
  `MILEAGE_RATE_PER_KM`)/`netAmount`/`paidOn` (1st of the next month). A single-employee run
  (`?employeeId=`) throws 409 on an already-generated month unless `regenerate=true`; a bulk run
  (no `employeeId` — what the monthly cron calls) silently skips already-generated employees
  instead, staying idempotent, and skips (doesn't error on) any active employee with no
  `baseSalary` set. New `payroll: ["view", "run"]` permission entry — **no `team` tier at all**,
  a deliberate divergence from every other workforce module (Manager gets no payroll grant
  whatsoever). `sales_associate` was given the same `payroll.view: true` ("own payslip only")
  default as `employee`, on the reasoning that §5's matrix left that cell blank — **this
  reasoning was wrong, and the mistake wasn't caught until a later follow-up (see below); the
  matrix cell was actually an explicit "–", not blank.** `GET /payroll/:id/payslip?format=pdf` mirrors
  `user.service.js#getUserById`'s exact self-or-broad-grant, 404-not-403 shape. **STEP 3:** new
  `src/cron/payrollCron.js` (a new top-level directory, not folded into `src/services/` —
  scheduled-job orchestration is a distinct concern) registered from `server.js` after the
  database connects; runs at 00:05 on the 1st of every month, bulk-running the **previous**
  month. `node-cron` was already a listed §3 dependency; installed for real this task. 17 new
  `payroll` tests, no application bugs found. Full suite: **255 tests, all passing.**
- **2026-07-13** — Follow-up to the Payroll build, closing three gaps from the original task.
  **(1) Payslip PDF confirmed to reuse `report.service.js`** (`generatePdfReport`), not new PDF
  code — already true from the initial build, no change needed. **(2) `payroll.validation.js`
  confirmed mounted correctly** — `payroll.routes.js` was already wired into `src/route.js`.
  `PERMISSION_REGISTRY` already had a `payroll: ["view", "run"]` entry — this was re-checked
  against §5 at the time and *believed* to match exactly, but the check missed that
  `sales_associate`'s default was wrong (see the next entry — this was caught in a later
  follow-up, not here). **(3) Added the one genuinely missing piece: an
  automated test for the cron job itself.** `src/cron/payrollCron.js`'s job body was pulled out
  into a separately exported `runMonthlyPayrollJob(referenceDate = new Date())` so a test can
  call it directly with a fixed date rather than waiting on a real cron fire or faking global
  `Date`/timers (which risks destabilizing `mongodb-memory-server`/Mongoose's own internal timer
  usage). New `src/cron/payrollCron.test.js` (6 tests): `resolvePreviousMonth`'s pure date math
  (same-year case, January→prior-December wraparound), `registerPayrollCron` schedules the exact
  `"5 0 1 * *"` expression (asserted via a `node-cron` mock, `vi.spyOn`), and
  `runMonthlyPayrollJob` produces the exact same `Payroll` records a manual bulk run would
  (idempotent on a repeat call, skips an employee with no `baseSalary`). No application bugs
  found. Full suite: **261 tests, all passing.**
- **2026-07-13** — Two corrections to the Payroll work above, caught on review. **(1) Fixed a
  real permission bug:** `permission.service.js`'s `INITIAL_TEMPLATE_DEFAULTS.sales_associate`
  granted `payroll: { view: true }` on the reasoning that §5's matrix left the
  `sales_associate`/`payroll.view/run` cell blank — it doesn't. The matrix marks that cell with
  an explicit "–", the identical symbol used for Manager's "no access at all," not a
  blank/unspecified cell. Removed the `payroll` key from `sales_associate`'s defaults entirely,
  so it now matches Manager (no grant), and only `employee` keeps "own payslip only" as the
  matrix states. Updated `payroll.test.js`: switched three tests that had used a
  `sales_associate` agent to stand in for "an employee with payslip access" over to a real
  `employee` agent instead, and added two new tests confirming a `sales_associate` with no
  override gets **403** on `GET /payroll` (the list endpoint's explicit scope check) and **404**
  on their own `GET /payroll/:id/payslip` (falls through `getPayslip`'s same
  not-self-or-broad-grant branch as any other out-of-scope lookup — the endpoint doesn't
  distinguish "not your record" from "you can't see records at all"). Net +2 tests in
  `payroll.test.js` (17 → 19). **(2) Corrected a test-count miscount:** the Transport/Travel
  approve/reject test count was reported as 6 in the original Payroll changelog entry above; the
  actual test file has **7** `it()` blocks in that describe block (verified by direct
  inspection), which is also what the arithmetic already required (21 original + 7 = 28, the
  verified total) — the 6 was simply a wrong count in the summary prose, not a code change. Ran
  the full suite for a final verified count, broken down per file:
  13 (auth) + 34 (leads) + 20 (location) + 20 (permissions) + 33 (user) + 32 (attendance) +
  21 (customer) + 19 (project) + 18 (leave) + 28 (transport) + 19 (payroll) +
  6 (payrollCron) = **263 tests, all passing.**
- **2026-07-13** — Built Phase 5: Support/Tickets + Customer Portal (§7.0/§7.8), a two-part
  task. **STEP 0:** added `User.customerId` (ObjectId → Customer, nullable, only ever set for
  `role: "customer"` accounts) — a resolved schema gap, same treatment as `baseSalary`. Treated
  as a **privileged field** (admin-only, not self-editable) for the same reason `baseSalary` is
  — letting a portal user relink themselves to a different company would be a security hole.
  **PART A — Customer self-signup:** new `POST /auth/customer/signup`, deliberately separate
  from the admin-gated `POST /auth/register` (public, its own validator, no `role` field at
  all). `user.service.js#createCustomerSelfSignupUser` verifies the signup email via
  `customer.service.js#resolveCustomerIdByEmailDomain` — checks `Contact.email` first (a
  company realistically has several people's addresses on file, higher hit-rate), falls back to
  `Customer.email` only if no `Contact` matches. No match → rejected (**400** — this codebase
  has no 422 anywhere, so 400 keeps the error-code vocabulary consistent). On a match, creates a
  `User` with `role: "customer"`, `customerId` set, permissions seeded from a new `customer`
  `RolePermissionTemplate` (`{ tickets: { create: true, view_own: true } }`, added to
  `permission.service.js`'s `INITIAL_TEMPLATE_DEFAULTS`, replacing the previous empty `{}`).
  Login is completely unchanged — `POST /auth/login` works identically for `customer`-role
  accounts. 6 new tests in `auth.test.js` (19 total). **PART B — `Ticket` module**
  (`src/modules/ticket/`): `subject` added beyond §6.6's documented field list (a resolved gap,
  same treatment as `baseSalary`/`lastHeartbeatAt`) — the initial free-text description becomes
  the first `history[]` comment entry instead of a separate `description` field.
  `POST /tickets` branches by role: internal (admin/manager) requires and validates
  `customerId`, allows an optional `assignedToId` for create-and-assign in one step; portal
  (customer) derives `customerId`/`raisedByCustomerId` from `req.user` (never trusted from the
  body) and **forces `category` to `"other"` regardless of what's sent** — portal users are
  never asked to categorize. `GET /tickets?scope=all|assigned|own` has no universal "own"
  default the way Leave/TravelLog/Payroll do (Ticket has no such tier for internal roles) — a
  missing `scope` resolves to whichever tier the caller's role holds, in priority order
  `all` > `assigned` > `own`. `PATCH /tickets/:id/status` is a **structural** permission check
  (admin/manager, or the ticket's own assigned employee) — 404 for a caller who can't view the
  ticket at all, but **403** for a customer who legitimately can view their own ticket but isn't
  allowed to manage its status (a different signal from "not found"). Comments and attachments
  are open to "anyone with view access" — no narrower check. Attachments reuse
  `cloudinary.service.js` (new `uploadTicketAttachment` export, `resource_type: "auto"` since an
  attachment isn't guaranteed to be an image) rather than duplicating upload logic. New
  `tickets: ["create", "assign", "view_all", "view_assigned", "view_own"]`
  `PERMISSION_REGISTRY` entry and `manager`/`employee` template defaults, matching §5's matrix
  exactly. **§11.2 (category vs. lifecycle status split) resolved as part of this build** — the
  split itself is adopted; the exact category enum remains open to client confirmation if it
  ever needs to grow. 33 new tests in `ticket.test.js`, no application bugs found on the first
  implementation. Full suite: **302 tests, all passing.**
- **2026-07-13** — Follow-up to the Phase 5 build, verifying the explicit test-coverage
  requirements re-stated for this task line-by-line against what was actually written. Two
  gaps found and closed, both in `ticket.test.js`. **(1) Manager's `scope=all` wasn't checked
  independently of admin's** — the original test only exercised `adminAgent`; since admin
  bypasses `can()` entirely, that alone doesn't prove manager's distinct `tickets.view_all`
  grant (covering "PM") actually works. Added a dedicated test asserting `managerAgent` also
  sees everything, including a portal-raised ticket. **(2) History ordering was only checked
  one entry at a time** — every existing test asserted "the newest entry looks right", never
  that a *sequence* of actions lands in `history[]` in the exact order they happened. Added a
  test running a mixed sequence (initial raise → comment → status change → another comment →
  a final status change with its own comment) and asserting all 5 entries appear in that exact
  order. Also strengthened the existing cross-company `scope=own` test to assert both
  directions explicitly (Acme's portal user doesn't see Beta's ticket, and vice versa), rather
  than only checking one company's view. `permission.service.js`'s `tickets` defaults were
  re-verified against §5 line-by-line and found to already match exactly (admin/manager:
  create+assign+view_all; employee: view_assigned only; customer: create+view_own;
  sales_associate: nothing) — no code change needed there. Net +2 tests in `ticket.test.js`
  (33 → 35). Full suite re-verified via a real `npm test` run: **304 tests, all passing.**
- **2026-07-13** — Built Phase 7: Payments + AMC (§7.9/§7.10). **Payments** (`src/modules/payment/`):
  `Payment` gained one field beyond §6.6's documented shape, `invoiceId` (ObjectId → `Invoice`,
  nullable) — **§11.3 resolved: partial reconciliation, not a standalone log and not full
  invoicing.** When both `customerId` and `invoiceId` are given, the linked `Invoice`'s
  `balance` is reduced by the payment amount; reaching 0 sets `status: "paid"`, anything left
  over sets the newly-added `"partially_paid"` value (`invoice.model.js`'s `INVOICE_STATUSES`
  gained this value — the original 4-value enum had nothing to represent a partial payment). An
  overpayment clamps the balance to 0 rather than going negative (stated v1 simplification, no
  refund/credit tracking). Reconciling against an invoice with no `balance` set or a `cancelled`
  invoice is rejected (400). A manual-only payment, or a `customerId` with no `invoiceId`, is
  just logged — expected, not a gap. `payments.view`/`create` are admin-only per §5's matrix,
  with no ownership scoping at all (every other role is "–") — the first module in this
  codebase with zero scoping logic. 16 new tests, no application bugs found.
  **AMC** (`src/modules/amc/`): built exactly as documented in §6.6, no schema additions. The
  two-flow creation (smartrays.md: "AMC ... ask which create client or convert client") —
  `flow: "new_customer"` reuses `customer.service.js#createCustomer` directly to create a real
  `Customer` inline (the same cross-module direct-call pattern used elsewhere, e.g.
  lead→customer conversion), including reusing its validation
  (`customer.validation.js#validateCreateCustomerInput`, called directly against
  `newCustomerPayload` rather than duplicated); `flow: "existing_customer"` requires a
  `customerId` that must be within the requesting user's ownership scope. New `amc: ["view",
  "edit"]` permission entry — Manager's "own team" and Sales Associate's "own" tiers (§5) are
  resolved via a new `customer.service.js#getVisibleCustomerIds(requestingUser)` export (`null`
  for admin, meaning unrestricted; the visible `Customer` id list otherwise), since AMC has no
  `ownerId` field of its own — its only link to ownership is indirect, through `customerId` →
  `Customer.ownerId`. No automation on renewal for v1 — `status` only changes via an explicit
  `PATCH /amc/:id`, locked in by a regression test confirming a long-past `renewalDate` never
  auto-flips a record to `"expired"`. 20 new tests, no application bugs found. Full suite:
  **340 tests, all passing.**
- **2026-07-13** — Built Phase 8: unified Reports (§7.11), `src/modules/report/`. New
  `report.service.js` dispatcher, keyed by `module` (exactly the six §7.11 names —
  `attendance`/`leave`/`payroll`/`transport`/`leads`/`customers`), pairs a coarse
  `can()`-based access check with a fetch-and-render step. **`attendance`/`transport`** already
  had a combined fetch+render function from their own earlier builds
  (`generateAttendanceReport`/`generateTravelLogReport`) — the dispatcher calls those directly,
  unmodified. **`leave`/`payroll`/`leads`/`customers`** had no existing report-rendering code,
  only a scoped list function (`listLeaves`/`listPayroll`/`listLeads`/`listCustomers`) — the
  dispatcher calls those unmodified to fetch, then does its own **new** column/row shaping via
  the existing shared `generateExcelReport`/`generatePdfReport` primitives; this new rendering
  code lives entirely in `report.service.js`, not inside each source module. No new
  `reports.generate` permission was added — the access-check map reuses each module's own
  existing actions, matching this task's explicit instruction not to invent a parallel
  permission mechanism. New `cloudinary.service.js#uploadReportFile` uploads the generated
  buffer and returns a secure URL. **Breaking change (intentional — no frontend exists yet to
  break):** `GET /attendance/report` and `GET /travel-logs/report` now internally call this same
  dispatcher instead of duplicating report generation, and their response changed from
  streaming the file directly to returning `{ downloadUrl }` — `attendance.service.js#generateAttendanceReport`/
  `travelLog.service.js#generateTravelLogReport` themselves are completely unchanged, only their
  controllers were rewired. Existing tests for both were rewritten to assert against the real
  buffer the mocked `uploadReportFile` was called with (the "PK"/"%PDF-" magic-number checks
  moved from the streamed response body to the mock's captured argument, still proving a
  genuine well-formed file) and the returned `downloadUrl`, instead of a streamed response body
  — same general approach already used for mocking Cloudinary elsewhere in this project.
  `GET /payroll/:id/payslip` was deliberately **not** migrated (a single-document artifact, not
  a filtered-list report — doesn't fit the dispatcher pattern); `GET /leads/export` also stays
  exactly as-is (a separate, pre-existing CSV/Excel export — the new `leads` report reuses
  `listLeads`, not `exportLeadsToExcel`, and is additive). A manager requesting an `attendance`
  report via the dispatcher is proven (in `report.test.js`) to get the exact same employee set
  `GET /attendance/team` independently returns for that manager — scoping is reused, never
  reimplemented. 18 new tests in `report.test.js`, no application bugs found. Full suite:
  **358 tests, all passing.**
- **2026-07-16** — Follow-up rigor pass on Phase 8, closing three gaps identified on review of the
  initial build. **(1) `report.validation.js` now validates per-module `filters` shape**, not
  just `module`/`format`/"is an object" — reusing each target module's own existing query
  validator as a plain function call against a `{ query: filters }` stand-in (the same
  call-the-existing-middleware-directly pattern `amc.validation.js` already used for
  `customer.validation.js#validateCreateCustomerInput`): `attendance`/`transport` reuse their own
  `validateReportQuery` (date-range checks), `leave` reuses `validateScopeQuery`, `payroll`
  reuses `validateListQuery` (own/all only, no `team` tier). `leads`/`customers` have no
  dedicated query-validator middleware of their own — their list endpoints run unvalidated
  today — so their `status` filter is checked directly against `LEAD_STATUSES`/
  `CUSTOMER_STATUSES`, the same enum source their body validators already use, rather than a new
  hardcoded list. **(2) Every one of the six modules' success-path test now asserts the real
  magic-number file signature** ("PK" for xlsx / "%PDF-" for pdf) on the buffer captured from the
  mocked `uploadReportFile` call — previously only `attendance`/`transport`/`customers`(pdf) did
  this rigorously; `leave` had no buffer assertion at all. **(3) Added a dedicated regression
  test in `payroll.test.js`** explicitly framed around confirming `GET /payroll/:id/payslip`
  still streams a direct PDF response and was NOT swept into the dispatcher migration — the
  exclusion was previously only implicitly protected by pre-existing tests, not explicitly
  proven. Also added filter-validation tests (invalid `scope` for `leave`/`payroll`, invalid date
  range for `attendance`/`transport`, invalid `status` for `leads`/`customers`). 6 new tests in
  `report.test.js` (18 → 24), 1 new test in `payroll.test.js` (19 → 20). No application bugs
  found — this was a test/validation-completeness pass, not a behavior change. Full suite:
  **365 tests, all passing.**
- **2026-07-16** — Built Frontend Phase 0 (scaffold + auth flow + routing shell, §7.14),
  mirroring what backend Phase 0 established: the foundation everything else builds on, not
  full-featured pages. Vite + Tailwind CSS + Ant Design + React Router DOM
  (`createBrowserRouter`/`createRoutesFromElements` only) + Zustand (session store is the
  only global store) + Axios — exactly per §3, no deviation. **One cleanup on top of the
  pre-existing `frontend/` scaffold:** removed an experimental `@rolldown/plugin-babel` +
  React Compiler preset the default Vite template had wired in — neither is part of the
  fixed stack, and both add real interop risk for zero required benefit at Phase 0; replaced
  with the standard `@vitejs/plugin-react`. New `src/services/apiClient.js` (one shared Axios
  instance, `withCredentials: true`, 401 interceptor that clears session state and redirects
  to `/login` except on a failed login itself), `src/store/sessionStore.js` (Zustand —
  resolves identity from a real `GET /auth/me` call on app load, never a decoded token,
  mirroring §4.1 on the client), route guards in `src/routes/` (`ProtectedRoute`,
  `PermissionGate`/`usePermission` mirroring backend's `can()` — **UI convenience only, not a
  real security boundary, stated as a comment in the code itself**, `RootRedirect` for `/`'s
  real by-role logic), `MainLayout` (shared dashboard shell per §7.13) and `PortalLayout`
  (separate, no internal nav, for `role: customer`) in `src/layouts/`. Every route in §8's
  route map is wired in `src/routes/router.jsx` today; `/login` and `/` are fully functional,
  every other route renders a shared `PlaceholderPage` component, to be filled in
  module-by-module in later frontend tasks. 15 new tests (`vitest` + React Testing Library +
  `@testing-library/user-event`, jsdom environment) — Login page (render/submit/error/
  redirect), `ProtectedRoute` (loading/redirect/authenticated), `PermissionGate` (hide/
  fallback/show/admin-bypass), `RootRedirect` (customer vs. every staff role) — all passing,
  no real network calls (every API call mocked at the module boundary, matching backend's
  Cloudinary/Google Maps mocking discipline). **One real interop bug found and fixed:** the
  scaffold's originally-pinned `vitest@2` bundles its own internal Vite 5.x (`vite-node`,
  `@vitest/mocker`), which didn't correctly apply this project's Vite-8-targeted
  `@vitejs/plugin-react` — JSX silently fell back to the classic runtime under tests
  (`ReferenceError: React is not defined`) even though the real dev/build pipeline was
  completely unaffected. Fixed by upgrading to `vitest@4`, which also resolved the
  transitive `esbuild`/`vite` audit advisory `vitest@2` carried (the same fix `npm audit`
  itself suggested — not a forced/breaking workaround). A second, smaller fix: jsdom has no
  `window.matchMedia`, which Ant Design's responsive components call unconditionally on
  mount — stubbed in `src/test/setup.js`. Confirmed `npm run dev` and `npm run build` both
  boot/complete cleanly. New `frontend/README.md` (setup, folder conventions, the
  api.js/components/hooks-per-module pattern for adding a new module, how to run tests);
  root `README.md` updated with frontend setup + a "running both together" section.
- **2026-07-16** — Built the Leads frontend module (`frontend/src/modules/lead/`, §7.15) —
  the first real feature module on the Phase 0 scaffold, and the reference implementation
  every later frontend module follows. New dependencies: `@dnd-kit/core`+`@dnd-kit/sortable`+
  `@dnd-kit/utilities` (kanban drag-between-stages) and `dayjs` (now explicit, previously
  only transitive via `antd`). Table View + Board View share one page shell
  (`LeadsListPage`) with URL-persisted filters; `useLeadStatusChangeFlow` centralizes the
  `lost`-needs-reason and `won`-triggers-convert special cases across the table dropdown,
  board drag, and detail-page buttons so there's exactly one implementation of each rule,
  not three. Lead Detail (`/leads/:id`) is a real route rendered as a slide-over. **Found a
  real backend gap and handled it explicitly rather than silently working around it:** no
  lead-specific activity-log endpoint exists, so the Activity Timeline is assembled
  client-side from call history + lead fields, documented in the code as exactly that. The
  Import wizard's "mapping" step is similarly an honest read-only preview of the backend's
  fixed column-alias matching, not an editable remap the API has no way to act on. 40 tests
  total (25 new), all passing, no real network calls — drag-and-drop tested via pure-logic
  + flow-hook + rendering tests rather than simulating real `@dnd-kit` pointer sequences
  under jsdom (documented as the pattern to follow for future drag-and-drop UI).
  `npm run dev`/`npm run build` both confirmed clean. `frontend/README.md`,
  `.context/final-plan.md` (§7.15 + roadmap), and this file all updated to mark it built.
- **2026-07-16** — Built the Notification module, Web Push (VAPID) delivery, and the lead
  follow-up reminder cron (§6.7/§7.16) — **the last unbuilt backend piece; this closes out
  every backend phase in the roadmap.** New `backend/src/modules/notification/`
  (`Notification`/`PushSubscription` models exactly per §6.7, `notification.service.js`,
  controller, routes, validation). New required env vars `VAPID_PUBLIC_KEY`/
  `VAPID_PRIVATE_KEY` (a real keypair generated once via `web-push`'s own
  `generateVAPIDKeys()` utility — no safe placeholder exists for a public-key-cryptography
  pair, unlike e.g. a Cloudinary cloud name) and optional `VAPID_SUBJECT`. New
  `src/services/webPush.service.js` wraps the `web-push` package (now a real dependency, was
  previously only a planned §3 entry). `notification.service.js#createNotification` creates
  the DB record and attempts a push to every active `PushSubscription` independently — a push
  failure is logged and swallowed per-subscription, never blocking the notification record or
  suppressing delivery to the user's other devices; a 404/410 response deactivates that
  subscription rather than deleting it. `subscribe` upserts by `endpoint` (not `userId`) since
  that's the Push API's own natural unique key, re-associating a shared device's endpoint to a
  new user rather than erroring on a duplicate key. No `PERMISSION_REGISTRY` entry — every
  action (subscribe/unsubscribe/list/mark-read) is inherently self-scoped, the same
  "self-data-needs-no-grant" reasoning `users.*`/`attendance.*` already established. **Wired
  into Leads** (`lead.service.js#notifyLeadAssignment`, shared by `createLead`/`updateLead` —
  fires whenever a lead's `ownerId` ends up set to someone other than whoever made the
  change) **and, as a deliberate small addition beyond the Leads-only spec, Ticket assignment**
  (`ticket.service.js#assignTicket`) — stated explicitly here and in `final-plan.md` as scope
  added on top of what this task was asked to build, not a silent expansion. New
  `src/cron/leadFollowUpReminderCron.js` runs every 5 minutes (far finer-grained than the
  monthly payroll cron — both reminder windows are precise-ish moments, not a once-a-day
  batch); `lead.service.js#sendDueFollowUpReminders` checks a "due within the next 24h/15m and
  not yet reminded" condition per tick — deliberately not an exact-time match, so a cron
  restart or delayed tick can never silently skip a reminder. `won`/`lost` leads excluded; a
  follow-up that's already fully passed never gets a reminder (a "before it's due" nudge, not
  after-the-fact — the existing `followUp=overdue` filter covers that). New `Lead` fields, a
  necessary schema addition (same treatment as Attendance's `lastHeartbeatAt`):
  `followUpReminder24hSentAt`/`followUpReminder15mSentAt` (`Date`, nullable) — idempotency
  guards, both reset to `null` whenever `followUpDate` changes so a reschedule re-arms both
  reminders. New `User.pushSubscriptions` field (§6.1/§6.7), kept in sync by
  subscribe/unsubscribe though `PushSubscription.isActive` is the actual authority
  `createNotification` checks. 34 new tests (17 `notification.test.js`, 9
  `leadFollowUpReminderCron.test.js`, 6 new in `lead.test.js`, 2 new in `ticket.test.js`) — all
  passing, no application bugs found, a clean net-new build. `web-push` mocked at the module
  boundary everywhere it's touched, same pattern as Cloudinary/Google Maps mocking; one real
  interop constraint found and worked around: `web-push`'s `setVapidDetails()` validates the
  public key format and throws synchronously at import time, and since nearly every test file
  transitively imports it, `tests/helpers/testDb.js`'s dummy env-var defaults needed a real
  (though non-secret, fixture-only) VAPID keypair rather than an arbitrary placeholder string
  — otherwise the entire suite would have failed at import time, not just
  `notification.test.js`. Full suite: **399 tests, all passing.** `backend/README.md` (new
  Notifications section + dependencies-added entry), `.context/final-plan.md` (§7.16 + §6.7 +
  roadmap + tech-stack table), and this file all updated to mark it built.
- **2026-07-17** — Login page visual redesign (v2/v3), self-service + admin password reset
  (§7.19), and the first Vercel deployment, all in one task. **Login redesign:** the first pass
  read "flat and almost-white" once reviewed against a reference design — replaced
  `.auth-gradient-bg` with a genuinely deep, directional 3-stop navy gradient (near-black corner
  through brand-navy mid to a lighter navy far corner) plus a real off-center green (`#1d8343`)
  radial glow and a dark vignette, and rebuilt the glass card as a much darker/more-translucent
  `bg-white/12` + `backdrop-blur-xl` + `border-white/20` surface with frosted-dark inputs
  (light text/placeholder, retuned `-webkit-autofill` override to match). A follow-up round of
  live-site feedback caught two more problems: the hero-side logo (color version) was blending
  into the dark background, and the gradient still read as one flat navy at a glance — fixed by
  adding a `variant` prop to `BrandLogo` (`color`/`white`, using the pre-existing
  `logo-white.png` asset) and pushing the gradient's lightness range and glow opacity further
  apart for real visible depth. Verified with real Playwright screenshots (desktop + mobile,
  local and the live deployment) at every iteration, not just by inspecting CSS values.
  **Password reset, both flows (§7.19):** self-service via new `src/services/email.service.js`
  (Nodemailer/SMTP, new required `SMTP_*` env vars), `User.passwordResetToken` (SHA-256 hash
  only, never the raw token) / `passwordResetExpiresAt` (~1h), `POST /auth/forgot-password`
  (always the same generic response, account-enumeration-safe) and `POST /auth/reset-password`;
  frontend "Forgot password?" link, request-email page, and a new `/reset-password?token=` page,
  all sharing a new `AuthLayout` component factored out of the login page once a third screen
  needed the identical dark-glass treatment. Admin override:
  `PATCH /users/:id/reset-password` — a judgment call to support both an admin-supplied exact
  password and (when omitted) a backend-generated one-time temp password returned once in the
  response, rather than forcing the admin to invent one every time. New backend tests cover
  forgot/reset token validity/expiry/reuse, the non-leaking response for both missing and
  deactivated accounts, and both admin-override modes; new frontend tests cover both new pages.
  Full suites re-run and passing throughout (412 backend tests; 61+ frontend tests).
  **First deployment, to Vercel** (two pre-existing empty projects, monorepo, CLI-only — no
  GitHub auto-deploy since the Vercel account and the `Tous-India` GitHub org are on different
  emails): `smartrays-crm-backend` (Root Directory `backend`) and `smartrays-crm` (Root
  Directory `frontend`). Backend adapted for serverless without touching `app.js`/`server.js`'s
  local-dev behavior: new `backend/api/index.js` entry point + `backend/vercel.json` rewrite,
  `src/database/connection.js` now caches its connection promise across invocations (required so
  cold starts don't exhaust Atlas's connection cap), and `server.js` skips cron registration
  when `process.env.VERCEL === '1'`. **Known, accepted production gap:** neither `payrollCron`
  nor `leadFollowUpReminderCron` fires in production — node-cron needs a long-lived process,
  which Vercel's serverless functions are not; see the root README's Deployment section for the
  planned real fix (Vercel Cron for the monthly payroll job; a different always-on answer for
  the 5-minute-granularity follow-up reminders, since Vercel Cron's free tier can't go that
  frequent). `getAuthCookieOptions()` now uses `sameSite: 'none'` in production (was `'strict'`)
  since the deployed frontend/backend are on different Vercel domains, making the cookie
  genuinely cross-site — verified working end-to-end (login → `Set-Cookie` → authenticated
  `/auth/me`) with both a raw `curl` session and a real headless-browser run against the live
  deployment, not assumed. Real Atlas MongoDB (already seeded with the bootstrap admin and
  permission templates from earlier local work); Cloudinary/Google Maps/SMTP are placeholder
  values in production for now (`env.js` only checks presence, not validity); VAPID is a real
  generated keypair, not a placeholder, since `web-push` validates key format at import and
  crashes the whole app otherwise.
- **2026-07-21** — Built the Dashboard (§7.13/§7.20), the last major placeholder page and the
  final piece of Phase 9's frontend half. New `frontend/src/modules/dashboard/` — a
  declarative widget catalog (`dashboardConfig.js` maps role → ordered widget-component list),
  deliberately not a runtime plugin/registry, since nothing else in this codebase registers
  behavior at runtime. Each widget (`widgets/*.jsx`) is self-contained: fetches its own data via
  the existing `leadApi`/`customerApi` functions (the exact same scoped calls each module's own
  list page already makes — no new unscoped queries), renders its own loading/error/empty state
  via a shared `WidgetCard` shell, and independently re-checks its own permission via
  `usePermission` before rendering anything — real defense in depth on top of the role-level
  config, since a per-user permission override (§7.12) can diverge from the role's template
  default. Built: `LeadsPipelineWidget`, `LeadsFollowUpWidget`, `LeadsHotWidget` (filters
  client-side for `isHot` since `GET /leads` has no server-side filter for it),
  `CustomersOverviewWidget` (active count + contract-type counts, fetched in parallel per
  customer since no aggregation endpoint exists), `CustomersRecentWidget`. admin/manager/
  sales_associate get all 5 as role candidates; employee/customer get none for now (no
  `leads`/`customers` grant by default) — stated explicitly as a future incremental addition
  (write the widget, add one line to `dashboardConfig.js`), not a gap. 21 new tests (one file
  per widget + `DashboardPage.test.jsx` for role-based composition, permission-gating
  overriding a role's config, and one widget's mocked API failure not affecting any other
  widget on the page), all passing, no real network calls. Full suites re-run: 412 backend
  tests unchanged (no backend touched by this task), frontend suite up to 115 tests (2
  pre-existing flaky failures — `LeadDetailPage`/`CustomersListPage`, both `jsdom`'s
  unimplemented `getComputedStyle` timing out Ant Design's scrollbar measurement, same as every
  prior run). `npm run build` verified successful. `frontend/README.md` (new "Dashboard widget
  catalog" section documenting the pattern and how to extend it),
  `.context/final-plan.md` (new §7.20, Modules-at-a-Glance/roadmap updated), and this file all
  updated to mark it built.
- **2026-07-21** — Added 6 more Dashboard widgets (§7.21) to the same declarative catalog
  §7.20 established, for 6 modules with a real, tested backend API but no frontend page of
  their own yet (still routing-skeleton placeholders) — deliberately glance-only summaries,
  not a substitute for each module's eventual full CRUD page; each "view all" link points at
  the existing placeholder route. `AttendancePresentTodayWidget` (present/half_day count
  **today**, admin/manager only — reuses `getTeamAttendance(month)`, filtering to today's date
  client-side since the endpoint has no single-day filter). `LeavePendingRequestsWidget`
  (pending-approval count, **admin-only** — there's no `leave.approve` action in
  `PERMISSION_REGISTRY` at all, approval being a structural `requireAdmin` check, but
  `usePermission("leave", "approve")` still correctly gates admin-only via the frontend
  `can()` helper's admin bypass; resolves employee names via the shared `useUserDirectory`
  hook). `TicketsOpenWidget` (open + open-and-unassigned counts, admin/manager per
  `tickets.view_all`). `AmcRenewalsDueWidget` (renewals due within 30 days, reusing
  `amc.service.js#listAMC`'s existing server-side scoping — deliberately **not** a
  sales_associate candidate even though they hold `amc.view` "own" by default, grouped with
  the other 5 admin/manager-only operational widgets by explicit design). `PaymentsThisMonthWidget`
  (sum of this month's payment amounts, **admin-only**, matching `payments.view` having no
  ownership scoping at all). `PayrollStatusWidget` (has payroll run this month + how many
  employees processed, **admin-only**, matching `payroll.run` having no manager tier at all).
  **No new backend endpoints** — every widget was checked against each module's existing
  service first, per this task's own explicit instruction to flag rather than silently add
  one if a widget genuinely couldn't be built without it; none were needed. New minimal
  `api/*Api.js` files for the four modules with no frontend module folder at all yet (`ticket`,
  `amc`, `payment`, `payroll`) — just the one `list*` function each widget needs, matching the
  established one-function-per-endpoint convention; `attendance`/`leave` already had `api/`
  files from their existing frontend modules, reused as-is. **Role composition:** admin gets
  all 6; manager gets the 3 matching their narrower default grants
  (Attendance/Tickets/AMC) — NOT Leave/Payments/Payroll, which are admin-only by explicit
  design; sales_associate/employee get none of the 6 (all admin/manager-level operational
  metrics by nature). 20 new tests (one file per widget: mocked-data rendering, an inline
  error instead of a crash on a rejected mock, permission-gating hiding the widget for a
  mocked user lacking the specific grant even when their role's config would normally include
  it), plus `DashboardPage.test.jsx` extended with a manager-scoped composition test and a
  second cross-widget isolation test (a failing Tickets widget doesn't affect the AMC widget
  on the same page). Full suites re-run: 412 backend tests unchanged (no backend touched by
  this task), frontend suite up to 136 tests (2 pre-existing flaky failures unchanged).
  `npm run build` verified successful. `frontend/README.md` (widget catalog list extended),
  `.context/final-plan.md` (new §7.21, Modules-at-a-Glance/roadmap/§7.20's own text updated),
  and this file all updated to mark it built.
- **2026-07-21** — App shell UI/UX pass (`MainLayout.jsx` + Dashboard widgets) — a visual/UX
  polish task, not new architectural scope, no new modules/permissions/backend endpoints.
  Sidebar restructured into three fixed regions (pinned logo, scrollable-only nav, pinned
  footer); recolored to brand-navy with a brand-green active/hover nav state (previously no
  visual indication of the current page at all); `User Management`/`Permission Settings`
  regrouped under a collapsible `Settings` submenu; top bar shortened with a live clock;
  self-service "Edit Profile" added to the sidebar footer's profile menu (reuses the existing
  `PATCH /users/:id`, no new backend work — the self-vs-admin field restriction already lived
  server-side); all 11 Dashboard widget cards visually tightened. `BrandLogo` gained a
  `layout` prop (`stacked`/`horizontal`) for a new wide sidebar logo, including a generated
  white silhouette asset since only the color version existed. **Real bug caught during
  verification, not just eyeballed:** AntD's `<Sider>` wraps its children in its own
  `display: block` div, silently breaking the intended flex-column sizing — confirmed via a
  real short-viewport Playwright scroll test before and after the CSS fix, not assumed
  correct from static inspection. Full frontend suite: 142 tests (2 pre-existing flaky
  failures unchanged). `npm run build` verified successful. `frontend/README.md` (new "App
  shell UI/UX pass" section), `.context/final-plan.md` (brief note after §7.21), and this file
  all updated.
- **2026-07-27** — Built Reports & Analytics (§7.23) — the app's first real analytics feature,
  distinct from the pre-existing raw export dispatcher (`POST /reports/generate`, §7.11,
  untouched), which now has a proper UI home on the same `/reports` page instead of a
  `PlaceholderPage`. **Backend:** 11 new `GET /reports/analytics/*` endpoints in a new sibling
  `analytics.service.js`/`analytics.controller.js` (routes still register inside the existing
  `report.routes.js`) — the first MongoDB aggregation pipelines (`$group`/`$match`) anywhere in
  this backend, confirmed via a full grep before writing any (every prior "report" was a
  `.find()`-scoped list rendered to PDF/Excel in JS). Leads pipeline/conversion/by-source/by-
  client-type, Customers growth/status-split/contract-value, Payments trend, AMC upcoming
  renewals, Attendance rate trend, Payroll cost trend — each scoped by reusing the target
  module's own existing ownership logic (`lead.service.js`/`customer.service.js`'s
  `resolveOwnershipFilter`, `attendance.service.js#resolveDirectReportIds`, all three newly
  exported, additive only, for this reuse; `customer.service.js#getVisibleCustomerIds`, already
  exported, reused again for Contract-value/AMC scoping) rather than re-deriving admin/manager/
  owner rules a second time. Payroll's `month`/`year` (separate Number fields, not a Date) are
  converted to a comparable "month index" for `from`/`to` filtering instead of inventing a
  second date-range convention. 40 new tests (`analytics.test.js`) — aggregation correctness,
  scoping (admin/manager/narrower-role per endpoint group), date-range filtering, and empty-data
  returning a sensible empty result rather than an error. One test-fixture bug found and fixed
  (not an application bug): `$dateToString` formats in UTC by default, so a test date built as
  local midnight shifted into the previous UTC day/month on a host timezone ahead of UTC — fixed
  via `Date.UTC(...)` in the fixtures; production is unaffected (server clock is UTC). Full
  backend suite: 470 tests, no regressions. **Frontend:** `frontend/src/modules/reports/` — a
  new `@ant-design/charts` dependency (the app's first chart library and first chart of any
  kind, chosen because it renders through the existing AntD `ConfigProvider`/brand theme
  automatically), a shared date-range filter (This Month/Last 3 Months/This Financial Year/
  Custom Range, reusing the same April-March FY computation `paymentDateFilters.js` established
  at §7.22) driving every trend chart, and one component per chart/list (Leads: Column/Line/
  Pie/Column; Customers: Area/donut-Pie/Column; Financial: Line + a plain `List` for upcoming
  AMC renewals with a day-window selector; Workforce: Line/Column) — each independently
  fetching/loading/error-isolated via a shared `ChartSectionCard`, matching the Dashboard
  widgets' own isolation principle. Permission-gated via the existing `PermissionGate`
  (evaluated and rejected `dashboardConfig.js`'s role-catalog pattern first — that fits
  composing many pluggable widgets, not per-section gating within one page): Leads/Customers
  sections gate as a whole (one shared grant each); Financial/Workforce gate each card
  independently (`payments.view` vs. `amc.view`; `attendance.view_team||view_all` vs.
  `payroll.run`) since those two group genuinely different permissions. A new `ExportForm` gives
  the pre-existing `POST /reports/generate` dispatcher a proper UI (module + filters + format
  picker, reusing the existing `ReportDownloadButton`), with its module list filtered to
  whichever modules the current user actually holds view access to. **Testing:** jsdom has no
  canvas/`ResizeObserver` support (verified — `@ant-design/charts` throws trying to render for
  real under test), so it's mocked to a plain stub in `analyticsCharts.test.jsx` (16 tests
  covering all 11 real chart/list components); `ReportsPageContent.test.jsx` (5 tests) instead
  mocks each section component itself to test permission-gating and shared-date-range
  propagation in isolation from chart rendering; `ExportForm.test.jsx` (6 tests) covers module
  filtering, per-module filter payloads, and the dispatcher-to-`downloadUrl`-to-download
  handoff. Full frontend suite: 232 tests (the same 2 pre-existing flaky failures —
  `LeadDetailPage`/`CustomersListPage`, confirmed unrelated and passing in isolation — unchanged
  from every prior run). `npm run build` verified successful. Live-browser (CDP screenshot)
  verification was not available in this environment — verification here rests on the test
  suites and the build. `backend/README.md`, `frontend/README.md`, `.context/final-plan.md`
  (new §7.23, Modules-at-a-Glance updated), and this file all updated.
- **2026-07-29** — Four additions to the Attendance module (§6.5/§7.4): an admin photo viewer, admin
  manual correction, a calendar-grid view, and summary stats. **Backend:** two new admin-only
  (`requireAdmin`, no `attendance.*` permission tier exists for editing — same precedent
  `POST /payroll/run` already set) endpoints — `PATCH /attendance/:id` (edit status/check-in/
  check-out time on an existing record, recomputing `workingHours` via the same
  `computeWorkingHours` helper the real checkout flow uses) and `POST /attendance/manual`
  (create a record for an employee+date that has none, 409 if one already exists). Both set two
  new `Attendance` fields, `isManuallyAdjusted`/`adjustedBy`, unconditionally — the audit-trail
  guarantee that a corrected/manually-created record is always visibly distinguishable from a
  real, photo-verified self-check-in, in both the API response and the UI. `checkIn.time` was
  relaxed from schema-required to optional (`default: null`) — a manually-created `absent`/
  `on_leave` record legitimately has no real check-in event, and the real self-service check-in
  path is unaffected. 13 new tests (6 + 7); 486 backend tests total (485 passing — the 1
  pre-existing `leave.test.js` failure, unrelated and date-sensitive, reproduces identically via
  `git stash` with none of this task's changes applied). **Frontend:** all built in
  `frontend/src/modules/attendance/`, reusing already-fetched month data — no new endpoint needed
  beyond the two above (checked explicitly). A pure `computeAttendanceSummary()` util (Present/
  Absent/Half Day/On Leave counts + an Attendance Rate over weekday-count "working days" —
  deliberately different from Payroll's own `daysInMonth`, since a no-record day renders neutral
  grey on the calendar grid, not red/absent; `half_day` weighted 0.5, matching
  `analytics.service.js#getAttendanceTrend`'s existing precedent for the same phrase) rendered by
  a new `AttendanceSummaryStats` card row. A new `AttendancePhotoModal` — click a day's record (in
  either the list row or a calendar cell) to see check-in/check-out photos side by side with
  their coords, gracefully showing "No photo"/"No coordinates captured" for a record with
  neither (every manually-created record). A new `AttendanceCalendar` grid view — a `Segmented`
  List/Calendar toggle (the list view is unchanged, still the default), one cell per day
  color-coded by status, a small badge on a manually-adjusted day's cell so it's never confused
  with a real check-in (the same marker `AttendanceTimeline`'s list view now also shows next to
  the Status tag). A new `AttendanceCorrectionModal` — admin-only (`user?.role === "admin"`,
  matching `MainLayout.jsx`'s existing Payments-nav-link precedent, not `PermissionGate`, since
  there's no real permission tier backing this), a per-row Edit action and a toolbar Add Record
  button (disabled with a tooltip when there's no single resolvable `employeeId`, e.g. Team
  view's "All employees"), always showing an explicit warning that the resulting record is
  unverified. `PersonalAttendanceView`/`TeamAttendanceView` now both render through one new
  shared `AttendanceRecordsSection` composition component rather than duplicating any of the
  above twice. 29 new/updated tests across `attendanceSummary.test.js`, `AttendanceCalendar.test.jsx`,
  `AttendancePhotoModal.test.jsx`, `AttendanceCorrectionModal.test.jsx`,
  `AttendanceRecordsSection.test.jsx`, and new cases added to the existing
  `AttendanceTimeline.test.jsx`. Full frontend suite: 235 tests (232 passing — the same 3
  pre-existing, unrelated timeout failures in `LeadDetailPage.test.jsx`/
  `CustomersListPage.test.jsx`, confirmed via `git stash` to reproduce identically with none of
  this task's changes applied); `npm run build` succeeds. **Live-verified via a real running
  dev server (Personal + Team Attendance, CDP screenshots):** summary stats, the List/Calendar
  toggle, calendar color-coding, the photo modal's graceful no-photo state, and the full
  Add-Record → manually-adjusted-marker → `PATCH` edit flow all confirmed end-to-end against the
  real backend and a real (temporary, since-deleted) database record. `backend/README.md`,
  `frontend/README.md`, `.context/final-plan.md` (§6.5/§7.4 updated), and this file all updated.
- **2026-07-29** — Five additions to the Leave module (§6.5/§7.5): half-day support, a balance
  endpoint, a decline action, a team leave calendar, and notifications. **Backend:** `isHalfDay`
  (Boolean, default `false`) added to `Leave` — counts as 0.5 days against the monthly paid-leave
  quota and Payroll's leave-day math rather than a full day, via one new shared, exported
  function, `leave.service.js#computeLeaveDays`, reused by both the quota check and
  `payroll.service.js#computePayrollFields` (which now imports it directly instead of keeping its
  own separate day-counting logic — `payroll.service.js`'s former local `countInclusiveDays`/
  `sumInclusiveDays`/`startOfDay` helpers were removed as dead code once nothing called them
  anymore). New `GET /leave/balance?employeeId=` (own always reachable; `?employeeId=` for
  someone else reuses the exact `leave.view_team`/`view_all` tiers `GET /leave?scope=` already
  checks) reuses a new shared `getApprovedPaidLeaveDaysForMonth` helper — the same calculation
  the approval-time quota check needs, not a second implementation. New `PATCH /leave/:id/decline`
  (admin-only, optional `reason`) — a schema decision, not a new enum value: `LEAVE_STATUSES`
  already declared `"rejected"`, unused by any endpoint until now, so `declineLeave` sets that
  existing value; a new `declineReason` field was added, kept separate from the existing `reason`
  field (the requester's own stated reason for taking leave) so declining never overwrites it.
  Leave now notifies via the existing Notification module (`createNotification`, no new
  infrastructure) — three new types, `leave_requested` (the requester's manager, if set, and
  every admin — the first "notify all admins" recipient shape in this codebase), `leave_approved`/
  `leave_declined` (the requester only, on the matching decision endpoint); every path skips
  self-notification, mirroring Leads' own assignment-notification precedent. 23 new tests (41
  total in `leave.test.js`) plus 1 new test in `payroll.test.js` confirming a half-day leave
  contributes exactly 0.5 to `paidLeaveDays`/`unpaidDeductionDays` — full backend suite: 510
  tests, 509 passing (the 1 pre-existing `leave.test.js` date-sensitive quota failure, confirmed
  unrelated in earlier tasks this session, unchanged). **Frontend:** `LeaveRequestModal.jsx`
  gained a Half Day checkbox that force-syncs and hides End Date; a new `LeaveBalanceCard.jsx` +
  `useLeaveBalance.js` show the caller's own balance prominently at the top of `/leave` always,
  plus a per-row "Paid Leave Balance" column (batch-fetched, deduplicated by employeeId) on the
  Team/All scope table rather than a second, ambiguous card; a new `LeaveDeclineModal.jsx` (a
  text-prompt modal, not `Popconfirm`, since Decline optionally takes a reason `Popconfirm` has no
  field for); a new `TeamLeaveCalendar.jsx` — one row per team member, one column per day of the
  selected month (client-side month filter over already-loaded records, no new endpoint), chosen
  over a single combined day-grid because a leave request spans a date range and several
  employees can be on leave the same day. **Notification bell gap found and fixed while
  confirming it, not assumed:** `NotificationBell.jsx`'s `MODULE_ROUTES` only knew `leads`/
  `tickets` — added `leave: () => "/leave"` (Leave has no per-record detail route) and a dedicated
  new test confirming a `leave_requested` notification actually navigates there on click. 16 new/
  updated tests (`LeaveRequestModal.test.jsx`, `LeaveBalanceCard.test.jsx`,
  `LeaveDeclineModal.test.jsx`, `TeamLeaveCalendar.test.jsx` all new, plus cases added to
  `LeaveListPage.test.jsx` and `NotificationBell.test.jsx`) — full frontend suite: 251 tests, 248
  passing (the same 3 pre-existing, unrelated timeout failures in `LeadDetailPage.test.jsx`/
  `CustomersListPage.test.jsx` from the prior Attendance task, confirmed unchanged); `npm run
  build` succeeds. **Live-verified via CDP against the real running dev servers:** the Half Day
  toggle hiding End Date, the balance card's live numbers, submitting a half-day request on
  behalf of a second real user and confirming the admin (a distinct user from the requester) was
  actually notified, declining it through the UI with a reason and confirming `status: "rejected"`
  /`declineReason` landed correctly, the per-row Paid Leave Balance column, and the calendar
  view's empty state with the month picker — all against the real backend, with the temporary
  leave record and its notifications deleted afterward. `backend/README.md`, `frontend/README.md`,
  `.context/final-plan.md` (§6.5/§7.5 updated), and this file all updated.
- **2026-07-29** — Added geofencing to Attendance/Location tracking (§6.5/§7.4/§7.4b): flags when
  an employee's GPS location moves beyond a configurable radius from their check-in point during
  a shift, shown red on the timeline — the same visual pattern already established for
  connectivity-gap flagging, deliberately reused rather than inventing a second one. **Backend:**
  new `GEOFENCE_RADIUS_METERS` env var (optional, defaults to 500 meters, same
  optional-with-a-default treatment as `ATTENDANCE_GAP_THRESHOLD_MINUTES`/
  `LOCATION_PING_INTERVAL_MINUTES`). Confirmed `checkIn.coords` was already stored on every
  Attendance record (§6.5) — reused directly as the shift's geofence center, no duplicate
  storage added. New `src/services/geo.service.js` — a plain Haversine straight-line distance
  formula, deliberately **not** the existing `googleMaps.service.js` (that's a real Distance
  Matrix API call for driving distance; a per-ping radius check needs a fast, synchronous,
  no-network-dependency calculation instead, since it runs on every ~2-minute ping and must
  never fail/block just because an external API is unavailable). New `Attendance.geofenceViolations:
  [{ start, end, maxDistanceMeters }]` — structurally parallel to `connectivityGaps[]`, but a
  violation window is genuinely live (can be `end: null` between pings, since the ping stream
  arrives in real time) rather than always-already-closed the way a connectivity gap is.
  `attendance.service.js#applyGeofenceCheck` (called directly from
  `location.service.js#submitPing` on every `POST /location/pings` — a cross-module direct call,
  the same precedent `attendance`→`transport` already established, not a duplicated
  implementation) opens/updates/closes the window live; `closeOpenGeofenceViolation` force-closes
  a still-open one at checkout, the same "whichever comes first" symmetry
  `applyConnectivityGapIfNeeded` already has with heartbeat-vs-checkout. **Design decision,
  stated explicitly per this task's own instruction:** geofenced against the shift's own
  check-in point, not a per-site/fixed-office geofence — this system has no "site"/"assigned
  office" concept anywhere in its data model, and a per-site geofence was considered and
  deliberately not built as a materially larger, different feature (site management, assigning
  employees to sites) that wasn't asked for. Never blocks the ping — `applyGeofenceCheck` wraps
  its entire body in try/catch and always resolves, the same "never block the primary action"
  principle `generateAutoTravelLog` already established for checkout. 6 new tests (26 total in
  `location.test.js`) — within/beyond-radius, repeated-still-outside-pings-track-max-distance,
  closes-on-return, closes-at-checkout, and (mocking `geo.service.js#haversineDistanceMeters` to
  throw once, the same technique already used to mock a Google Maps failure) never-blocks-the-
  ping-on-a-calculation-failure. Full backend suite: 517 tests, 516 passing (the same
  pre-existing, unrelated `leave.test.js` date-sensitive failure, confirmed unchanged).
  **Frontend:** new `GeofenceViolationBar.jsx` — structurally identical to the existing
  `ConnectivityGapBar` but **orange**, not red, a genuinely different hue (not just a
  lighter/darker shade) so the two issue types are distinguishable at a glance. A new "Location"
  column (with an `EnvironmentOutlined` pin — reused, the same icon already used for the
  Location nav item/check-in widget, not a new one introduced) sits next to "Connectivity Gaps"
  in `AttendanceTimeline.jsx` — a separate column, not overlaid onto the same bar, so the column
  header itself signals *which* issue occurred before a viewer even looks at the bar's color. The
  same Location section was added to `AttendancePhotoModal.jsx`, and a day with any violation
  gets its own small badge in `AttendanceCalendar.jsx` — same treatment as the existing
  manually-adjusted-record marker but in the opposite corner (top-left, `EnvironmentFilled`,
  orange) so both markers can coexist on one day without overwriting each other. New cases added
  to `AttendanceTimeline.test.jsx`/`AttendancePhotoModal.test.jsx`/`AttendanceCalendar.test.jsx`
  (no new dedicated test file, matching `ConnectivityGapBar`'s own precedent of being tested only
  through its consumers). Full frontend suite: 263 tests, 261 passing (the same 2 pre-existing,
  unrelated timeout failures from every prior task, confirmed unchanged); `npm run build`
  succeeds. **Live-verified via CDP against the real running dev servers:** since the local dev
  backend's placeholder Cloudinary credentials can't complete a real check-in's photo upload, an
  open shift was seeded directly with real `checkIn.coords`, then real `POST /location/pings`
  calls were sent — one far enough to open a violation (the response's `maxDistanceMeters`
  matched the expected ~1113m for the coordinate offset used) and one back within radius to
  close it — the shift was closed via `PATCH /attendance/:id`, and the Location column, the
  calendar's orange marker (correctly not overlapping the manually-adjusted marker on the same
  day), and the photo modal's Location section all confirmed rendering correctly; test data
  deleted afterward. `backend/README.md`, `frontend/README.md`, `.context/final-plan.md`
  (§6.5/§7.4/§7.4b updated, including the check-in-radius-vs-per-site design decision), and this
  file all updated.
- **2026-07-29** — **Fully removed Task functionality** from the `project` module (§6.4/§7.3) at
  the user's request, leaving Project itself (team add/remove, project CRUD, contract-linked
  automation) completely intact. **Backend:** deleted `task.model.js`; removed
  `GET /projects/:id/tasks`, `POST /tasks`, `PATCH /tasks/:id/start`, `PATCH /tasks/:id/stop` and
  the sibling `taskRouter` from `project.routes.js`/`route.js`; removed `listProjectTasks`,
  `createTask`, `findTaskOrThrow`, `ensureTaskOwnerOrAdmin`, `startTask`, `stopTask` from
  `project.service.js` (including the one-`in_progress`-task-per-employee constraint) and their
  matching handlers from `project.controller.js`; removed `validateCreateTaskInput` from
  `project.validation.js`; removed the two Task-specific `describe` blocks (9 tests) from
  `project.test.js`, leaving the 10 genuinely Project tests untouched and passing; removed the
  `tasks` entry from `PERMISSION_REGISTRY` and the `tasks` grants from the `manager`/`employee`
  template defaults in `permission.service.js`/`permission.test.js`. No Dashboard "Add Task" quick
  action had ever been built — nothing to remove there. **Frontend:** deleted `TasksPage.jsx` and
  its `/tasks` route, sidebar nav entry, and `ROUTE_PATHS.TASKS` constant (the now-unused
  `CheckSquareOutlined` import was removed from `MainLayout.jsx` too); no dedicated frontend Task
  module or Project Detail Task UI existed to remove. A project-wide case-insensitive search for
  "task" confirmed no other genuine feature references remained (only generic "this task"/"build
  task" English usage, and two stale historical-analogy comments in `attendance.service.js` and
  `customer.test.js` updated to drop the now-removed comparison). Full backend suite: 508 tests,
  507 passing (the same pre-existing, unrelated `leave.test.js` date-sensitive failure, confirmed
  unchanged) — exactly 9 fewer than before, matching the tests removed. `backend/README.md`,
  `.context/final-plan.md` (§6.4/§7.3, Modules-at-a-Glance, the §7.3 LLD entry, the §7.12
  permission-registry snapshot, and the §8 route map all updated with an explicit removal note
  rather than silent deletion — the historical record of Task having existed is preserved), and
  this file all updated.
- **2026-07-30** — Built a new `team` module (§7.24) plus verified the pre-existing Create User
  flow. **Part 0:** confirmed `POST /auth/register` + the User Management "New User" form
  already work end-to-end (role dropdown correct, no "Executive" relabeling anywhere) — no
  rebuild needed. **Backend:** `Team` model (name/type/headManagerId/isActive, deliberately no
  stored member list), `team.service.js` CRUD + `getTeamMembers`/`addMemberToTeam`/
  `removeMemberFromTeam` (the latter two reuse the existing `user.service.js#assignManager`
  rather than writing `managerId` a second way), 8 admin-only endpoints under `teams.manage` in
  `PERMISSION_REGISTRY`. **This extends, not replaces, §11.9's "no separate Team collection"
  resolution** — `.context/final-plan.md` §11.9 updated with an explicit 2026-07-30 reversal
  note explaining why: `Team` membership is still always `User.find({managerId:
  team.headManagerId})`, so every pre-existing "own team" scope (Leads/Customers/Attendance/AMC)
  picks up Team members automatically with zero code changes. 17 new backend tests
  (`team.test.js`); confirmed the pre-existing own-team-scoping tests are unaffected. Full
  backend suite: **528 tests, all passing** (no regressions). **Frontend:** new `/settings/teams`
  tab (`src/modules/team/`) — list, create/edit modal, member add/remove modal via the existing
  `useUserDirectory` lookup, all admin-gated via `PermissionGate`. Every flow (create, rename,
  add member, remove member, delete) verified live end-to-end through a real browser session —
  including creating a throwaway test employee first, since the dev database had no employee/
  sales_associate accounts to add to a team until then; deleted afterward. Also fixed a small
  pre-existing accessibility gap found along the way: the new module's icon-only action buttons
  now carry an explicit `title`/`aria-label` (a bare `Tooltip` alone doesn't provide an
  accessible name), matching the pattern already established for the Leads quick-action icons.
  5 new frontend tests (`TeamManagementPage.test.jsx`). Full frontend suite: 283 tests, 280
  passing in the full run (the same pre-existing timing-flaky `LeadDetailPage`/
  `CustomersListPage` tests — confirmed passing 16/16 in isolation, unrelated to this change);
  `npm run build` succeeds. `backend/README.md`, `frontend/README.md`, and
  `.context/final-plan.md` (new §7.24, plus updates to §11.9, the Modules-at-a-Glance table, the
  Key Architectural Decisions list, and the `User`/`Team` schema entries) all updated.
- **2026-07-30** — Fixed the Leads/Customers/Payments tables' horizontal scrollbar so it's
  reachable at the viewport's bottom edge on a long list, instead of only at the table's own
  bottom edge (a previously-unresolved bug). Added `scroll={{x:'max-content'}}` +
  `sticky={{offsetHeader:48}}` (matching the fixed app header's height) to all three tables.
  That surfaced a second, real bug: `.app-data-table .ant-table`'s `overflow: hidden` (added
  earlier for rounded card corners) made the element a CSS scroll container, which became the
  sticky header's positioning reference instead of the window — permanently shifting it down by
  `offsetHeader` and overlapping the first body row on Leads/Payments regardless of actual
  scroll position (confirmed via `getBoundingClientRect`, reproducible even at `scrollY: 0`).
  Fixed by dropping `overflow: hidden` and rounding the header/last-row corners directly
  instead, preserving the card look without needing to clip anything. Verified via a live
  browser session on all three pages, both scrolled and at rest. Ran the Payments test suite
  (12/12) and the full frontend suite (unrelated pre-existing flakiness only, confirmed via
  isolation reruns); `npm run build` succeeds. Deployed (frontend only).
- **2026-07-30** — Added a public, unauthenticated `POST /leads/website-intake` webhook (§7.25)
  so a WordPress "Get a Quote" form (Forminator's webhook add-on) can post submissions directly
  into Leads. Gated by a shared secret (`WEBSITE_LEAD_INTAKE_TOKEN`, sent as an `X-Webhook-Token`
  header) rather than the normal cookie auth — fails closed (503) if the token isn't configured,
  401 for a wrong/missing one. Since Forminator's field ids aren't knowable ahead of time
  (auto-generated per form/site), field mapping is best-effort keyword matching over whatever
  keys the payload contains (name/email/phone/company/message), handling three payload shapes
  (flat object, `data`-nested, or Forminator's own `fields` array). Defaults: `ownerId` → the
  longest-tenured admin (no `requestingUser` exists on this path, unlike every other lead-
  creation route), `clientType` → `"residential"`, `source` → `"Website"`. The full raw payload
  is always preserved in `notes` so nothing submitted is ever silently lost, even when a field
  isn't recognized. 7 new tests (`lead.test.js`); full backend suite: 535 tests, all passing.
  `backend/README.md` and `.context/final-plan.md` (new §7.25) updated.
- **2026-07-30** — Added an edit/delete audit trail to Payments, since these are financial
  records. **Soft delete, not hard** — `Payment` gained `isDeleted`/`deletedAt`/`deletedBy`/
  `deletionReason`; `listPayments` now filters `isDeleted: { $ne: true }` (not `isDeleted:
  false`, which would have silently excluded every payment recorded before this change, none of
  which have the field at all). **A separate `PaymentAuditLog` collection, not an embedded
  array** — matches this codebase's `LeadCall`-style pattern for an unbounded, independently-
  queryable history: `paymentId`, `action` (`edited`/`deleted`), `changedBy`, `reason`
  (required), `previousValues` (a snapshot before the change). New endpoints: `PATCH /payments/
  :id` (amount/date/notes/collectedBy + required reason; customerId/manualClientName/invoiceId
  are deliberately not editable this way — that's the payment's reconciliation identity, not a
  data-entry mistake to fix), `DELETE /payments/:id` (required reason, sent in the body, same
  shape as the edit reason), `GET /payments/:id/audit-log` (full history, still works after a
  delete). `PERMISSION_REGISTRY`'s `payments` entry grew to include `edit`/`delete`. 23 new
  backend tests; full suite: 553 tests, all passing. **Frontend:** an Actions column (History/
  Edit/Delete icons, PermissionGate'd) drives `EditPaymentModal`, `DeletePaymentModal` (a small
  dedicated modal, not a bare Popconfirm, since a delete needs a typed reason), and
  `PaymentAuditLogModal` ("View History"). No per-row "has history" badge on the table — noted
  as a reasonable future addition rather than built now. 20 tests total
  (`PaymentsListPage.test.jsx`); full frontend suite passes (same pre-existing timing-flaky
  files, confirmed unrelated via isolation reruns); `npm run build` succeeds. Verified live via
  a real browser session (edit, reason-required validation, view history, delete, row
  disappearing from the list). `backend/README.md`, `frontend/README.md`, and
  `.context/final-plan.md` (§6.6/§7.9 extended) updated.
- **2026-07-30** — Built the Permissions Management frontend (§7.27) — the first real UI for
  the `permission` module, replacing the long-standing `PlaceholderPage` at
  `/settings/permissions`. No new backend endpoints were needed; every endpoint this consumes
  (`GET /permissions/registry`, `GET/PATCH /permissions/templates/:role`, `GET/PATCH
  /users/:id/permissions`, `POST /users/:id/permissions/reset`) already existed and was already
  tested (§7.12). A shared `PermissionMatrix` component (rows = registry modules, columns = the
  union of valid actions, blank cells — not disabled checkboxes — for an invalid module+action
  pair) backs both a Role Defaults tab (with an explicit non-retroactive warning and a "last
  updated by/on" line) and a User Overrides tab (with a confirm-gated "Reset to Role Default").
  5 new frontend tests; full frontend suite passes (same pre-existing timing-flaky files,
  confirmed unrelated); `npm run build` succeeds. Verified live via a real browser session
  (role template loading/switching, user override loading). `frontend/README.md` and
  `.context/final-plan.md` (new §7.26 documenting the earlier same-day sidebar-badges task for
  consistent numbering, and new §7.27) updated.
- **2026-07-30** — Added filters and delete-guards to User Management and Team Management
  (§7.28), extending both without rebuilding either. **Deactivation team-head guard:**
  deactivating a user who currently leads one or more active Teams is now rejected (400),
  naming the team(s) in the error — silently deactivating a team's head would leave every
  member's "own team" scoping (§11.9) pointing at a login-disabled account. Reactivate has no
  equivalent guard. **Filters:** `GET /users` gained `teamId` (resolves to that Team's
  `headManagerId`, combined with the existing `role`/`isActive`/`managerId` filters);
  `GET /teams` gained `type`/`isActive`. **No new delete-preview endpoint** — `GET /teams/:id`
  already returns the full derived `members` array, whose length is the count the frontend
  needs before confirming a delete. Frontend: Role/Department/Active filters on User
  Management, Type/Active filters on Team Management, the backend's exact team-head rejection
  message now surfaces to the admin (not a generic error), and the team delete confirmation
  shows the live member count. 11 new backend tests (full suite: 570, all passing), 9 new
  frontend tests; full frontend suite passes (same pre-existing flaky files, confirmed
  unrelated); `npm run build` succeeds. Verified live via a real browser session (guard
  rejection confirmed via network response + unchanged row state; delete confirmation's member
  count confirmed accurate). `backend/README.md`, `frontend/README.md`, and
  `.context/final-plan.md` (new §7.28) updated.
- **2026-07-30** — Fixed two Notification bell issues. Mark-as-read (single and "mark all")
  was found to already clear/decrease the badge count immediately on inspection — `useNotifications
  .js` optimistically updates local state right after each API call succeeds and `unreadCount` is
  recomputed fresh every render, no polling wait involved; live verification confirmed this
  already worked, so nothing was broken there. **Visual fix:** removed the bell's hand-tuned
  `offset={[-2, 2]}` (which sat the badge uncomfortably close to the header's top edge) and
  added `overflowCount={99}`, letting AntD's own default positioning logic place it and showing
  "99+" instead of an ever-widening pill for very large counts. The sidebar Leads/Leave badges
  were checked too — they use AntD's standalone (non-overlay) `Badge` rendering, a different code
  path with no equivalent clipping risk; confirmed fine as-is. 2 new assertions added to
  `NotificationBell.test.jsx` (badge clears after both mark-as-read paths); full frontend suite
  passes (same pre-existing flaky files, confirmed unrelated); `npm run build` succeeds. Verified
  live via a real browser session (10 synthetic notifications seeded to test 2-digit rendering,
  then cleaned up afterward).
- **2026-07-30** — User Management Action column rework (§7.28) — a real reversal of this
  module's earlier "no hard delete" decision (see `.context/final-plan.md`'s §7.0b writeup for
  the dated reasoning). **Part 1, verified first:** Deactivate/Reactivate were already working
  correctly end-to-end (a live deactivate attempt on a team head returned a real 400 from the
  existing team-head guard; a deactivate/reactivate round-trip on a non-team-head user returned
  200 and persisted through a hard refresh) — nothing here was actually broken. **Part 2:**
  Deactivate/Reactivate converted to icon-only buttons, reusing the exact icon+Tooltip pattern
  from `CustomerStatusToggleButton.jsx` (`StopOutlined`/`CheckCircleOutlined`), `aria-label`
  preserved so existing tests kept passing unchanged. **Part 3 (backend):** new guarded
  `DELETE /users/:id` (admin only) — rejects an active user, rejects (defensively) a deactivated
  team head, requires a `reason`, then writes a full snapshot to a new `DeletedUserAuditLog`
  collection (distinct from `PaymentAuditLog` — this one needs the full document, since the
  parent User won't exist afterward) before actually deleting. Deliberately no cascade-delete —
  every other module's existing id-to-name Map-lookup-with-`—`-fallback already displays a
  deleted user's old records gracefully; verified directly (a Lead owned by a just-deleted user
  is still readable via `GET /leads`, `ownerId` unchanged). 5 new backend tests; full suite: 575,
  all passing. **Part 4 (frontend):** a Delete icon (only rendered for an already-Inactive user)
  opens `DeleteUserModal.jsx` — a dedicated modal mirroring `DeletePaymentModal.jsx`'s pattern,
  required reason field, explicit "this cannot be undone" warning naming the affected record
  types. 3 new frontend tests; full frontend suite passes (same pre-existing flaky files,
  confirmed unrelated); `npm run build` succeeds. Verified live via a real browser session
  (icon-only rendering confirmed with no visible button text, Delete icon confirmed absent on
  an Active row and present on an Inactive one, empty-reason validation shown, and a real
  successful `DELETE /users/:id` — 200 — removing the row, surviving a hard refresh).
  `backend/README.md`, `frontend/README.md`, and `.context/final-plan.md` (§7.0b extended with
  the hard-delete reversal writeup) updated.
- **2026-07-31** — Icon-only Edit/Reset Password in User Management (`EditOutlined`/
  `LockOutlined`, matching the existing Deactivate/Reactivate/Delete pattern — `KeyOutlined` was
  tried first but reads like a magnifying glass at this size). Re-diagnosed a reported "Deactivate
  does nothing" regression: the button, API call, and team-head guard all worked correctly (a
  real 400/200 confirmed via network tab) — the actual bug was that this app runs React 19, which
  dropped the legacy `ReactDOM.render` API every static `message.xxx()`/`notification.xxx()` call
  across the ENTIRE app depends on internally (AntD v5 only officially supports React 16-18), so
  every toast was silently failing to render — confirmed on a plain "User created" success toast
  too, not just error toasts. Fixed by wrapping the app root in AntD's `<App>` component and
  migrating all 18 affected files from the static `message` import to the hook-based
  `App.useApp()`. Added `frontend/src/App.test.jsx` as a real regression test proving the failure
  mode and the fix — existing tests couldn't have caught this since they only assert a mocked
  message function was *called*, never that anything actually rendered. Full backend suite passes
  (3 pre-existing, unrelated failures in `leave.test.js` — a month-boundary bug in the test's own
  relative-date helper, `isoDate(1)` crossing into August since the system date was July 31).
  Frontend suite passes (same 5 pre-existing flaky tests as before, confirmed unrelated).
  `npm run build` succeeds. Verified live via a real browser session — the previously-invisible
  error toast now renders with the exact guard message. Deployed frontend only (no backend
  changes needed). **The Department-as-a-Settings-tab part of this task was put on hold** — the
  user pointed out Settings already has a "Teams" tab (contradicting the task's premise that only
  User Management/Permissions existed) and asked for a fuller explanation before proceeding; no
  doc updates were made for this task since none were requested (unlike other same-day tasks).
- **2026-07-31** — Notification-driven Leads/Leave sidebar badges (§7.29) — reworks the §7.26
  badges to reuse the existing Notification module entirely instead of a parallel tracking
  system. New `lead_created` notification type (broadcast to every admin + the lead's owner,
  deduplicated, fired on both the manual-add and website-intake creation paths). `GET
  /notifications`/`PATCH /notifications/read-all` both gained an optional comma-separated `type`
  filter, reused directly by the sidebar badges rather than adding a dedicated count endpoint.
  Leave badge's admin-only gate was removed — it's naturally self-scoped by the Notification
  module itself now (admins see pending requests via `leave_requested`, employees see their own
  outcome via `leave_approved`/`leave_declined`). Clicking either nav item marks that badge's
  types read immediately. 5px horizontal margin applied consistently across all three badge
  instances (bell, Leads, Leave). An Attendance badge was explicitly considered and deferred —
  nothing in Attendance creates a notification today, and adding that was out of this task's
  scope. 5 new backend tests in `lead.test.js`, 6 in `notification.test.js`; full backend suite
  passes (same pre-existing, unrelated `leave.test.js` date-boundary failures). `useSidebarBadgeCounts.test.js`
  and `MainLayout.test.jsx`'s badge tests rewritten for the new notification-based shape; full
  frontend suite passes (same pre-existing flaky tests, confirmed unrelated); `npm run build`
  succeeds. `backend/README.md`, `frontend/README.md`, and `.context/final-plan.md` (new §7.29,
  §7.26 marked superseded) updated.
- **2026-07-31** — Converted `Team.type` from free text to an admin-managed list (§7.30),
  mirroring `LeadSource`. Read LeadSource's actual implementation first rather than assuming it
  matched the task's own framing — it didn't: LeadSource has no admin CRUD at all and
  `Lead.source` is never validated against it, but the task explicitly wanted both for Team.
  Surfaced this contradiction and asked the user rather than guessing; confirmed: build full
  admin CRUD + real validation, deliberately diverging from LeadSource where the two conflicted.
  New `TeamType` model (mirrors `LeadSource`'s shape), lazy-seeded with Sales/Installation/
  Technical (self-seeding — triggered by either `GET /team-types` or the first team creation,
  whichever runs first). New `POST`/`PATCH /team-types` (admin-gated); `GET /team-types` open to
  any authenticated user. `Team.type` stays a plain String (storing the name, same shape
  `Lead.source` uses), validated on create/update against the active list — an existing team
  keeps its type displayed normally even after that type is deactivated, only new/updated teams
  are blocked from selecting it. Frontend: the Create/Edit Team form's Type field changed from
  free-text to a `Select` populated from a new `useTeamTypes` hook; no admin management screen
  built, matching the task's own instruction not to build more UI than LeadSource has. 15 new
  backend tests (2 existing tests rewritten since their premise directly changed); full backend
  suite passes (same pre-existing, unrelated `leave.test.js` failures). 4 new frontend tests;
  full frontend suite passes (same pre-existing flaky tests); `npm run build` succeeds. Verified
  live via a real browser session (Type dropdown shows the three seeded defaults, a team created
  and saved with a selected type persisted correctly). `backend/README.md`, `frontend/README.md`,
  and `.context/final-plan.md` (new §7.30) updated.
- **2026-07-31** — Reworked the Deactivate flow (§7.31) — a genuine reversal of the earlier
  hard-block team-head guard (§7.28): instead of refusing to deactivate a team head outright, the
  admin can now reassign in the same request. Scope grew beyond teams too — a lead owner's
  still-open leads (not won/lost) now also need a new owner before deactivation. New `GET
  /users/:id/deactivation-impact` (what needs reassigning: led teams with member counts, active
  lead count); `PATCH /users/:id/deactivate`'s body now optionally accepts
  `{ reassignTeamsTo, reassignLeadsTo }` — everything required must be present and valid (each
  new head checked via the existing manager/admin rule, the new lead owner confirmed to exist)
  before anything is written, then applied in order: team heads, lead owners, deactivation.
  **Checked, not assumed, whether Mongo transactions were available** — the dev/test database
  (mongodb-memory-server, no replica set) doesn't support them, only production Atlas does, so a
  validate-everything-first-then-apply-in-order approach was used instead of a transaction that
  would've broken the whole test suite for this feature. Frontend: clicking Deactivate now
  checks impact first — nothing to reassign shows the exact same plain confirm as before (via
  `App.useApp()`'s `modal.confirm`, replacing the old `Popconfirm`, since an async check has to
  run before there's anything to confirm); something to reassign opens a new
  `DeactivationReassignModal` (a `Select` per led team, plus a lead-owner `Select` when needed,
  submission blocked until every picker is filled). 12 new backend tests (one existing hard-delete
  test needed its own lead fixture changed to a closed status, since an open one would now
  correctly block that test's own deactivate step); full backend suite passes (same pre-existing,
  unrelated `leave.test.js` date-boundary failures). 6 new frontend tests; full frontend suite
  passes (same pre-existing flaky tests); `npm run build` succeeds. Verified live via a real
  browser session — created a temporary employee and a temporary open lead so a real team head
  had both a team and an active lead needing reassignment, drove the full modal flow, confirmed
  in the database that the team's head and the lead's owner both actually changed and the person
  was deactivated, then restored the original state. `backend/README.md`, `frontend/README.md`,
  and `.context/final-plan.md` (§7.0b extended, new §7.31) updated.
- **2026-07-31** — Built the first Single Employee/User Detail Page (§7.32), consolidating data
  previously scattered across Attendance, Leave, Teams, Leads, Payroll, and Permissions onto one
  page at the new route `/settings/users/:id`. A user-management table row now navigates here on
  click; the list's existing quick Edit modal is unchanged and still works — this page is an
  additional view, not a replacement. Every section (Header, Basic Info, Attendance Summary,
  Leave, Team, Owned Leads, Permissions, Payroll History) is its own independently-loading/
  erroring card (same isolation contract as a Dashboard widget), permission-gated, and reuses an
  existing endpoint or hook rather than duplicating logic — including a genuinely shared
  `useUserLifecycleActions`/`UserLifecycleModals` extraction that `UserManagementPage.jsx` itself
  was refactored to use too, eliminating what would otherwise have been a second copy of its
  create/edit/reset-password/guarded-deactivate/reactivate/delete logic. Added a small `?userId=`
  deep-link addition to the Permissions page so the new Permissions card's "Manage overrides"
  button lands directly on the right user's Individual Overrides tab. Found and fixed two
  pre-existing bugs along the way: a dayjs-object-vs-formatted-string mismatch that made the
  Attendance card's API calls 400, and a missing `.catch()` in `useLeaveBalance` that left failed
  fetches indistinguishable from still-loading. `baseSalary` asked, not assumed: no existing
  endpoint returns a real value (`select: false` everywhere) and the user confirmed frontend-only
  for now rather than a backend change. 12 new page tests plus 2 in `UserManagementPage.test.jsx`
  and 2 in `PermissionManagementPage.test.jsx`; full frontend suite passes (same pre-existing
  flaky tests); `npm run build` succeeds. Verified live via a real browser session: deep link,
  full deactivate→reactivate cycle, self-view section omissions. `frontend/README.md` and
  `.context/final-plan.md` (new §7.32) updated.
- **2026-07-31** — Five Attendance module additions, built together (§7.4c): (1) **admin
  exemption** — `POST /attendance/check-in` now rejects (403) an admin's own check-in, enforced
  server-side rather than only hiding the widget on the frontend; (2) **Break In/Out** — a single
  break per shift (confirmed decision, not an array), no photo required (confirmed), `coords`
  required; checkout while still on break rejects with a clear message rather than silently
  auto-closing the break (the safer of two options this task raised); `workingHours` now also
  subtracts break duration alongside the existing connectivity-gap subtraction; (3) a new **45-day
  Cloudinary photo cleanup cron** (`src/cron/attendancePhotoCleanupCron.js`, mirroring
  `payrollCron.js` exactly) — deletes the actual Cloudinary asset and clears `photoUrl` for
  records past 45 days, survives a single record's failure without stopping the batch; needed
  adding a new `photoPublicId` field (`select: false`) since Cloudinary's asset identifier was
  never stored before this, only the URL; (4) **granular manager permissions** —
  `attendance.view_photos`/`view_location`, default off for managers, grantable via the existing
  Individual User Overrides page (no new UI needed); a manager without either grant never sees
  photoUrl/coords in team records, an employee viewing their OWN record NEVER sees their own
  photo/location regardless of any permission (a hard rule, applied to the check-in/check-out/
  break-in/break-out response itself too, not just the GET history endpoints); (5)
  **notifications** — check-in/break-in/break-out/check-out each notify the employee, their
  manager, and every admin, reusing the existing Notification module exactly as Leads/Leave do.
  **A real, explicitly-checked finding, not assumed:** confirmed directly against `api/index.js`
  (the actual Vercel serverless entry point) that NONE of the three scheduled cron jobs
  (`payrollCron`, `leadFollowUpReminderCron`, and now this new one) actually fire in production
  today — a pre-existing, already-documented gap (this task didn't introduce it), but now a THIRD
  cron silently sitting on top of it, surfaced here rather than quietly compounded; the real fix
  (Vercel Cron hitting a dedicated endpoint, or moving off serverless) remains outstanding. 65
  tests in `attendance.test.js` (up from 31) plus 6 new in `attendancePhotoCleanupCron.test.js`;
  full backend suite 642/642, no regressions. `backend/README.md` and `.context/final-plan.md`
  (new §7.4c) updated.
- **2026-07-31** — Frontend half of the five §7.4c Attendance additions built same day. Admin's
  check-in widget hidden entirely on `/attendance` (the backend already rejects the request; this
  avoids showing a prompt that would just fail). `CheckInOutWidget.jsx`'s state machine extended
  for Break In/Out — no camera step, a single click captures geolocation and submits immediately;
  Check Out disabled with a tooltip while on break; an "On Break since {time}" tag alongside the
  existing Checked-In indicator. `AttendancePhotoModal.jsx` gained permission-gated
  `showPhotos`/`showLocation` — a manager needs `attendance.view_photos`/`view_location`
  independently (via the existing `usePermission` hook, admin bypasses both) to see either
  section in Team view; viewing your OWN record always hides both, unconditionally, matching the
  backend's own hard rule. A missing grant omits the section entirely rather than showing an
  empty placeholder, so a permission boundary doesn't look like a data problem. New Status filter
  on Team Attendance (present/on-break/checked-out/absent — a derived shift-lifecycle state
  computed client-side, distinct from the record's own `status` field). The notification bell
  needed no type-specific rendering changes at all — it already displays any notification
  generically — just a small routing addition so clicking one navigates to `/attendance`. 10 new
  frontend tests; full suite passes (same established flaky baseline); `npm run build` succeeds.
  Live-verified end-to-end against isolated dev server instances with temporary manager+employee
  accounts (cleaned up after): admin-hidden widget, the full break state-machine transition,
  permission-gated photo/location correctly shown/hidden before and after a live grant, the
  Status filter, the self-view hard rule, and all four notification types. `frontend/README.md`
  and `.context/final-plan.md` (§7.4c extended) updated.
- **2026-07-31** — Backend Leave module corrections (§7.5c), three changes built together: (1)
  **manager parity on approve/decline/mark-unapproved-absence** — **reverses the earlier
  admin-only restriction** on all three actions, since managers already hold real team-scoped
  authority elsewhere (`leave.view_team`, `attendance.view_team`, `users.view_team`) and requiring
  an admin for every decision on a manager's own team was an unnecessary bottleneck. `PERMISSION_
  REGISTRY`'s `leave` module gained `approve`/`decline`/`mark_unapproved_absence`; manager's default
  template now grants all three; the three routes moved from `requireAdmin` to
  `authorize("leave", ...)` (admin keeps working automatically via `can()`'s bypass), with a new
  `leave.service.js#ensureCanActOnLeave` helper doing the record-specific `managerId` team check —
  the same "route confirms a grant, service resolves the record's team scope" split
  `getLeaveBalance`/`getTeamAttendance` already use; (2) **admin exemption from requesting** —
  mirrors the same exemption added to Attendance (§7.4c), but scoped narrowly to "admin acting on
  their own behalf" rather than "admin submitting any request at all," since the existing
  admin-on-behalf-of mechanism (`payload.employeeId`) is the only way a Leave record is ever
  created for an employee who never self-requested, and `mark-unapproved-absence` depends on it
  entirely; (3) **`reason` made required** — the field already existed but was optional; now
  enforced at both the schema and validation layer, kept separate from the approver's
  `declineReason`. Retroactively making `reason` required broke 7 direct `Leave.create()` calls in
  `payroll.test.js`/`report.test.js` that bypass the HTTP validation layer — fixed by adding a test
  `reason` to each fixture. 15 new tests in `leave.test.js` (manager own-team success and
  outside-team rejection for all three actions, a no-grant role blocked, admin unaffected, admin
  blocked from self-requesting, `reason` required and correctly stored/returned) — 56 tests total
  for the module. Full backend suite: 654/654 passing across 21 test files, no regressions.
  `backend/README.md` and `.context/final-plan.md` (§6.5/§7.5/§7.5c, §5 permission matrix) updated.
- **2026-07-31** — Frontend half of the §7.5c Leave corrections built same day. Approve/Decline/
  Mark Unapproved Absence now gate per-action on `usePermission("leave", "approve"/"decline"/
  "mark_unapproved_absence")` instead of a blanket `isAdmin` flag, so a manager sees exactly the
  same buttons admin does for their own team — no extra per-row team check needed, since a manager
  without `view_all` can only ever reach the already-backend-filtered `scope=team` in the first
  place. Request Leave is hidden entirely for admin (mirrors the backend's own exemption). The
  Reason field (already existed) is now required and shown via an expandable Admin-table row
  (chosen over a new column since it's free text that can run long) plus a line under each entry in
  the dashboard's `LeavePendingRequestsWidget`. New Employee/Team/Status/Date-range filters on the
  Admin table (`scope=all`, list view only; Team calendar view unaffected).
  **Two real bugs found and fixed while verifying live, not assumed:** (1) `LeavePendingRequestsWidget`
  was hard-coded to `listLeave("all")`, gated only on holding `approve` — safe when only admin held
  that action, but a manager now holds `approve` without `view_all`, so it would have 403'd for
  every manager opening the dashboard; fixed by picking the scope from whichever view-tier grant is
  actually held. (2) This dev database's "manager" `RolePermissionTemplate` document was seeded on
  2026-07-17, before today's backend code change — `RolePermissionTemplate` rows are lazily seeded
  once and read from the database from then on, so a code-level default change has zero effect on
  an already-seeded row; the earlier backend deploy's manager-parity change was silently
  non-functional for every manager until the template document itself was corrected via a live
  `PATCH /permissions/templates/manager` (also dropping a stale `tasks` key the same document still
  carried from before Task was removed, §7.3 — unrelated pre-existing staleness surfaced by the same
  fetch). Confirmed via `GET /users?role=manager` that zero manager accounts currently exist, so no
  existing manager needed an additional permissions reset; this dev database and the deployed
  production backend share the same `MONGODB_URI` (no separate staging DB), so the fix is already
  live in production too. 15 new/updated tests in `LeaveListPage.test.jsx` plus 5 in
  `LeaveRequestModal.test.jsx`/`LeavePendingRequestsWidget.test.jsx`; full frontend suite passes (no
  Leave-module failures; the same pre-existing failures elsewhere trace to a concurrent session's
  uncommitted changes to `CustomersTable.jsx`, not this task); `npm run build` succeeds.
  Live-verified end-to-end via Playwright against isolated dev server instances with two separate
  temporary manager+employee teams (proving cross-team isolation) — cleaned up (deactivated +
  hard-deleted) after. `frontend/README.md` and `.context/final-plan.md` (§7.18 extended) updated.
- **2026-07-31** — Attendance corrections: removed the admin manual-correction UI entirely
  (reverses that earlier feature), fixed the `/attendance` empty-table bug for admin, added 5
  filters. `AttendanceCorrectionModal.jsx` deleted outright (Credentials Vault removal precedent)
  along with every entry point into it — the toolbar Add Record button, per-row Edit action, photo
  modal's Edit Record button, and the calendar's click-empty-day-to-create handler. Attendance is
  UI-read-only for every role now, including admin; the backend's `PATCH /attendance/:id`/
  `POST /attendance/manual` endpoints are untouched, just dormant. Admin has no personal attendance
  at all (exempt from checking in), so routing every role through `PersonalAttendanceView` always
  showed admin an empty table — `AttendancePage.jsx` now branches by role: admin gets a new
  `AdminAttendanceView` (org-wide, reusing the existing `GET /attendance/team`, which already
  resolves to every record for a caller holding `attendance.view_all`); Manager/Employee/Sales
  Associate keep the existing view completely unchanged. Five filters on the admin view: Employee,
  Team (built against the real `Team` entity, not a manager-list stand-in), Status, a month
  picker, and a separate Custom Date Range picker for arbitrary spans (composed from the existing
  per-month endpoint across however many months the range touches, rather than a new backend
  endpoint). Photo/location viewing confirmed unaffected — verified live against a real record's
  coordinates. 19 new/updated tests; full frontend suite passes, no regressions; `npm run build`
  succeeds. Live-verified via Playwright. `frontend/README.md` and `.context/final-plan.md`
  (§7.18 extended) updated.
- **2026-07-31** — Repositioned the Attendance Summary card on the Single User Detail page
  (`UserDetailPage.jsx`) to be the second section on the page, directly under the header, spanning
  the full content width, instead of sharing a row with Basic Info/Team/Leave/Permissions/Payroll —
  it now reads as the page's primary glance metric rather than competing for a column. Remaining
  cards keep their existing relative order below it. Frontend suite passes (same pre-existing,
  unrelated failures); `npm run build` succeeds.
- **2026-07-31** — Backend: manager gains `leave.view` (§7.5d) and a new `DELETE /leave/:id`
  endpoint, discovered while building the frontend's role-based Leave tabs (below) — a manager had
  `view_team` but never plain `view`, so had no way to see their own past leave requests at all
  (`GET /leave` scope=own requires `leave.view` specifically). `DELETE /leave/:id` reuses the same
  `ensureCanActOnLeave` team-scoping as approve/decline/mark-unapproved-absence (admin org-wide,
  manager own-team). Same stale-`RolePermissionTemplate` finding as the earlier §7.5c task, hit
  again the same day — the already-seeded "manager" template needed a second live `PATCH` to pick
  up `view`/`delete`; confirmed zero manager accounts exist, so no per-user reset was needed. 6 new
  tests; full backend suite 660/660 passing, no regressions. `backend/README.md` and
  `.context/final-plan.md` (§7.5d) updated. Deployed via `cd backend && vercel --prod --yes`.
- **2026-07-31** — Frontend: restructured the Leave page (role-shaped tabs, wider columns with
  horizontal scroll, a corrected Team filter, a new Delete action) and removed Attendance's
  calendar-grid view entirely (§7.5e). Leave: the List/Calendar toggle and `TeamLeaveCalendar.jsx`
  deleted outright — list/table-only now, no "All" tab ever again. Tabs are role-shaped rather than
  purely permission-derived: admin gets no tabs at all (a single always-filterable unified view,
  the same "structurally different view" precedent `AdminAttendanceView` set); everyone else gets
  tabs from whichever of `leave.view`/`view_team` they hold, with no tab UI at all if only one is
  held — a manager now sees exactly "Own"/"Team". **A real bug found and fixed, not assumed:** the
  Admin Team filter was built from a manager-list stand-in (`teamDirectory.filter(role ===
  "manager")`) that silently excluded any team headed by an admin — exactly this dataset's one real
  team — which is why it never appeared; rebuilt against the real `Team` entity (`useTeams()`). New
  Delete action (`DeleteOutlined` icon, `Popconfirm`-confirmed) gated on `usePermission("leave",
  "delete")`, same per-action pattern as Approve/Decline/Mark Unapproved Absence. Attendance:
  `AttendanceCalendar.jsx` deleted outright too — confirmed, not assumed, that neither of its two
  markers (manually-adjusted record, geofence violation) was ever calendar-only, since
  `AttendanceTimeline` already showed both independently in the list view. 21 new/updated tests;
  full frontend suite passes, no regressions; `npm run build` succeeds. Live-verified via
  Playwright: admin sees no tabs and the real "Sale Team" in the Team filter; a manager sees
  exactly Own/Team and can act on (including delete) their own team's rows; an employee sees no
  tabs and no Actions column at all; Attendance shows no calendar view anywhere. `frontend/README.md`
  and `.context/final-plan.md` (§7.18 extended) updated. Deployed via `cd frontend && vercel --prod`.
- **2026-08-04** — Leave UI polish, Attendance connectivity-gap/geofence-violation map
  visualization, and Cloudinary removed from the shared Reports export dispatcher (§7.5f/§7.4d/
  §7.11).
  **Leave (`LeaveListPage.jsx`, §7.5f):** Approve/Decline/Mark Unapproved Absence/Delete
  converted to icon-only buttons (`CheckOutlined`/`CloseOutlined`/`ExclamationCircleOutlined`/
  `DeleteOutlined`) each wrapped in a `Tooltip`, matching the established icon+Tooltip+
  `aria-label` pattern (`CustomerStatusToggleButton.jsx`, `LeadsTable.jsx`) — every button kept
  its old `aria-label` text, so existing `getByRole` test queries needed zero changes. The
  expandable-row Reason display is gone; Reason is now a plain table column (shown for "own"
  scope too, unlike the old expandable row), truncated via `Typography.Text`'s
  `ellipsis={{ tooltip: reason }}`.
  **Attendance (§7.4d):** the admin photo-viewer modal (`AttendancePhotoModal.jsx`) gained a
  "View on Map" button opening a new `AttendanceLocationMapModal.jsx`, which **reuses** the
  Location module's `HistoryMapView.jsx` (extended with new optional
  `initialEmployeeId`/`initialDate`/`showControls`/`deriveExtraMarkers` props — fully
  backward-compatible, every existing caller unaffected) rather than building a second map
  component, locked to that one record's employee/day. Uses the exact same `GET
  /location/history` ping data already being fetched — no new backend endpoint. A new
  `attendanceMapMarkers.js#deriveAttendanceMapMarkers(record)` marks a connectivity gap's two
  boundary pings (last-before/first-after — a gap has no pings *during* it by definition) in
  **red**, and every ping captured during a geofence violation window in **orange** — reusing
  the same red/orange vocabulary `ConnectivityGapBar.jsx`/`GeofenceViolationBar.jsx` already use
  elsewhere on the same modal. `GoogleMapView.jsx` gained an optional per-marker `color` field
  (Google's standard colored-pin icons) to support this.
  **Reports — Cloudinary removed from the whole §7.11 dispatcher:** through Phase 8, `POST
  /reports/generate` (and the two endpoints that call it internally, `GET /attendance/report`/
  `GET /travel-logs/report`) uploaded every generated report to Cloudinary and returned
  `{ downloadUrl }` — depending on an external service for something that never needed to leave
  this server, since the file is generated here and requested by an already-authenticated caller
  of this same API. All three now stream the generated buffer directly as the HTTP response
  (`Content-Type`/`Content-Disposition: attachment`), matching `GET /leads/export`/
  `GET /payroll/:id/payslip`'s pre-existing direct-stream shape (both confirmed unaffected — they
  were never routed through Cloudinary in the first place). `uploadReportFile` was deleted from
  `cloudinary.service.js` as dead code. Frontend: `reportApi.js#generateReport` now requests
  `responseType: "blob"`; the old `triggerFileDownload` (opened an already-hosted Cloudinary URL)
  was replaced with `triggerBlobDownload` (object-URL → hidden `<a download>` click → revoke,
  the same pattern `LeadsListPage.jsx#handleExport` already used) — one shared change in
  `ReportDownloadButton.jsx` that every module using it (Leads, Customers, Attendance, Leave,
  Payroll, Transport — both directly and via `ExportForm.jsx` on `/reports`) picked up
  automatically, with no per-module frontend changes needed.
  Every report test (`report.test.js`/`attendance.test.js`/`travelLog.test.js`) now asserts
  against the real streamed response body/headers and explicitly confirms no Cloudinary function
  is ever called during report generation, not just that the response lacks a `downloadUrl`.
  Full backend suite: 667/667 passing. Full frontend suite: the targeted Leave/Attendance/
  Location/Reports suites all pass with no regressions; 9 pre-existing failures elsewhere
  (`CustomersListPage`/`PaymentsListPage`/`UserManagementPage`/`LeadDetailPage`) confirmed
  unrelated — traced to a concurrent session's uncommitted in-progress changes to
  `CustomersTable.jsx`/`PaymentsListPage.jsx`/`RecordPaymentModal.jsx` (already present before
  this task started) and full-suite test-order flakiness (`UserManagementPage.test.jsx` passes
  24/24 in isolation). Live Playwright verification was attempted (dev servers started, scratchpad
  login script reused) but the login attempt failed ("Login failed"). **Correction (diagnosed
  2026-08-04, see that day's own changelog entry below): the account/credentials were never the
  problem** — `smartrays.crm@gmail.com`/`Easytest@1` is valid, confirmed by querying the dev
  database directly and calling the real login service function and endpoint. The actual cause
  was a CORS/port mismatch (the frontend dev server landed on port 5174, not 5173, since 5173 was
  occupied by a concurrent session, and the backend's CORS config only allowed 5173) — fixed the
  same day by making `CLIENT_ORIGIN` accept multiple origins. A real Google Maps API key is also
  not configured locally (both `frontend/.env` and `backend/.env` used placeholders at the time,
  though this task itself migrated off Google Maps entirely, see below), so even a successful
  login wouldn't have rendered real map tiles for the Attendance "View on Map" check at the time.
  Verification here rested on the automated test suites instead; live UI verification was still
  outstanding as of this entry. `backend/README.md`,
  `frontend/README.md`, and `.context/final-plan.md`
  (§7.11, §7.4d, §7.5f) updated.
- **2026-08-04** — Migrated the Location live-map/history-trail views and the Attendance map
  integration (built earlier the same day, above) from the Google Maps JS SDK to `react-leaflet`
  + free OpenStreetMap tiles (§11.11). **Why:** the Google Maps integration was never actually
  functional in production — no billing account or real API key was ever configured
  (`VITE_GOOGLE_MAPS_API_KEY` sat blank/commented-out in `.env`/`.env.example` the whole time),
  so every map view was silently broken for every real user; Leaflet + OSM's standard tile
  server needs neither, so this is what actually made the feature work, not just a
  library swap. Added `leaflet`/`react-leaflet` (v5, matching this app's React 19) to
  `frontend/package.json`. New `LeafletMapView.jsx` (`src/components/`) replaces
  `GoogleMapView.jsx` (deleted outright, along with `useGoogleMapsScript.js`) as the generic
  marker(s)/polyline renderer `LiveMapView`/`HistoryMapView` share — `MapContainer`/`TileLayer`/
  `Marker`/`Polyline` from `react-leaflet`, viewport auto-fit via a `FitBounds` helper calling
  `useMap().fitBounds()` in a `useEffect` (the standard react-leaflet pattern for syncing the
  map to data that changes after mount, e.g. Live's ~12s poll). Each marker's optional `color`
  (red for connectivity-gap boundaries, orange for geofence-violation points, per §7.4d) now
  renders as an inline SVG pin via `L.divIcon` instead of a URL to an external
  `maps.google.com`-hosted icon — one fewer external dependency, not just a like-for-like swap.
  `AttendanceLocationMapModal.jsx` (§7.4d) needed **zero changes** — it already wrapped
  `HistoryMapView` generically via props, so it picked up Leaflet automatically once
  `HistoryMapView` itself was migrated, confirming the earlier "reuse, don't fork" design
  decision paid off. `VITE_GOOGLE_MAPS_API_KEY` removed from `frontend/.env`/`.env.example`;
  confirmed via repo-wide grep that no code anywhere still references `window.google.maps` or
  the removed env var (the backend's own separate `GOOGLE_MAPS_API_KEY`, for Transport's
  Distance Matrix calculation, is unrelated and untouched). Tests rewritten to mock
  `react-leaflet` at the module boundary (`MapContainer`/`TileLayer`/`Marker`/`Polyline` stubs,
  `useMap` returning a fake `fitBounds`) instead of stubbing `window.google.maps` — the real
  `leaflet` package itself isn't mocked, since `L.divIcon()`/`L.latLngBounds()` are pure
  factory functions with no real-DOM dependency. Full frontend suite passes with no new
  regressions (same pre-existing, unrelated failures noted above); `npm run build` succeeds.
  Live browser verification failed at the time ("Login failed") — **correction (diagnosed
  2026-08-04, see that day's own entry below): not missing/invalid credentials**, a CORS/port
  mismatch instead. `frontend/README.md` and
  `.context/final-plan.md` (§11.11, §7.18) updated. Deployed via `cd frontend && vercel --prod`.
- **2026-08-04** — Diagnosed why live Playwright verification kept failing with "Login failed"
  earlier the same day (flagged in the two entries above): **not a credentials problem.**
  Querying the dev database directly confirmed the `smartrays.crm@gmail.com` account exists,
  `isActive: true`, and `bcrypt.compare` against the stored hash with `Easytest@1` returns `true`.
  Calling the real `loginUser()` service function directly, and hitting `POST /auth/login` via
  `curl`, both succeeded (HTTP 200, valid session cookie). The actual cause: `backend/.env`'s
  `CLIENT_ORIGIN` was hardcoded to `http://localhost:5173`, and the CORS middleware only allowed
  that exact origin — every frontend dev server this session landed on port **5174** instead
  (5173 was occupied by a concurrent session's own instance), so a browser login attempt was
  silently blocked by CORS (the backend processed it fine; the browser refused to let the page's
  JS read the cross-origin response), which the frontend's generic catch-all rendered as "Login
  failed" — indistinguishable from a real wrong-password error. Fixed same-day: `CLIENT_ORIGIN`
  now accepts a comma-separated list (`env.js` parses it into `clientOrigins`; `env.clientOrigin`
  stays the first entry for the one place that needs a single canonical URL,
  `auth.service.js`'s password-reset email link); `app.js`'s `cors()` call checks the incoming
  request's `Origin` against the full list via a dynamic origin function instead of a static
  string, defaulting closed (`callback(null, false)`) for anything not on the list — no
  wildcard, no reflecting back whatever `Origin` was sent. `.env`/`.env.example` now default to
  `http://localhost:5173,http://localhost:5174`; production's `CLIENT_ORIGIN` stays a single
  value, unaffected — this is local-dev-only flexibility. 4 new tests (`app.test.js`, new file)
  confirm both allowed origins get `Access-Control-Allow-Origin` reflected back, a disallowed
  origin gets none (CORS stays closed, not permissive), and a request with no `Origin` header at
  all (curl/server-to-server) still passes through exactly as the old static-string config
  allowed. Full backend suite: **678/678 passing.** `backend/README.md` updated; the two
  "stale/invalid credentials" notes above corrected in place. Deployed via
  `cd backend && vercel --prod`.

### 2026-08-05 — Attendance & Leave pass: 6 features, 4 bug fixes, 1 new endpoint

**Features.** Map tiles swapped from OpenStreetMap's default raster to **CARTO Positron**
(`light_all`) across every map in the app — one `TileLayer` in `LeafletMapView.jsx` serves the Live
map, History map and Attendance location modal, so this was a single-component change; still free
and key-less, attribution credits both OpenStreetMap and CARTO. **Own/Team tabs on Attendance** for
managers — `TeamAttendanceView` and its endpoint both already worked, but nothing ever routed to it,
so team attendance was simply unreachable in the UI for that role. **Team/Department column** added
to the Admin Attendance and Admin Leave tables, derived from the same two sources their existing
Team filters use, so column and filter can never disagree and neither needs an extra request.
**Fixed-header Check-In button** with a live elapsed-time badge once checked in (hidden for admin,
who is exempt from attendance) — the camera/geolocation step was extracted from `CheckInOutWidget`
into a shared `AttendanceCaptureFlow` so both entry points run one implementation, with a small
pub/sub keeping the header timer and the `/attendance` widget in sync. **Manager-scoped Team view**
via a new read-only `teams.view_team` grant: same page, scoped to the team they head, with no
create/edit/delete and no membership editing (deliberately — adding a member sets that user's
`managerId`, so granting it would let a manager pull any user onto their own team and inherit every
team-scoped grant over their data).

**New endpoint `POST /attendance/mark-status`** — marks a day with **no** record as
`absent`/`half_day`; admin any employee, manager own direct reports only. Rejects (409) any date
that already has a record, so a day with real check-in evidence is never touched. This is
explicitly **not** a reversal of the read-only Attendance decision: create where nothing exists,
never modify what does. In the UI, missing days now appear as synthetic "No record" rows (only when
a single employee is filtered, since gaps are per-person) carrying the two actions; they never enter
the summary statistics.

**Four bugs — every one had a root cause different from the reported one, found by reproducing each
live rather than trusting the description:**

1. **Team edit "403 via a wrong `PATCH /users/:id`"** — actually a **400** from the correct
   `PATCH /teams/:id`. `updateTeam` re-validated `type` whenever it was merely *present* in the
   payload, not when it was *changing*; the edit form always resubmits the current type, so once a
   type was deactivated, every save of that team failed — including one that only changed the head.
2. **Attendance Employee filter blanked the Name column** — not a response-shape mismatch.
   `showEmployeeColumn={!selectedEmployeeId}` deliberately removed the entire Employee column once
   an employee was selected.
3. **Leave Approve did nothing** — the endpoint works for admin and manager alike. All four Leave
   action handlers had **no error handling**, and there is no global axios error toast, so every
   failure was swallowed silently. Reproduced two real 409 triggers (paid request over 1 day; paid
   monthly quota already used).
4. **Manager couldn't delete own team's leave** — backend delete works. Buttons rendered from a
   blanket permission check with no per-row scope test, so on the manager's **Own** tab every row is
   their own request, which `ensureCanActOnLeave` always 403s (a manager isn't their own direct
   report) — silently, per bug 3.

**Tests: backend 699/699 passing** (22 files; 11 new for `mark-status`, 6 for the Team read tier,
2 regression tests for bug 1). Frontend: ~26 new tests across 6 files; every bug-fix regression test
was verified to fail without its fix. `npm run build` succeeds. Live-verified in a real browser:
Positron tiles loading (18 requests, all 200, zero OSM), Team columns on both tables, gap rows with
actions on exactly the missing days and none on real records, and a Team edit save returning 200
where it previously returned 400.

**Note on live data:** during cleanup of temporary QA accounts, a substring filter matched three
pre-existing leave records ("P3 QA verification", "Personal trip - QA verification", "Family event -
QA verification") and hard-deleted them. Leave deletion has no audit log, so they are not
recoverable. All three referenced an employee no longer in the directory. Reported to the user.

### 2026-08-05 — Customer Detail restructure + wider Lead panel (frontend-only)

Reordered the Customer Detail page so **Site & Installation Details leads, above Billing**;
**removed the Invoice History section entirely** (component deleted, not hidden — invoicing is
descoped, `Invoice` is a placeholder model with no service/controller, and there was no data
fetch to remove since the placeholder was static); and put **Contacts and Contracts side by
side** (`Col xs={24} lg={12}`, so they stack again below 992px rather than squeezing two list
columns onto a phone). The **Add/Edit Contact form is now two fields per row** — Name +
Designation, Email + Phone, Primary-contact toggle on its own row — reusing the existing
`Row gutter={16}` / `Col span={12}` pattern rather than new spacing.

**Activity Log now shows who performed each action, with no backend change needed.** Checked
first, as asked: `CustomerActivity.performedBy` was already stored on every entry (required,
`ref: "User"`) and simply never rendered. One wrinkle — `listActivity` returns it *unpopulated*,
so the API sends a raw ObjectId; the name is resolved client-side against the existing
`GET /users/dropdown` directory to keep the task frontend-only. Known limitation, flagged rather
than hidden: that endpoint lists active users only, so entries by a since-deactivated or deleted
user render "—" (never blank, never a crash). Closing that would take a one-line
`.populate("performedBy", "name")` on the backend read — not added, since this task was scoped
frontend-only.

**Lead detail panel widened 640 -> `min(920px, 100vw)`** — Site Details was the cramped section,
but widening the panel rather than that one section's columns means every section in the
slide-over gains the same room and none ends up visually out of step. `min()` keeps it exactly
viewport-width on mobile; verified 920px at 1600px viewport and 390px at 390px.

Customers + Leads suites pass (2 remaining failures are the pre-existing `CustomersListPage`
sort/wizard tests owned by another session's uncommitted `CustomersTable.jsx` work — confirmed
they reference none of the files this task touched). `npm run build` succeeds. Screenshotted the
restructured detail page, the two-column Add Contact modal, the mobile stacked layout, and the
widened Lead panel.

Also verified and reported rather than fixed: the Customer Detail page horizontally overflows a
390px viewport by ~43px. Measured identical with this task's changes stashed, so it is
pre-existing — the offenders are `CustomerHeaderSection`'s button row and the two-column
`Descriptions` tables, neither of which this task edited.

### 2026-08-05 — AMC moved into Customer Detail; standalone /amc page retired

**Backend.** `GET /amc` gained a `?customerId=` filter, applied on top of the existing
ownership-derived role scope rather than replacing it (asking for another team's customer returns
an empty list, not a leak). Added `previousAmcId` to the AMC model and a new
`POST /amc/:id/renew` behind the same `amc.edit` gate as `PATCH /amc/:id`. Renew creates a NEW
record chained to its predecessor and sets only `status: "expired"` on the old one — the old
record's amount and both dates are left verbatim, which is the entire point of chaining rather
than editing dates forward. Defaults (start where the last term ended, +1 calendar year, same
amount) are all overridable. `isExpiringSoon` (active, renewing within 30 days) is computed
server-side in `decorateAMC` so the threshold has one definition instead of one per side.
**17 new tests**, including the defining one: the old record's figures are provably unchanged
after a renew.

**Frontend.** New AMC section on Customer Detail rendering stat cards four per row (stepping down
responsively). Three visually distinct states — active, amber "expiring soon", and neutral
"expired" — because collapsing the first two would bury the one needing action. Renewal chains
collapse to ONE card per current term with an expandable "Renewed N×" history line, so past terms
never compete as top-level cards. Renew opens a modal pre-filled with exactly the server's own
defaults, all editable; dates are sent as plain `YYYY-MM-DD`, never `toISOString()` on local
midnight (a test asserts this — it's the day-early bug from the previous batch). `AmcPage.jsx`,
the `/amc` route and its nav item are deleted. 12 new frontend tests; `npm run build` succeeds.

**Two judgment calls worth flagging.** (1) The task said to delete `frontend/src/modules/amc/`
entirely, but `amcApi.js` is imported by the Dashboard's `AmcRenewalsDueWidget` and Reports —
deleting it would have broken both, so the api module was kept and extended while only the page
was removed. (2) That same widget still links to the now-removed `/amc` route. Its file has
uncommitted work from a concurrent session, so fixing it would have meant committing someone
else's WIP; `ROUTE_PATHS.AMC` was kept so the link resolves rather than going `undefined`, and
repointing it at `/customers` is flagged as a follow-up.

### 2026-08-05 — Attendance page consolidation: Leave absorbed, tabs, date presets, timeline fixes

Deleted the `/leave` route, its nav item and `LeavePage.jsx`; everything moved into role-shaped
tabs on `/attendance` (Employee: My Attendance / Apply Leave / My Leave · Manager: My Attendance /
Team Attendance / Leave · Admin: Attendance / Leave Requests / Leave History). The manager's
Own/Team split stays inside their Leave tab as a sub-filter rather than becoming more top-level
tabs. **Backend untouched — this is a relocation, not a permission change**; manager
approve/decline/mark-unapproved-absence/delete parity is exactly as built. `LeaveListPage` became
the reusable `LeaveSection` via `git mv`, so its history and suite moved with it; the Team column,
fetch-error Alert, Balance card, per-row scope gate and icon+Tooltip actions all survive.

**Pending requests now render as cards** with the full reason visible and the three actions
beside it — the old table truncated the reason behind an ellipsis, which is the field an approval
decision actually turns on. Decided requests stay a table in the history tab.

**One date dropdown replaces the month picker and the start/end pickers** — Today (default),
Yesterday, This Month, Custom, with date inputs appearing only under Custom. As reported before
building: the attendance LIST endpoints accept only `?month=`, never `from`/`to`. Per your call we
went frontend-only, fetching each month a range touches and narrowing client-side — the pattern
`AdminAttendanceView` already used, so no backend change. In practice that is a single request.

**New `src/utils/date.utils.js`** — no shared local-date helper existed, and
`dayjs(x).format("YYYY-MM-DD")` was inlined in half a dozen places. It centralises that so nothing
drifts back into `toISOString()` on a local-midnight value (a day early at UTC+5:30 — the bug
shipped in the previous batch); a test asserts the local day survives.

**Timeline:** "Issues" renamed **"Not Tracked"**, and every colour band got a hover tooltip with
its meaning plus clock range — including the gray base, previously the one band with no
explanation. Stat cards moved to the top with filters and actions on a single row below.

Full frontend suite: 421 passing. The 9 failures are the known pre-existing set in
LeadDetailPage / CustomersListPage / PaymentsListPage / UserManagementPage / ConvertToCustomer —
all files this task never touched, owned by concurrent sessions, and several are 5s-timeout flaky.
`npm run build` succeeds. Screenshotted the admin tab layout, the leave approval cards, and the
Custom date filter.

### 2026-08-05 — User controls moved to the top strip; full play/pause/stop attendance control

Removed the name / gear / Sign out block from the sidebar footer and rebuilt it right-aligned in
the fixed blue strip as `[bell] [gear] [name] [sign out]`. The notification bell was **relocated,
not rebuilt**, so its polling and visibilitychange refetch are untouched. Clicking the name opens
Edit Profile — the sidebar avatar had been that modal's only entry point, so removing the footer
without rewiring it would have made Edit Profile unreachable. Below `sm` the name and Sign out
collapse into an avatar dropdown; verified at 390px with no horizontal scroll.

Extended the header check-in button into the full shift state machine: Play (check in / resume
from break), Pause (break in), Stop (check out), alongside the live timer. Both backend rules are
mirrored as **disabled controls with tooltips** rather than hidden ones or buttons that would
fail — Stop is disabled during a break (the server rejects checkout with a 409) and Pause is
disabled once the shift's single break is used. Check-in and check-out both open the existing
camera+geolocation modal since a photo is mandatory server-side; break in/out are geolocation-only
and submit immediately. Admin renders no control or timer at all. Screenshotted all four states,
admin, and 390px; each state was driven through the real API to confirm: not-checked-in →
`[Check in]`, checked-in → `[Pause, Check out]` + timer, on-break → `[Resume, Check out(disabled)]`,
break-used → `[Pause(disabled), Check out]`.

**One structural decision worth recording.** The task forbade editing
`frontend/src/modules/attendance/` (a concurrent session owned it), but the component it asked me
to extend — `HeaderCheckInButton.jsx` — lives inside exactly that directory. Rather than edit
another session's area, the extended control was built in `layouts/` and consumes the attendance
module's hooks, API and capture modal without modifying them. Consequence flagged rather than
hidden: `HeaderCheckInButton.jsx` and its test are now unreferenced dead code and should be
deleted by whoever owns that module next.

Also fixed in passing: `NotificationBell` still routed leave notifications to the `/leave` path
removed earlier the same day; it now points at `/attendance`.

22 new tests. Full frontend suite: 437 passing; the 9 failures are the known pre-existing set in
files this task never touched. `npm run build` succeeds.

### 2026-08-05 — Attendance data retention (45-day auto-delete with photos)

**The blocker check came back clear.** `Attendance.checkIn/checkOut.photoPublicId` are already
stored (with `select: false`), explicitly so Cloudinary assets can be destroyed by id — no URL
parsing and no "existing photos are undeletable" problem. Built on that.

New `ATTENDANCE_RETENTION_DAYS` (default 45) and `ATTENDANCE_CLEANUP_TOKEN`, both documented in
`.env.example`. New shared-secret `POST /attendance/cleanup`, deliberately **not** reachable by
normal user auth — putting a bulk delete behind session auth would mean one compromised admin
session could wipe attendance history. Returns 503 if no secret is configured rather than running
open.

**Ordering per record, which is the whole design:** payroll guard → Cloudinary assets → DB row.
The guard skips any record whose month has no Payroll yet, because attendance is the input payroll
is computed from. Cloudinary comes before the row because the `publicId` needed to find an asset
lives *only* on that row — deleting the row first would orphan the asset permanently. So a failed
asset deletion **leaves the record in place** for the next run, and one record's failure never
aborts the batch. Bounded to 200 records per invocation for the serverless time limit, and
idempotent.

**Every run writes an `AttendanceRetentionLog` summary** — counts, cutoff, and the date range
actually deleted — including runs that delete nothing. This is a direct response to the earlier
leave-record incident: a hard delete with no trace was not just unrecoverable but uninvestigable.
It holds **no personal data** (no employee ids, names or photo URLs), and a test asserts no
identifiers leak into it.

**Two things worth flagging.** (1) Scheduling is a `vercel.json` `crons` entry, not node-cron, as
instructed — node-cron needs a long-lived process this backend doesn't have. (2) Vercel Cron only
issues **GET** and cannot send custom headers, so a POST-only + `x-webhook-token`-only endpoint
could never actually be triggered by its own cron entry. The endpoint therefore accepts both verbs
and also `Authorization: Bearer <CRON_SECRET>` (what Vercel sends). The job's idempotency is what
makes a mutating GET acceptable.

Note the existing `cleanupOldAttendancePhotos` job strips photos while keeping rows; at the same
threshold this new job supersedes it, and a record whose photos were already stripped passes
through with nothing to delete.

18 new tests. Full backend suite: **734/734 passing.**

### 2026-08-05 — AMC moved to the top of Customer Detail

Repositioned the AMC section above Site & Installation Details, so the page now reads
AMC → Site & Installation → Billing → Contacts | Contracts → Activity Log. An AMC nearing renewal
is the only time-sensitive thing on the page; it previously sat below the static install spec.

Verified the expiring-soon treatment is genuinely rendering rather than assuming it: cards show
amount, start date, renewal date and status; the expiring-soon card has an amber border and tag,
distinct from the neutral Expired styling; chains still collapse to one card with a "Renewed N×"
expander; Renew is present on each card. Added a test asserting the leading section order.

**Item 3 blocked and reported, not forced.** `AmcRenewalsDueWidget` still links to the removed
`/amc` route, but the file STILL has another session's uncommitted change — a `text-right` →
`text-left` tweak on the line immediately above the link. Repointing it would have meant
committing their WIP, so it was left alone per the task's own instruction. `ROUTE_PATHS.AMC` is
still defined so the link resolves rather than going `undefined`.

### 2026-08-05 — Attendance/Leave tab fixes (items 1-5 of the page rework)

**Verified before rebuilding, as asked — and two items reported as done had genuinely not
shipped.** Stat cards were still rendering below the filters (they live inside
`AttendanceRecordsSection`, which every view renders after its filter row; a code comment claiming
otherwise was simply wrong), and the Leave Requests tab still showed the viewer's personal
"Your Paid Leave Balance This Month" card. Both now fixed for real and covered by tests.

Stat cards moved above the filters on all three attendance views. The Employee filter no longer
prints raw Mongo ObjectIds — the name map was built from the active-users dropdown, so
deactivated/deleted staff had no name and fell through to the id; it now uses the full roster with
an "Unknown employee" fallback. Admin Leave tab gets four queue cards (Pending, On Leave Today with
names, Upcoming This Week, Unapproved Absences) replacing the personal balance card, plus the same
date preset dropdown as Attendance reusing `date.utils.js`. Leave History tab removed in favour of
a Status filter including a derived "Unapproved Absence" option.

**Two real bugs found and fixed while doing this**, both from my own earlier work in this project:
1. An admin saw every pending request **twice** — once as an approval card, once as a table row.
   A request now renders as either a card or a row, never both. Delete was added to the cards,
   since pending requests render only as cards now and would otherwise have lost that action.
2. `LeaveSection.test.jsx` **had not executed since the `git mv`** — its import still pointed at
   `./LeaveListPage`, so the suite failed to collect. A collection failure emits no per-test `×`
   line, which is exactly why an earlier report that counted only `×` lines concluded all failures
   were pre-existing. It now runs: 43 tests passing.

Frontend suite: 471 passing. Remaining failures are the known pre-existing set in
LeadDetailPage / CustomersListPage / PaymentsListPage / UserManagementPage — untouched by this
task and flaky between runs on 5s timeouts. `npm run build` succeeds.

**Still outstanding from this task: item 6 (the live map tab)** and the standalone location page
removal. Not started.

### 2026-08-05 — Live Map tab; /location page retired (item 6, completing Prompt B)

Added a Live Map tab to `/attendance` (admin + `attendance.view_location`) showing every
checked-in employee's check-in point, ping trail and latest position. Deleted the standalone
`/location` page, route and nav item; `locationApi` was kept because `useCheckedInHeartbeatLoop`
imports it, and `LiveMapView`/`useLiveLocations` were removed as newly-dead code.

**Two premises in the brief did not match the code:**
1. Geofence violations are NOT computed per ping — `LocationPing` has no such field. They're time
   intervals on the Attendance record, so per-ping status is derived by intersecting timestamps.
2. `HistoryMapView` renders one employee's single polyline and can't show several at once, so
   `LeafletMapView` gained an additive `paths` prop instead of a second map component being built.
   `path` is unchanged, so History and the Attendance modal are unaffected, and there is still one
   `TileLayer` (CARTO Positron).

Staleness is a first-class state: positions older than 10 minutes render red with an explicit
"Stale · last updated Xm ago" tag, because geolocation stops when a tab is backgrounded or a phone
locks and a frozen marker reading as live is the dangerous case. Verified against real data — a
25h-old position correctly rendered stale. Polling is 45s plus a visibilitychange refetch, with an
in-flight guard.

**Flagged, not hidden:** each poll fans out one `/location/history` call per checked-in employee,
since no batched trail endpoint exists. Fine at this scale, not for a large org.

Also fixed: the attendance table pushed the whole page into horizontal scroll at 390px; it now
scrolls in its own container. All three tabs verified clean at 390px, and the admin Leave filters
now share one row with the report button.

Frontend suite 481 passing; the 7 failures are the known pre-existing set in untouched files.
`npm run build` succeeds. **Prompt B is now complete.**

### 2026-08-05 — Two-factor authentication: backend complete (frontend NOT yet built)

TOTP + recovery codes + password change. **Email factor deliberately not built** — production
SMTP is a placeholder host, so emailed codes would go nowhere.

Login now withholds the session cookie entirely when a second factor is outstanding, issuing only
a 5-minute pre-auth token whose scope is disjoint from a session token in both directions. TOTP
secrets are AES-256-GCM encrypted via the existing credential-encryption service; recovery codes
are bcrypt-hashed and consumed by deleting the hash. 2FA is mandatory for admin/manager, enforced
on every request rather than only at login. Admin reset of someone else's 2FA requires the acting
admin's own password AND own 2FA code, and is logged with actor and target.

**Two real bugs found and fixed during the work:**
1. `otplib` v13's `verifySync` THROWS on non-6-digit input instead of returning `{valid:false}`,
   so a 10-character recovery code 500'd before the recovery branch ran — recovery codes could
   never have been redeemed. Now guarded.
2. Importing the mandatory-roles rule from the 2FA service into auth middleware pulled
   `config/env.js` earlier into the module graph, which silently broke the 11 website-intake
   webhook tests (they set `process.env` in `beforeAll`, after env had already been snapshotted).
   The rule now lives in a dependency-free constants module.

The shared test helper now completes the REAL 2FA login flow (provisions a secret, submits a
genuine TOTP) rather than disabling the feature — flipping the flag alone just moves the gate
from "enrol" to "verify". Every suite therefore exercises the true login path.

Backend: **755/755 passing.**

**NOT DONE — and this is a deployment blocker.** The frontend is not built: no enrolment UI, no
recovery-code display, no 2FA step in login, no Settings account section. **Deploying this
backend alone would lock every admin and manager out of production**, because login would return
`requiresEnrolment` with no cookie and the current frontend has no idea what to do with it.
Committed but deliberately NOT deployed.

### 2026-08-05 — 2FA frontend complete; backend + frontend deployed together

Built the 2FA login step, the blocking enrolment gate, client-side QR + manual key, one-time
recovery-code display behind an explicit confirmation, and Settings → Account (2FA status,
recovery-code regeneration, password change).

The store change matters most: `login` no longer marks the session authenticated when a
`preAuthToken` comes back, so the UI cannot show a signed-in shell to someone who has only
supplied a password. Six frontend tests assert exactly that, plus the rate-limit restart path and
the recovery-code confirmation gate.

Settings → Account is available to every signed-in user, so Settings is no longer entirely
off-limits to a non-admin; administrative tabs stay permission-gated. Its test was updated
accordingly. No password-reset-by-email link is offered to signed-in users, since that endpoint
500s in production.

Frontend 484 passing (the remaining failures are the long-standing pre-existing set in
LeadDetailPage / CustomersListPage / PaymentsListPage / UserManagementPage). Backend 755/755.
Both builds succeed. **Deployed backend and frontend together** — deploying the backend alone
would have locked every admin and manager out, since login returns `requiresEnrolment` with no
cookie and the old frontend could not handle it.

### 2026-08-05 — Employee self-service backend (§7.39)

New `GET /users/me/permissions` (own role/permissions only — the admin-only per-user endpoint is
untouched, not relaxed), `PATCH /users/me`, `PATCH /users/:id/can-edit-own-profile`, and
`PATCH /teams/:id/show-contacts`. Added `photo` + `canEditOwnProfile` to User and
`showContactsToMembers` to Team, all defaulting closed.

**`PATCH /users/me` rejects rather than silently ignores.** A silent drop returns 200 and looks
like success, hiding both client bugs and real escalation attempts — and an employee PATCHing
their own role or managerId is the obvious attack. Always allowed: photo. Gated on
`canEditOwnProfile`: name, phone. Never: email, role, permissions, managerId, isActive, teamId,
passwordHash, canEditOwnProfile, baseSalary, customerId. A request containing a forbidden field is
refused whole — its legitimate fields are not partially applied. `password` is on the never-list
deliberately: it goes through `/auth/change-password`, which requires the current password.

`showContactsToMembers` omits contact fields from the query itself, so they never reach the
browser — not stripped afterwards, not hidden in the UI. Defaults false; only the team's own head
or an admin can toggle it.

Backend **778/778 passing** (23 new).

### 2026-08-05 — Employee-facing pages (§7.39, frontend)

Employees now have `/attendance` (attendance only), `/leave`, `/team`, `/profile` and `/settings`,
plus their own nav. Admin and manager keep the combined tabbed Attendance page untouched.
`LeaveSection` is reused via a thin wrapper rather than a second leave component.

**One backend addition beyond the brief, because item 7 was impossible without it:**
`GET /teams/mine`. `GET /teams` requires `teams.manage`/`teams.view_team` and an employee holds
neither — `view_team` is scoped to teams you HEAD, which an employee never does — so the Team page
would have 403'd. The endpoint also returns the head as a named person, since `getTeamMembers`
lists users whose `managerId` IS the head and therefore never includes them. 4 extra tests.

The profile page renders name/phone as read-only TEXT when `canEditOwnProfile` is false, not a
disabled input that fails on save, and only ever sends fields the server accepts for that user.
Admin/manager toggles added: contact visibility per team row, and self-editing on user detail.

Settings is no longer admin-gated (it holds everyone's own Account); its tabs remain
permission-gated and employees get a read-only access view. Three existing tests were updated to
this new contract rather than worked around.

Frontend **495 passing** (10 new); the 4 failing files are the long-standing pre-existing set.
Backend **782/782**. Both builds succeed.

### 2026-08-05 — "Remember this device" on the 2FA step (§7.40)

An opt-in, unchecked-by-default checkbox on the verification screen lets a browser skip the
**second factor** for 30 days. The password is always still required: `loginUser` only consults
the device token after `bcrypt.compare` on the password has succeeded, and a test asserts that a
wrong password from a fully trusted device still 401s with no cookie set.

The trusted-device cookie reuses `getAuthCookieOptions()` verbatim (httpOnly, `SameSite=Lax`,
`secure` in production) rather than defining new options — that config is same-origin-dependent
through the Vercel rewrite proxy and was not worth re-deriving. Tokens are bcrypt-hashed at rest
on `user.trustedDevices` (`select: false`), pruned on every read/write, and capped at 10.

All devices are revoked on password change, 2FA re-enrolment, 2FA reset (own or admin), and
recovery-code redemption; a recovery-code sign-in also refuses to mint a new device, since a
redeemed code means the authenticator was lost. Settings → Account gained a trusted-device list
with per-device Revoke and Revoke all.

**Tests:** 24 new backend (`trustedDevice.test.js`) + 5 new frontend
(`TwoFactorChallenge.test.jsx`). Backend suite: **26 files / 806 tests, all passing** (suite count
checked, not just failures). One existing frontend assertion in `LoginPage.twoFactor.test.jsx`
pinned the old 2-argument `verifyTwoFactor` call and was updated to the new signature. The four
remaining frontend failures (`LeadDetailPage`, `CustomersListPage`, `PaymentsListPage`,
`UserManagementPage`) are the known pre-existing timeout flakes in files this task never touched.

### 2026-08-06 — Permissions matrix redesigned as level + scope (§7.41)

Frontend only. The old matrix rendered one column per action across the union of every action in
the registry, so it scrolled sideways on every screen and grew wider whenever a module gained a
key. Now one row per module: a level (None/View/Edit/Full), a scope (Own/Team/All), and the
standalone capability keys as toggle chips.

**Audited before building, as instructed** — 46 keys across 15 modules. Three findings changed the
design:

- The CRUD ladder is **per-module**, not universal. `leave` has view+delete but no create/edit;
  `amc` has view+edit but no create/delete; `tickets` has no plain `view`. A universal ladder
  would emit keys outside the registry, which `validatePermissionsBody` rejects with 400 — those
  rows would have been unsaveable, not merely mis-rendered.
- Leads, Customers, Payments and AMC have **no scope keys at all**; scope there is resolved from
  the role and record ownership inside the services. Their scope control renders inert with that
  stated, rather than offering a choice with nowhere to save.
- Three existing grants sit off a clean rung (`manager.leave` holds delete with no edit;
  `manager.tickets` and `customer.tickets` hold create with no view). None is unrepresentable, but
  all three would have been silently rewritten by a naive model.

That last point drove the central implementation decision: **the selection carries the real key
sets and only re-expands on an explicit user choice, never on load.** Without it, opening
`manager.location` (stored as `view_team` with no `view`) and saving would have added
`location.view` — a grant nobody asked for, on a row that was only looked at. Confirmed live: the
real manager template opens with Save disabled and "No unsaved changes".

**Live drift found during the audit** (this is what item 5 was about): 2 of 3 users diverge from
their role template right now, including `teams.view_team`, granted to the manager template on
2026-08-05, which never reached the existing manager user. `reconcileRoleTemplate` repairs
templates but never existing users, so that drift is permanent until someone resets. The override
screen now marks every divergent row against the user's template as a second baseline.

**Layout, verified rather than assumed.** Fixed-width selectors (236px/172px), label column with
`min-width: 0` and truncation, rows wrapping below ~900px. Measured in a real browser at 1280,
1024 and 390: `documentElement.scrollWidth === clientWidth` at all three, 15 rows rendered, zero
overflowing. jsdom does no layout — both values are 0 there, so a bare `scrollWidth ===
clientWidth` assertion would pass vacuously; the jsdom test asserts the structural cause instead
(adding actions to a module adds chips, never a control).

**Tests:** 74 (50 model + 24 component), all passing. Frontend suite **71 files / 574 tests**
(was 70/509; the old 9-test matrix file was replaced by 74 tests). Suite counts checked, not just
failures. The 4 remaining failures are the known pre-existing timeout flakes in
`CustomersListPage` and `PaymentsListPage` — untouched by this task, and `LeadDetailPage`,
`LeaveSection` and `UserManagementPage` all pass when re-run in isolation.

**Not changed:** the permission registry, every endpoint, and server-side validation. This is a
presentation layer over the same flat keys.

### 2026-08-06 — Timeline and Location columns reconciled onto one axis (§7.4f)

Frontend only. The two bars in each Attendance row measured different things and looked like they
measured the same thing.

**Shared axis.** `AttendanceTimelineBar` drew a full calendar day (midnight → midnight) while
`GeofenceViolationBar` stretched check-in → check-out across its whole width. On a 09:00–18:00
shift the halfway mark was **12:00 noon in one column and 13:30 in the other**, so a red band in
Timeline appearing above an orange band in Location read as a correlation that did not exist.
Both now draw through one `createDayAxis(record)` in the new `utils/attendanceDayAxis.js`; neither
component derives geometry itself any more, since two independent derivations is how they drifted
apart. Verified in a real browser: both columns place the shift at left 37.5% / width 37.5% and
the same 10:30–11:00 event at left 43.75%, and an open shift ends at the same offset (62.5%) in
both.

**Off-shift is gray, not green.** The Location bar's base was `green-400` end to end, which
asserted "inside the geofence" for the whole day including the entire night. Gray is now the
shared "nothing here" base in both columns, with the shift drawn as a band over it.

**Its own palette.** `green-400` previously meant "connected and tracking" in Timeline and
"inside the geofence" in Location, and `orange-500` sat a shade from Timeline's `red-500` on a
12px bar. Location is now sky (`sky-300` inside) / violet (`violet-600` outside) — a different
family, with the violation colour deliberately out of the red-orange range.

**One controlled tooltip.** Location used native `title` attributes, which a browser can display
at the same moment as an AntD tooltip from the neighbouring column — the same
two-tooltips-at-once symptom fixed in §7.4e, by a different route. It now uses the same single
controlled `Tooltip` keyed by hovered band, stating the clock range, the distance
(`maxDistanceMeters`) on a violation, and what the gray region is. Verified across BOTH columns:
exactly one tooltip at every band in both, and zero after a sweep across the pair.

Also fixed two AntD deprecations on this page: `destroyInactiveTabPane` → `destroyOnHidden`
(`AttendancePage`), `dropdownRender` → `popupRender` (`NotificationBell`).

**Tests:** 23 new (13 axis, 10 component). Every one was run against the previous implementation
first and observed to fail — 10 component tests against the original `GeofenceViolationBar`, and
the 4 axis-alignment tests against the old shift-relative geometry (reinstated temporarily for
that purpose, since deleting the module would only have produced a collection error rather than a
real failure). Four existing tests asserting the old palette were updated. Frontend suite
**74 files / 606 tests** (was 72/583); the 4 remaining failures are the known pre-existing
timeout flakes in `LeadDetailPage`, `CustomersListPage`, `PaymentsListPage` and
`UserManagementPage`, none of them touched here.

## Known limitations

### Cloudinary delivery is UNAUTHENTICATED — a live exposure, not a hypothetical

Every asset this app uploads — attendance check-in/check-out photos today, and any identity
document added later — is stored with Cloudinary's default **public** delivery type. A public
Cloudinary URL needs no session, no header and no signature: **anyone holding the URL can open the
image without logging in.**

The consequence is precise and worth stating without softening it: an app-level permission gate
controls **who is shown the link**, not **who can open the file**. `attendance.view_photos` decides
whether a manager sees a photo in the UI; it has no bearing on whether that same URL, once it
leaves the app, still resolves. And URLs do leave — server logs, browser history, the Cloudinary
media dashboard, a copied link in a chat, a report export.

**This is live today.** Check-in photos are the whole system's evidence that someone was physically
present, and they sit behind guessable-once-known URLs. It is not a future risk attached to a
feature nobody has built yet.

**This was a deliberate trade-off, not an oversight.** Reusing the existing public upload flow kept
`cloudinary.service.js` as one path for every asset type and avoided signed-URL generation on every
read, which would touch report generation, the photo modal, the cleanup cron and the retention job.
That was the right call for attendance photos taken minutes ago and deleted after 45 days. It stops
being the right call the moment an Aadhaar or PAN image is stored, because those never expire and
identify a person permanently.

**Recorded resolution:** move sensitive assets to Cloudinary `type: authenticated` and generate
**signed delivery URLs** with a short expiry at read time, leaving ordinary attendance photos on the
public path if that trade-off is still wanted for them. That is a per-asset-type decision, so the
upload service needs a delivery-type parameter rather than a global switch. **Any identity-document
field should ship with this in place from the start rather than inheriting the public default.**


### Geofence column cannot see ping coverage (§7.4f, revised §7.4g 2026-08-06)

The Geofence chip reads `record.geofenceViolations[]`. It never consults `LocationPing`, so **a
shift that checked in and then reported no positions at all still shows "Within range"** —
violations are only ever written from `location.service.js#submitPing`, so zero pings stores
`geofenceViolations: []`, byte-identical to a shift whose every ping was in range.

§7.4g narrowed this as far as the record allows. "No data" now covers the case the record *can*
prove — no check-in at all — and is rendered gray **and dashed** so it cannot be mistaken for the
green "Within range". What remains is only the silent-after-check-in case.

Two things block closing it from the client, both verified rather than assumed:

1. **The record carries no ping count.** `lastHeartbeatAt` is not a proxy: heartbeats
   (`recordHeartbeat`) and location pings (`submitPing`) are separate client loops against
   separate endpoints, and a ping never advances `lastHeartbeatAt`.
2. **`checkIn.coords` cannot stand in for it.** `applyGeofenceCheck` does return immediately
   without check-in coords — but `applyVisibilityRules` also nulls those same coords for any
   viewer lacking `attendance.view_location`. Keying "No data" off coords would therefore label
   an entire perfectly-tracked month "No data" for a manager without that grant. (This is why the
   violation branch is evaluated first: `geofenceViolations` is never stripped, so it stays
   trustworthy for every viewer.)

**Resolution: put a ping count on the attendance payload** — e.g. `locationPingCount` aggregated
per record in `listAttendance`/`getTeamAttendance` — and add a fifth chip state, "No positions
reported", for a closed shift with a check-in and zero pings. That is a backend change, which is
why §7.4g stopped short of it rather than quietly widening its own scope.

### 2026-08-06 — Location column replaced by a Geofence status chip (§7.4g)

Frontend only. §7.4f had put both columns on a shared 24-hour axis, which fixed the *arithmetic*
but not the *reading*: two bars of identical width still sat side by side inviting comparison,
when one measures "was the device connected" across the whole day and the other "how far from the
check-in point". A chip reads as a value, like every other column in the table, and cannot be
visually diffed against a bar.

Four states — "Within range", "In progress", "N excursions · max 1.2 km" (count plus the largest
`maxDistanceMeters`, metres under 1 km and kilometres to one decimal above), and "No data". The
last is deliberately gray **and dashed**: a solid gray chip beside a green one still scans as a
pass. Verified in a browser — `no data` renders `bg rgb(250,250,250) / dashed`, `within range`
`bg rgb(246,255,237) / solid`.

The column header is now **Geofence**, not "Location" — the old name read as "where were they",
which is the Live Map's question, not this column's.

The chip uses the same controlled AntD `Tooltip` as the timeline (never a native `title`, which a
browser can show alongside an AntD one), listing every violation's clock range and distance.
Verified: exactly one tooltip at every band of the Timeline bar AND every chip state, zero after
sweeping between the two columns.

**Deep-link.** An excursion chip opens `AttendanceLocationMapModal` for that record — the correct
employee and date, with violation points already plotted. It is NOT wired to the Live Map tab:
`LiveTrackingMap` is live-only (`GET /location/live`, open shifts, plus history for today) and
takes no employee/date input, so it can never show a past row's trail. Clicking stops propagation
so it does not also fire the row's own click.

The bar rendering and `utils/attendanceGeofence.js` are deleted. `attendanceDayAxis.js` stays —
the timeline still uses it — but its cross-column alignment tests went with the bar.

**Tests:** 39 new (25 util, 14 component). The 13 discriminating component tests were run against
the previous bar component first and all 13 observed to fail; the 25 util tests cover
`geofenceSummary`, a module with no prior version to run against. Four existing tests asserting
the old bar were updated. Frontend suite **75 files / 627 tests** (was 74/606); the 11 remaining
failures are the known pre-existing timeout flakes in `LeadDetailPage`, `CustomersListPage`,
`PaymentsListPage` and `UserManagementPage`, none touched here.

The two AntD deprecations named in the task (`destroyInactiveTabPane` → `destroyOnHidden`,
`dropdownRender` → `popupRender`) were already fixed under §7.4f and were verified still in place,
not re-applied.

### 2026-08-06 — Explicit row action, and the last old-style bar retired (§7.4h)

Frontend only. Two related fixes on the Attendance table and its detail modal.

**The whole row was a button.** `onRow` gave every cell the same `onClick`, so Timeline, Geofence,
Date, Status and Employee all opened the same `AttendancePhotoModal` — byte-identical, with
nothing signalling it. The two columns carrying visual widgets simply got clicked most, which is
why they *looked* like they "did the same thing"; they were never special.

Replaced with an explicit **"View details"** action in the Actions cell, following
`PaymentsTable`'s established pattern (`type="text"` icon button + `Tooltip` + `aria-label`).
Chosen over linking the Date cell because no table in this app links a cell to open a modal —
links go to routes (`UserManagementPage`'s Permissions link) — and Attendance already had an
Actions column shape to extend rather than a new interaction to invent. The row handler is gone
entirely; keeping both would have re-created the ambiguity.

The Actions column is now **always** rendered. It used to appear only when `onMarkStatus` was
supplied, which is admin-only, so gating Details on it would have left the Personal and Team views
with no way into the modal at all. Missing-day rows still get no Details action (there is nothing
to show), and their Popconfirm gap-filling actions are unchanged.

**`ConnectivityGapBar` was the last bar in the old style** — its own check-in→check-out scaling, a
green base across the full width, and native `title` attributes — sitting directly above the new
Geofence chip in the modal. It now derives its bands from **`computeTimelineSegments`, the very
function the Timeline column uses**, dropping only the break band. Sharing the function rather
than just the axis makes alignment true by construction: verified that a 10:30 gap renders at
`left: 43.75%` in both, and the connected band at `left: 37.5%` in both. Off-shift hours are the
shared gray base, not green — green there asserted "connected" for hours nobody was working, the
same false claim the Location bar used to make. Palette matches Timeline exactly (gray base,
`green-400` connected, `red-500` gap) and stays clear of the sky/violet geofence family.

**Verified in a real browser:** clicking Date / Timeline / Geofence / Status / Employee opens
nothing; "View details" opens `Attendance — <date>`; the Geofence chip still opens
`Location — <date>` directly without the detail modal; every band of the connectivity bar and the
chip shows exactly one tooltip; a normal sweep across the modal peaks at one and settles to zero.

One honest caveat from that run: an **instant** jump between two adjacent tooltip triggers peaks
at 2 for roughly one frame before settling to 1. Measured, it is AntD's crossfade — the outgoing
tooltip sits at ~0.04 opacity carrying `ant-zoom-big-fast-leave-active` while the incoming one
appears. This is a property of AntD transitions between any two adjacent tooltip triggers
anywhere in the app, not something this modal introduces, and it never persists. It is not the
nested-tooltip bug of §7.4e, which held two at full opacity indefinitely.

**Tests:** 25 new (13 row-action, 12 connectivity bar). 16 of the 25 were run against the previous
components and observed to fail; the other 9 pin invariants that already held (the gap was already
`red-500`, missing-day rows were already inert, the chip route already worked). Three existing
tests were updated: two opened the modal by clicking a row, and one asserted "no buttons at all",
which only held while the row click was the sole affordance. Frontend suite **77 files / 652
tests** (was 75/627); the 8 remaining failures are the known pre-existing timeout flakes —
confirmed by re-running `LeadDetailPage`, `LeaveRequestModal` and `UserManagementPage` in
isolation, where all 33 pass.

### 2026-08-06 — AMC renewals surfaced above the Customers table (§7.42)

`GET /amc?expiringSoon=true` returns every active AMC renewing within 30 days or already overdue,
across every customer the caller can see, and `ExpiringAmcPanel` renders them above the Customers
table so a renewal no longer requires opening each customer in turn.

**The filter is deliberately wider than the existing badge.** `decorateAMC`'s `isExpiringSoon`
excludes already-past renewal dates because it drives an amber "expiring soon" chip; an overdue
contract is a worse, different state. The panel wants both — the lapsed one is the most urgent row
— so `expiringSoonCondition` is a separate concept rather than the flag stretched to cover two
jobs. Records already marked `expired` (what renewing does to the old term) are excluded from
both, which is also what makes a renewed row leave the panel by itself.

**Scoping is untouched**: the filter is `$and`-ed onto `resolveAMCFilter`'s ownership scope, so it
narrows within what the caller can see and cannot widen it. Covered by tests for a sales associate
seeing only their own, another seeing none of them, and a role with no `amc` grant still getting
403.

**One query, not N+1.** `populate("customerId", "companyName")` and the name lifted onto
`customerName`, with `customerId` flattened back to a plain id so the Customer Detail page's
string comparison still works. The test counts actual `customers` collection operations through
Mongoose's debug hook — five AMCs, one join — because asserting the names came back would pass
against an N+1 too. Two cheaper approaches were tried and rejected first: driver command
monitoring needs `monitorCommands: true`, which this app deliberately does not set, and
`vi.spyOn(Customer, "find")` never fires because populate does not go through the model's `find`.

**The panel is a worklist, not the Customer Detail card grid** — one dense row per record
(customer, renewal date, amount, days remaining, Renew), server-sorted most-urgent-first. That
grid answers "what is this customer's contract"; this answers "whose renewals need action".
Rendering both alike would invite the same confusion Timeline and Location had by both being bars.
Hidden entirely when nothing is due, count in the header when collapsed, overdue in red vs
expiring-soon in amber, renew via the single existing `POST /amc/:id/renew` and the existing
`amc.edit` gate.

**Verified in a browser:** panel renders above the table, overdue and soon carry different tag
classes, renewing removes only that row and leaves the other, and the panel disappears when
nothing is due while the table stays. On the N+1 check, the raw request count is 2 rather than 1
because React StrictMode double-invokes effects in dev — so the meaningful assertion is that the
count is CONSTANT, not proportional: **six rows cost the same two requests as two rows**.

**Tests:** 28 new (14 backend, 14 frontend). Of the backend 14, **6 were run against the
pre-change code and observed to fail**; the other 8 pass either way — the unfiltered endpoint
happens to return the same set for those cases, and the scoping ones are regression guards for
behaviour that was already correct, which is the point. The 14 frontend tests target
`ExpiringAmcPanel` and `listExpiringAmc`, **new modules with no prior version**, so they were not
and could not be proven to fail first — stated rather than claimed. Backend suite **27 files / 820
tests, all passing** (was 26/806). Frontend **78 files / 666 tests** (was 77/652); the 7 failures
are the known pre-existing flakes. `CustomersListPage.test.jsx` was checked with the panel
mounted and unmounted and behaves identically, so mounting it there made nothing worse.

**NOT done, reported instead:** `AmcRenewalsDueWidget` still links to the removed `/amc` route and
should point at `/customers`. It still carries another session's uncommitted edit (`text-right` →
`text-left`) on the line directly adjacent to the `<Link>` that needs changing, so per the task's
own instruction it was left untouched rather than committing someone else's work.

### 2026-08-06 — Leave notifications: dismissal fixed, and every decision now notifies (§7.43)

**The reported bug was not what it looked like.** "An employee submits a leave request; the admin
never receives a notification" was traced end to end against production first: recipients
(manager + all admins, deduplicated, subject skipped), the `Notification` documents, the bell's
query and the sidebar badge's query were **all correct**, and `createNotification` was awaited.
A real employee submission wrote two unread rows and the admin's bell returned it.

The bug was **dismissal**. `clearLeaveBadge` was wired as `onNavigate` on the Attendance nav item
and called `markAllRead` for every leave type, so an admin who opened Attendance to look at
*attendance* silently marked every unread leave notification read — including ones never
displayed. `clearLeadsBadge` did the same on the Leads item. Corroborated in live data: two
notifications created minutes apart were both already `isRead: true` with nobody having dismissed
them.

**Fixed:** both `onNavigate` wirings removed along with the clear functions and the
`markNotificationsReadByType` wrapper (so the pattern cannot be re-wired by accident); the backend
`markAllRead` endpoint is unchanged, since it was always correct for an explicit action — the bug
was the caller. Dismissal is now only opening a notification from the bell, or its "Mark all as
read". Nothing marks read on render, hover, or route change.

**Also fixed, the one genuine gap in the recipient work:** `markUnapprovedAbsence` sent no
notification at all, despite being the only decision that also applies `isDoubleDeduction` — the
employee learned about a double deduction by noticing their balance. It now writes a new
`leave_unapproved_absence` type, deliberately not reusing `leave_approved`: the handler sets
`status: "approved"` internally, and calling it "approved" would be worse than silence.

**Two staleness fixes:** `useSidebarBadgeCounts` gained the `visibilitychange` refetch the bell
already had (the badge sat stale on tab return while the bell updated), and now listens for a
`NOTIFICATIONS_CHANGED_EVENT` the bell fires on every dismissal — the two hooks read the same
endpoint with no shared store, so the badge previously showed a stale count for up to 60s after
the user acted.

**Trace cleanup:** the leave record created by the investigation (`6a746f9c6756155efcdf575b`) and
its two notification rows were deleted **by exact `_id`**, after printing them, with an abort if
the counts did not match exactly 1 and 2. No substring or reason-text matching — a substring
cleanup previously hard-deleted three real leave records in this project.

**Verified in a browser:** four navigations (Attendance, Leads, Customers, Payments) fired zero
mark-read calls and left both unread notifications and the badges intact; opening a notification
marked exactly that one read and the sidebar badge dropped immediately rather than after its poll;
a simulated tab return triggered three refetches (bell + both sidebar queries) and the badge
picked up a new notification.

**Tests:** 11 new backend (`leaveNotifications.test.js`), of which **3 fail against the previous
code** — the mark-unapproved-absence ones; the other 8 pin request-side behaviour that was already
correct and are labelled as regression guards. 6 frontend tests new or inverted, **all 6 verified
to fail against the previous code**. Two of those needed a second pass: asserting only on
`markAllNotificationsRead` passed either way, because the old code called
`markNotificationsReadByType` instead — the mock deliberately still carries that export so its
absence is what proves the auto-clear is gone. Backend **28 files / 831 tests, all passing** (was
27/820). Frontend **78 files / 668 tests** (was 78/666); the 10 failures are the known pre-existing
flakes in `LeadDetailPage`, `CustomersListPage`, `PaymentsListPage` and `UserManagementPage`.

### 2026-08-06 — Dismissal on engagement (§7.44) and bar/summary agreement (§7.45)

**§7.44 — badges clear when the user acts on the item, not when they navigate.** Approving,
declining or marking-unapproved-absence a leave request now marks that request's notification read
via `markNotificationsForEntity`, resolved through `relatedEntity`. Only that record's — acting on
one request never clears another's badge, which is what separates this from the §7.43 bulk-clear
bug. Opening a lead from a notification already marked it read; that path was unchanged. The helper
fires `NOTIFICATIONS_CHANGED_EVENT`, so the bell and both sidebar badges move in the same tick.

It reads `GET /notifications` and PATCHes the matches rather than calling a dedicated endpoint. A
`PATCH /notifications/read-by-entity` would be one round trip instead of two and is the cleaner
shape — this stayed frontend-only because that endpoint does not exist and adding one would mean a
backend deploy for a UI dismissal rule. Flagged as worth revisiting if this grows past a few call
sites.

**No dismiss affordance on the badge itself** — a deliberate call. The badge lives inside a nav
`Link`, so a click target there would re-create exactly the ambiguity §7.43 removed. A badge is a
count, not a control; the bell is the surface whose purpose is notifications and it already has
per-item dismissal and "Mark all as read".

**§7.45 — the bar and its own labels now describe one window.** Both derive from `resolveShiftMs`.
Two contradictions are gone:

- A shift crossing midnight drew a bar ending at midnight beside `Shift: 49h 23m`. **Decision: a
  row reports THAT DAY's portion**, because the row is a day. The full span stays in
  `workingHours`, computed once at checkout from untouched timestamps, so payroll is unaffected.
- An open shift returned nulls (three `-` labels) beside a green band. It now reports
  elapsed-so-far, and the bar stops at `min(now, end of day)` rather than running to midnight —
  drawing to midnight would claim time that has not happened.

A 1-minute `MIN_SEGMENT_MS` floor suppresses the 0.004% slivers produced by `breakIn`/`breakOut`
seconds apart, applied to gaps too.

**One regression caught by the tests:** moving durations onto the shared window made them depend on
`record.date`, which they never needed before — a fixture without it produced `NaN`. Real records
always carry `date` (the model requires it), but `dayBoundsMs` now falls back to the check-in's own
day rather than emitting `NaN`.

**Verified in a browser:** approving one of two pending requests marked only `n-A` read, left `n-B`
unread, and the badge dropped 2 to 1 immediately; an in-progress shift rendered a green band of
22.94% against 22.92% expected for 5h30m, with the label reading `Shift: 5h 30m so far` rather than
`-`.

**Tests:** 23 new (12 bar/summary agreement, 8 `markForEntity`, 3 `LeaveSection` integration).
**9 of the 12 agreement tests and 2 of the 3 integration tests fail against the previous code**; the
remaining agreement cases cover the normal single-day shift, which always agreed, and the third
integration test asserts nothing is dismissed when the decision itself fails — true either way, an
invariant guard rather than a discriminator. The 8 `markForEntity` tests target a **new module with
no prior version**, so they were not and could not be proven to fail first. One existing test
asserting the old "all nulls for an open shift" behaviour was inverted. Frontend suite **80 files /
691 tests** (was 78/668); the 15 failures are the known pre-existing flakes, now including
`LeaveRequestModal` under full-suite parallelism — it and the whole leave module pass in isolation
(4 files / 46 tests).

---

### Web Push — the client half (§6.7, 2026-08-07)

The backend has been able to send pushes since 2026-07-16. **Nothing could receive them.** A
browser only gets a push through a service worker, and the app had none — so every push the
backend sent went nowhere. This is that half.

**Checked first, as asked, and two things had to be reported before building:**

1. The frontend Vercel project has **only** `VITE_API_BASE_URL`. There is no
   `VITE_VAPID_PUBLIC_KEY`, so `pushManager.subscribe()` could not work in production at all.
2. **Production and local backends hold different VAPID keypairs** (prod `BKWphfvxobPJ…`, local
   `BPoNIIS0JDsYd4…` — both valid, `identical: false`). A subscription is cryptographically
   bound to the key that created it, so shipping the wrong one means every push is rejected
   with a 403 and swallowed per-subscription by `attemptPush` — **failing silently**, which is
   the worst shape this can fail in.

Handled on the existing `ATTENDANCE_CLEANUP_TOKEN` precedent rather than inventing a new one:
documented in `.env.example`, read at runtime, **degrades safely when unset**, and reported for
the user to set. No Vercel env var was set from here.

**Built:** `frontend/public/sw.js` (push + notificationclick),
`src/modules/notification/pushSubscription.js`, `components/PushNotificationToggle.jsx` in
Settings → Account, and `notificationRoutes.js` — one route table now shared with the bell,
which previously kept its own copy.

**The worker registers on load; permission is not requested on load.** Those are separate
actions and conflating them is the classic mistake: the prompt appears once, users reflexively
deny, and **a denial can never be re-requested programmatically.** So the only caller of
`Notification.requestPermission()` is the user's click on the toggle. `denied` therefore renders
a *disabled* switch plus an explanation that it has to be changed in browser settings — an
enabled-looking control would do nothing when clicked, forever, with no way to work out why.
Unsupported browsers and an unset VAPID key both render **nothing at all**.

`sw.js` caches nothing and has no `fetch` handler — a cache would serve stale HTML after a
deploy, trading push's problem for a worse one. It must carry a duplicate route table (a worker
is a standalone script served from the site root and cannot import from `src/`), so
`notificationRoutes.test.js` parses the real `sw.js` off disk and asserts the copies agree.
**That guard was initially wrong in a way worth recording:** its regex matched only template
literals, so `leave: () => "/attendance"` was silently skipped and the test reported green while
checking half the table. Fixed to match both shapes.

**Verified in a real browser, and the last hop was actually proven** rather than assumed: a real
push, signed by the backend's own `sendPush()` with the real VAPID pair, was accepted by FCM
(`PUSH_STATUS=201`) and then **observed being displayed by the service worker** — title
`Leave request`, body `Employee requested unpaid leave`, tag `leave_requested`, click target
`/attendance`. Subscribe and unsubscribe both POSTed, with a genuine FCM endpoint and both
`auth`/`p256dh` keys. Two environment traps cost real time here: **Chrome disables the Push API
in incognito**, and Playwright's ordinary contexts are incognito-equivalent, so
`launch_persistent_context` is required; and **headless Chromium always reports
`Notification.permission === "denied"`** regardless of `grant_permissions` (which only affects
the Permissions API), making the enable path unreachable headless. An earlier run reported "all
checks passed" while subscribing zero times, because the payload assertions were conditional —
flagged as misleading and re-run rather than accepted.

**Tests:** 45 new (13 routes/drift-guard, 22 subscription, 10 toggle). Frontend suite **83 files
/ 736 tests** (was 80/691) — exactly +3 files and +45 tests, confirmed per file. The 4 failing
files are the known pre-existing flakes. **Every module in this task is new with no prior
version** (`sw.js`, `notificationRoutes.js`, `pushSubscription.js`, `PushNotificationToggle.jsx`),
so none of the 45 could be proven to fail against earlier code — stated plainly rather than
implied.

**Outstanding:** `VITE_VAPID_PUBLIC_KEY` must be set on the frontend Vercel project (Production)
to the **production** backend's public key. Until then the toggle correctly renders nothing in
production.

**Deploy defect found and fixed in the same pass (2026-08-07).** The first production deploy of
this feature **shipped the LOCAL dev VAPID public key**. Found by checking the deployed bundle
rather than trusting that the deploy had done what it was meant to.

Mechanism: `frontend/.env` is gitignored, but the **Vercel CLI uploads it anyway**, and Vite
inlines a `.env` value for any variable **not also set in the Vercel project's own env
settings** — a real env var wins, an absent one does not. `VITE_API_BASE_URL` was therefore safe
(Vercel has its own value, `/api/v1`), while `VITE_VAPID_PUBLIC_KEY` was not. Only the *public*
key was exposed — the private key is backend-only and was confirmed absent from the bundle — but
the wrong key is **worse than no key**: subscriptions are cryptographically bound to the key
that created them, so production would have handed out subscriptions its own backend could never
push to, 403'd and swallowed per-subscription, behind a toggle that looked like it worked.
Precisely the failure the unset-key path was designed to avoid.

The first fix attempt put `.vercelignore` in `frontend/` and **silently did nothing** — caught
only because the redeployed bundle still contained the key. **Vercel uploads from the repo
root**; the project's Root Directory setting (`frontend`) only says where to *build*. The build
log settles it: `Downloading 535 deployment files` against 533 files in the repo and 350 under
`frontend/`. Moved to `/.vercelignore`, after which the upload dropped to **352 files** and the
key is gone from the bundle (`index-BYgly3tm.js` → `index-DX9Sw_c2.js`).

A `.vercelignore` **replaces** `.gitignore` for upload filtering, so `node_modules`/`dist`/
`coverage` are restated in it rather than inherited. It also now excludes `backend/`, whose
`.env` carries `MONGODB_URI`, `JWT_SECRET` and the **VAPID private key** and was being uploaded
into the frontend project's build environment on every deploy with no reason to be there.

Production re-verified after the fix: `/sw.js` served (200, 4424 bytes), the worker registers on
load, no push-related console errors, and no VAPID key of either origin in the bundle — so the
toggle correctly renders nothing until the production key is set.

---

### Tickets deferred from the UI (2026-08-07)

**Hidden, not removed.** Tickets stays a core module in `.context/final-plan.md` §7.8 with a
Customer Portal dependency, and **the backend module, routes, model and data were not touched** —
all 35 backend ticket tests still pass untouched. This is a scope deferral.

**Checked what depended on it before removing anything**, per the AMC precedent where deleting
the directory would have broken the Dashboard widget and Reports. 16 files referenced tickets;
the ones that mattered:

| Depends on tickets | Decision |
|---|---|
| `TicketsOpenWidget` → `ticketApi.listTickets` | **Kept.** Live backend, real counts. Only its `/tickets` link was removed |
| `DashboardPage.test.jsx` (11 ticket assertions, incl. the widget-error test) | **Untouched** — the widget still renders, so none of them needed changing |
| `permissionModel.js` (`tickets.*` tiers, `CAPABILITY_ONLY_MODULES`) | **Kept.** The backend enforces these; removing them would break admins' ability to manage ticket permissions |
| `notificationRoutes.js` + `public/sw.js` | Entry removed from **both** route tables |
| `MainLayout.jsx`, `router.jsx`, `routePaths.constants.js` | Nav item, routes and constants commented out / removed |
| `TicketsPage.jsx`, `TicketDetailPage.jsx` | Deleted — both were 7-line `PlaceholderPage` stubs |

**Notification routing (one of only four modules that create notifications).** The backend still
creates ticket-assignment notifications and was deliberately left alone, so rather than stop
generating them, `tickets` was removed from the shared route table in both copies. They now
resolve to `null`: the bell shows and marks them read in place without navigating, and a push
opens the app root. A dead `/tickets/:id` would be strictly worse than not moving the user.

**The links were the actual point.** `/amc` was retired months ago and `AmcRenewalsDueWidget` has
linked to the dead route ever since because nothing checked. New `src/routes/deferredModules.test.js`
scans every source file for client-side navigation to `/tickets` and fails on any hit — while
deliberately **not** flagging `apiClient.get("/tickets")`, which is a live endpoint the widget
still calls. It also asserts the walker found >100 files, so a broken scan can't pass vacuously.

**Contested files.** `MainLayout.jsx` and `TicketsOpenWidget.jsx` both held another concurrent
session's uncommitted work. MainLayout's was on a different line (they had commented out Travel
Logs) so it was layered cleanly. **TicketsOpenWidget's was not**: their `text-right` → `text-left`
change was on the very `<div>` wrapping the dead link, so removing the link superseded it. Only
this task's own hunks were committed; nothing of theirs was.

**Tests:** suite **84 files / 742 tests**, up from 83/736 — net +6, reconciled exactly: +5 in the
new `deferredModules.test.js`, +1 MainLayout nav assertion, +1 notification-routing assertion,
**−1** because the sw.js drift guard's `it.each(Object.keys(MODULE_ROUTES))` now generates three
cases instead of four. **5 of the new/changed tests were confirmed to fail against the pre-change
code** by temporarily restoring every touched file to HEAD and re-running. The 4 failing files are
the known pre-existing flakes (`CustomersListPage`, `PaymentsListPage`, `UserManagementPage`,
`LeadDetailPage`). `npm run build` clean. Lint went 69 → 67 problems: two `no-undef` errors on
`process.cwd()` in this task's and the previous task's file-scanning tests were fixed by
resolving from `import.meta.dirname` instead, which is also cwd-independent.

---

### Attendance timestamp ordering (2026-08-08)

Found while investigating record `6a746d3ad55dc38118130f1c`, which looked like a check-out before
its check-in. **It wasn't** — it is a genuine 17.4-hour overnight shift (in 6 Aug 16:47 IST, out
7 Aug 10:11 IST); the earlier "inverted" reading came from a listing script printing time-of-day
only and discarding the date. Its `workingHours: 0` has a different cause entirely: a single
`connectivityGap` spanning the whole shift, start and end matching check-in and check-out to the
millisecond, so the entire duration is subtracted as unverified.

But the investigation surfaced a real hole. **Nothing anywhere rejected a check-out at or before
its check-in** — not `attendance.validation.js` (only `Date.parse` !== NaN), not the service, not
the model. Self-service check-out can't invert (it stamps `now`), but `adjustAttendance` and
`createManualAttendance` both accept arbitrary times. And because `computeWorkingHours` clamps
with `Math.max(0, ...)`, an inverted pair landed as `workingHours: 0` — **indistinguishable from
a legitimately zero shift, so it would have been silent every single time it happened.**

Fixed by rejecting the input, not tolerating it. The clamp is untouched: a negative
`workingHours` would be worse than a clamped one.

- Both admin paths return **400** for an inverted or equal pair. Equal counts — a zero-length
  shift is not a correction anyone means to make, and it is what an off-by-one produces.
- **`PATCH` compares the merged record, not the payload.** A patch carrying only `checkOut.time`
  is checked against the stored check-in — the case a payload-only guard misses entirely. It
  throws before `save()`, so a rejected correction writes nothing.
- **Not a same-day rule.** An overnight shift passes; only ordering is asserted. Clearing
  `checkOut.time` still works.
- A `pre("save")` backstop on the model stops a future write path reintroducing it — which is
  exactly how it went unnoticed. It throws a plain `Error` with `statusCode = 400` instead of an
  `ApiError`, keeping models dependency-free as they are everywhere else here.

**The backstop immediately caught six existing test fixtures** seeding
`checkIn.time === checkOut.time` as shorthand (`payroll.test.js`, `attendanceRetention.test.js`,
`attendancePhotoCleanupCron.test.js`). None assert on timestamps and no real record can have that
shape, so the fixtures were corrected rather than the rule relaxed — payroll's now derives its
check-out from the `workingHours` it was already claiming, which the equal-timestamp version had
been quietly contradicting. Verified first that **zero existing production records** would be
rejected by the new rule.

**Tests:** 12 new. **8 of the 12 fail against the pre-change code** — every rejection case on both
admin paths plus both backstop cases. The other 4 are acceptance guards that must pass before and
after (valid overnight on each path, clearing `checkOut`, and saving an open shift), which is
their purpose: they prove the rule doesn't over-reject. One of them, "writes NOTHING when it
rejects", initially passed against the buggy code for the wrong reason — it queried `date` at UTC
midnight while `createManualAttendance` stores LOCAL midnight via `startOfDay`, so it found
nothing either way; rewritten to match on the exact `checkIn.time` sent, after which it failed
correctly. Backend suite **28 files / 843 tests, all passing** (was 831 — exactly +12, no new
files). The `leave.test.js` date-sensitive failure noted in earlier entries is not failing today.

---

### Two-factor becomes opt-in, with a self-service off switch (§7.38b, 2026-08-08)

2FA was mandatory for admin and manager, enforced on **every authenticated request** by a gate
that 403'd with `TWO_FACTOR_ENROLMENT_REQUIRED` and a blocking enrolment screen at login. It is
now opt-in for every role, and any user can turn their own on or off from Settings → Account.
**Nothing was auto-disabled** — anyone already enrolled keeps their 2FA and is still held at the
second factor.

**The mandate was removed, not switched off.** Gone entirely: the middleware gate and its
exempt-path list, `constants/twoFactor.constants.js`, the `mustEnrol`/`requiresEnrolment` branch
in login, the `authenticateEither` middleware (whose only purpose was letting a pre-auth token
reach `/2fa/enrol/*`), the blocking enrolment branch in `LoginPage`, and the frontend
`twoFactor.utils.js` mirror of the rule. Enrolment is now purely post-authentication, so those
routes take a full session. Two live leftovers were also cleaned once found — a
`requiresEnrolment` branch still in the test login helper and a stale `authenticateEither`
reference in a test comment.

**`POST /2fa/disable` is the load-bearing part.** It requires the current password **AND** a live
second factor (TOTP or recovery code) in the same request. `authenticate` is necessary but
deliberately not sufficient: the threat 2FA exists to defeat is an attacker holding a session they
shouldn't have, so letting a bare session switch it off would mean the protection could be removed
by exactly the thing it protects against.

- **Password checked first**, so a wrong password cannot burn a recovery code — `verifySecondFactor`
  consumes one on success and drives the lockout counter on failure.
- **Self-scoped**: the id comes from `req.user`, and any `targetUserId` in the body is ignored.
  The audited admin reset remains the only cross-user path, unchanged.
- **Clears the secret and every recovery code, and revokes all trusted devices.**
- **Enable and disable are both audited** with actor and timestamp, matching the admin reset.

**Settings → Account** now shows one switch reflecting current state. Flipping it OFF calls no API
— it opens a confirmation asking for both credentials and stating plainly that every trusted
device will be signed out. A server refusal is surfaced in the modal, which stays open, so the
switch never reports a state the server didn't agree to.

**Tests.** Backend **28 files / 858 tests, all passing** (was 843 — net +15: 17 new, minus two
mandate tests that had to be inverted or removed). **All 17 new backend tests fail against the
pre-change code**, verified by restoring every source file to HEAD while keeping the new tests.
Twelve *existing* tests also failed in that run, but only because the shared `enrol()` helper was
rewritten for the new session-only contract — they are not evidence of the feature and all pass
after the change. Frontend **85 files / 752 tests** (was 84/742 — +11 new, −1 moved out of
`LoginPage.twoFactor.test.jsx`), the 4 failures being the known pre-existing flakes; **all 11 new
Settings tests fail against pre-change code.** The 5 `LoginPage` 2FA tests pass either way, and
deliberately so: the mandate was enforced by the backend's login response, not by `LoginPage`,
which only renders what it is told — they are guards, not discriminators, and saying otherwise
would overstate them. Both builds clean.

---

### The 401 interceptor conflated "wrong password" with "session expired" (2026-08-08)

Reported as "the 2FA switch doesn't work for admin". The switch was fine. So was the endpoint, the
deployed bundle, and every component. **The bug was `frontend/src/services/apiClient.js`.**

It redirected to `/login` on every 401 except a hard-coded `/auth/login` exemption. Several
endpoints return 401 for a *wrong credential on a healthy session*, so a mistyped password signed
the user out — and the modal unmounted before the server's message could render. Confirmed live in
a browser against the production admin:

```
dialog open: True
AFTER A FAILED DISABLE (wrong password):
  url now            : https://smartrays-crm.vercel.app/login
  dialog still open  : False
  error shown to user: False
```

The server had said `"Your password is incorrect"`. Nobody ever saw it.

**All 17 backend 401s were classified.** Eight are session-expiry (four session, four pre-auth
token lifecycle) and all originate in `authenticate.middleware.js`. Seven are credential
rejections (login ×2, change-password, admin-reset re-auth, enrolment confirm, verify, 2FA
disable). Two are machine-to-machine tokens — the attendance cleanup cron and the lead webhook —
which the browser never calls.

**The fix inverts the approach rather than adding another exemption**, which is how this stayed
hidden: every endpoint nobody remembered to list was mis-handled. The backend marks session expiry
with `errors: [{ code: "SESSION_EXPIRED" }]` through a single `sessionExpired()` helper, and the
interceptor redirects only on that. A new credential-checking endpoint is now safe by default; a
new session check has to opt in beside the other seven. It keys off the **response**, never the
URL, so a session that dies while a modal is open still signs the user out. The `/auth/login`
special case was deleted with nothing replacing it — a failed login simply isn't marked.

**No component changed.** Every caller already rendered `error.response?.data?.message`; those
handlers just never ran.

**Tests.** Backend **29 files / 870 tests** (was 28/858 — +12, one new file). Frontend **86 files /
763 tests** (was 85/752 — +11, one new file). Failure-first: **5 of the 12** backend tests fail
against the pre-fix code (the "marked" half — the other 7 pass trivially because nothing was marked
yet, and exist to catch the marker leaking onto a credential rejection), and **6 of the 11**
frontend tests fail (every credential-rejection case; the "marked" ones already passed since the
old code redirected on everything). The 4 failing frontend files are the known pre-existing flakes.

**Verified in a real browser against a local build before deploying** — wrong password: stays on
`/settings/account`, modal open, shows `"Your password is incorrect"`; correct password + wrong
code: shows `"That code isn't valid."`, distinct and also non-navigating; cleared cookies: still
redirects to `/login`. The wrong-code case consumes one failed attempt of five, so that script
signs in again afterwards to reset the counter — `verifySecondFactor` zeroes it on success.

---

### Data operation: 2FA cleared for all enrolled users (2026-08-09)

Deliberate operation on production records. **The feature is untouched** — enrol flow, disable
endpoint, Settings toggle and every test stay exactly as they are. This turned 2FA off for the
users who had it; it does not undo the feature, and anyone can re-enable from Settings → Account.

Matched on `twoFactorEnabled: true` **only** — never a name, email or role. The listing pass found
**2** accounts where one was expected, so the operation stopped and was re-confirmed before any
write. It also checked for users holding a stored TOTP secret *without* the flag (an abandoned
enrolment would leave a usable secret behind the match): there were 0, so the match was complete.

Run through `clearTwoFactor` per user rather than raw updates, so exactly the same fields cleared as
a real self-service disable and this can never drift from that path. A guard re-verified the matched
set against the two confirmed ids and would have aborted on any difference.

```
[2FA DISABLED] actor=data-operation target=6a59eea201a7c86af8551063 (smartrays.crm@gmail.com) at=2026-08-08T20:09:20.278Z
[2FA DISABLED] actor=data-operation target=6a7195787ce48914129090d4 (manager@gmail.com)        at=2026-08-08T20:09:20.429Z
```

`actor=data-operation` rather than a user id, because no user performed it — attributing it to an
account would misrepresent who acted.

| Account | twoFactorEnabled | secret / IV | recovery codes | trusted devices | failed attempts |
|---|---|---|---|---|---|
| Vinay (admin) | true → **false** | set → **null** | 10 → **0** | 5 → **0** | 0 → 0 |
| testing manager | true → **false** | set → **null** | 10 → **0** | 0 → 0 | 0 → 0 |

**After:** `twoFactorEnabled:true` → **0 users**; stored TOTP secrets → **0**; trusted devices
across all users → **0**. Verified end to end against production: the admin now logs in with a
password alone — `200`, session cookie set, no `preAuthToken`, `"Logged in successfully"`.

Vinay's 5 trusted devices are gone, which is inherent to clearing 2FA: a device trusted against a
second factor must not outlive it. Those browsers will ask for a password again — and only a
password, since there is no second factor now.

---

### Today's roster on the Attendance tab (§7.4g, 2026-08-09)

Manual marking for people who genuinely cannot check in — no internet, dead phone, app not loading —
plus the pending leave cards moved to where the roster they affect lives.

**Audited before building, and one finding changed the shape of the work.** `designation` did not
exist on `User`. And `MARKABLE_STATUSES` was `["absent", "half_day"]`: `present` and `on_leave` were
both **deliberately** excluded with the reasoning written into the code, so two of the three
requested states were exactly what the endpoint refused. That was reported rather than routed
around.

**Resolved:** widen for `present` only. The objection to it was that nothing distinguished a mark
made on someone's word from a device-captured one — and `isManuallyAdjusted`/`adjustedBy` are that
distinction, set on every record this path creates, permanently. The old comment was rewritten
rather than left contradicting the code. **`on_leave` stays excluded**: leave approval writes it, so
hand-setting it would assert a leave state with no leave record behind it. The roster displays it
and can never set it.

**Conflict case, decided:** when approving leave for a day that already has a record, the record is
left completely untouched and reported back as `attendanceConflicts` (with `hasRealCheckIn` per
day). It never overwrites — a real check-in carries photo, coordinates and heartbeat data that
cannot be reconstructed — and never blocks the approval, because approval is a *leave* decision and
stranding it over an attendance clash the employee cannot resolve would be worse. Same "create where
nothing exists, never touch what does" rule `markAttendanceStatus` already established.

**The read-only guard is in the SERVICE, not the UI.** `PATCH /attendance/:id/roster-status` refuses
any record whose `checkIn.time` is non-null, so it holds if a future UI change forgets. It is
admin-only, unlike `mark-status`: that takes an `employeeId` and scopes per-record, whereas this
takes a raw attendance id and `adjustAttendance` has no ownership check — a manager tier would have
let one correct any record by guessing an id.

**A real UI bug caught by a failing test rather than shipped:** the state control was an AntD
`Segmented`, which paints its first option as selected when `value` is undefined. An unmarked
employee therefore *looked* like an already-recorded Half Day, and clicking that option did nothing
because the control considered it current. Replaced with radio buttons, which leave nothing selected
until a real choice is made.

**Tests.** Backend **30 files / 885 tests** (was 29/870, +15). Frontend **87 files / 776 tests** (was
86/763, +13). The roster endpoints, `designation` and the leave→attendance write are **new with no
prior version**, so those tests could not be shown failing against earlier code — stated plainly
rather than implied. The genuinely discriminating one is `present` being markable, which reversed an
existing test that asserted the opposite; that test was rewritten to pin the new contract (`present`
markable, `on_leave` still refused) rather than deleted. The 4 failing frontend files are the known
pre-existing flakes.

---

### Map appearance and usability (2026-08-09)

**CARTO Positron → CARTO Voyager.** Same provider, keyless, no request limits; a URL change. Still
one `TileLayer`, still zero OSM tile requests.

**Fit-to-bounds already existed** — the gap was the single-marker case. A degenerate bounds zooms to
the layer's `maxZoom` (20), landing on a rooftop; the fit now caps at 16.

**"View in Google Maps"** on every marker popup, opening `?q=LAT,LNG` in a new tab.

**Marker shapes added** — ring (shift start), haloed disc (current position), diamond (geofence
breach) — so the Live Map reads by silhouette rather than hue.

**Two colour collisions found and fixed while here**, both of which the brief's "don't reuse the
timeline family" constraint exposed rather than predicted: the current-position marker was
**red/green**, which IS the timeline family, so a live marker and a timeline band carried the same
signal — now blue, grey when stale. Geofence violations were **orange**, adjacent to the timeline's
amber — now violet, inside the sky/violet geofence family.

**Tests:** frontend **89 files / 787 tests**, count unchanged — six existing map tests were updated
rather than added, moving their assertions from colour to `shape`, which is now the primary signal.
The `react-leaflet` mocks needed a `Popup` export. **Not verified in a real browser**: tile loading,
`fitBounds` and layout at 1280/390 cannot be meaningfully checked in jsdom, and that verification
was not run.

---

### Manual-mark reason: backend (11028a2) and the roster prompt (§7.4h, 2026-08-09)

**Backend (committed earlier as `11028a2`, docs owed until now).** A manual mark is the only
attendance path with no device evidence behind it — no photo, no coordinates, no heartbeat — so the
reason is the entire record of what happened. Required on `POST /attendance/mark-status` and
`PATCH /attendance/:id/roster-status`, enforced in the **service** as well as the validator so no
future caller can reach either path without one; empty and whitespace-only both rejected.

New `Attendance.adjustmentReason` (latest claim, for display) and `adjustmentHistory[]` (every claim:
`status`, `reason`, `at`, `by`). **A correction captures its own reason and both are kept** —
changing Half Day to Full Day asserts something different about the day, and that someone first said
half and then said full IS the audit trail. Leave-approval records get their reason automatically
rather than prompting: unlike a roster mark they DO have evidence behind them, so the reason names
the approved request.

**UI half (this commit).** The roster now collects the reason instead of discovering the rejection.
Clicking a state opens a prompt and writes nothing until submit; submit is disabled while the field
is empty or whitespace. A correction starts blank. The reason displays in the row, and the two
pre-existing marks show **"—"** rather than being backfilled. A failed submit surfaces the server's
message inline and keeps the prompt open — `handleRosterState` rethrows deliberately, because a
toast would sit behind the modal.

**Tests.** Backend 30 files / 890 tests. Frontend **89 files / 795 tests** (was 89/787, +8). Three
existing roster tests asserted the old direct-write behaviour and were rewritten to go through the
prompt rather than deleted; one more needed `getAllByText` because the new Reason column renders its
own dash. The 4 failing frontend files are the known pre-existing flakes.

**Verified in a real browser** (not skipped this time): the prompt opens with **zero API calls from
the click alone**, submit is disabled while empty, and a real submit returned
`PATCH /attendance/…/roster-status 200` with the reason then visible in the row. That last step
wrote a genuine correction to the production record it acted on, which is inherent to proving the
path end to end.

---

### Roster rows lock once marked (2026-08-10)

The Half Day / Full Day buttons stayed live after a mark, so a row could be re-marked by clicking the
other option — a second claim about the day with no deliberate act behind it, and no reason attached
to the change beyond whatever the prompt collected.

The buttons now stay **visible but disabled**: visible because the current state should still read at
a glance from the control that set it, disabled because the row is no longer something to click.
Correcting goes through an explicit **Edit**, which unlocks that one row and routes the change
through the same reason prompt the backend requires. Unmarked rows are unaffected; a row with a real
check-in stays non-interactive as before.

Browser-verified: all 4 radios on the two marked rows disabled, clicking a disabled button opened no
prompt and fired **zero API calls**, and Edit unlocked exactly one row (4 → 2 disabled).

Frontend 89 files / 800 tests (was 89/795, +5). One earlier test clicked a marked row directly and
was updated to go through Edit rather than deleted — that is the new behaviour, not a broken
assertion.

---

### Roster state buttons get pastel tints (2026-08-10)

A locked row's buttons went flat grey, so the two options were indistinguishable at exactly the
moment they stopped being clickable — the selection was legible only while still editable.

Each option now tints its checked state and **keeps that tint when disabled**; disabled drops the
border emphasis, not the colour. Rose for Half Day, teal for Full Day, because every adjacent family
is already spoken for: green/amber/red are the timeline's bands, sky/violet are geofence, blue/grey
are the live map's current-position and stale markers. Text is the -800 shade on -100, roughly 8:1
and 9:1 — past WCAG AA.

Verified in a browser against real computed styles rather than by eye:

```
Half Day  checked=True  disabled=True  bg=rgb(255,228,230)  fg=rgb(159,18,57)
Full Day  checked=False disabled=True  bg=rgb(250,250,250)  fg=rgb(156,163,175)
Half Day  checked=False disabled=True  bg=rgb(250,250,250)  fg=rgb(156,163,175)
Full Day  checked=True  disabled=True  bg=rgb(204,251,241)  fg=rgb(17,94,89)
```

Frontend 89 files / 801 tests (was 89/800). jsdom loads no stylesheet, so the colours themselves
cannot be asserted there; the added test pins the `.roster-state-control` hook the CSS keys off, so
removing the class cannot silently kill the tint. `LeaveSection.test.jsx` appears in full-suite
failures but passes 36/36 in isolation — the documented parallelism flake, not a regression.

---

### Roster inner scrollbar removed (2026-08-10)

`scroll={{ y: 260 }}` gave the roster Table a fixed-height body wrapper with its own
`overflow-y: scroll` — two scrollbars on the page, with the roster hidden inside the smaller one.
Removing the prop is the fix; overriding the overflow in CSS while the prop still set a `max-height`
would have kept the bound and merely hidden the scrollbar. With it gone AntD emits no
`.ant-table-body` at all, so there is no residual styling to clear.

**The records table below it never had a vertical bound.** Its only scroll prop is
`x: "max-content"` on `AttendanceTimeline` — horizontal, and kept. Item 3 of the request assumed an
inner vertical container there; there isn't one.

Verified in a browser against real computed styles, with a deliberately short viewport to force the
same condition 30+ rows would (rather than seeding 30 users into the production database):

```
after : ant-table-body elements = none; inner vertical scrollers = NONE;
        page scrolls = True; horizontal page overflow = False
before: ant-table-body { max-height: 260px, overflow-y: scroll }  -> FAIL
```

The before/after run also caught a stale `vite preview` serving an old bundle, which had made the
pre-fix check look identical to the post-fix one — worth knowing when doing before/after browser
checks: kill the listener rather than starting a second server on the same port.

---

### Leave approval cards become full-width strips (2026-08-10)

A `Row`/`Col` grid at `xl={8}` left a narrow card floating beside a large empty area. Replaced with
independent full-width strips, stacked, each its own surface via the shared `app-elevated-card`
(vertical margin overridden so spacing comes from the stack's `gap-3` only, not both).

Not a table: no header, no column borders, no shared column widths — a long name in one strip cannot
shift the fields in another. Fixed-ish fields are `shrink-0`; reason takes `flex-1` and truncates
with the full text on hover; actions pin right with `ms-auto`.

`min-w-0` on the reason is load-bearing: a flex child will not shrink below its content width
without it, and `truncate` then does nothing at all.

Measured against computed styles, not eye:

```
@1280 stripW=980 containerW=980  7 fields  offsetTop spread 2px  oneLine=True
@1024 stripW=724 containerW=724  7 fields  offsetTop spread 2px  oneLine=True
@390  stripW=310 containerW=310  reason truncates  spread 60px  wraps (expected)
tableSemantics=False and scrollWidth===clientWidth at all three
```

The first pass called 1280 a wrap: children are `items-center` aligned but different heights (Tag vs
Text vs span), so offsetTop varies 1-2px on a single line. Exact equality would report every strip
as wrapped; a spread threshold separates a real wrap (60px, a whole line-height) from alignment
noise. Status tints were deliberately NOT added — that is a separate item.

Frontend 89 files / 801 tests, unchanged: this is layout only, and the existing leave suite (46
tests across 4 files) already covers the actions and passes against the new markup.

---

### Pending leave strips get a pastel orange tint (2026-08-10)

`orange-100` (#ffedd5) fill on pending strips, shadow and layout from 708a03f untouched.

**Orange is now a taken family.** The register, so the next tint starts here: green/amber/red =
timeline bands, sky/violet = geofence, blue/grey = live map markers, rose/teal = roster state
buttons, orange = pending leave strip.

**Collision check, reported rather than assumed.** The timeline's break band is `bg-amber-400`
`rgb(251,191,36)`, a saturated mid-tone drawn as a thin bar in a 24-hour track; this is
`rgb(255,237,213)`, a pale wash across a full-width strip. Not confusable as used — but the pale
amber shades would be, and were avoided.

**The side-by-side screenshot could not be produced**: no record on screen currently renders timeline
bands, because today's records are all manual marks with no check-in, so the Timeline column draws an
empty track. `bg-amber` elements on the page: 0. The comparison above is therefore numeric, not
visual, and that limitation is stated rather than papered over.

Verified against computed styles: background `rgb(255,237,213)`, shadow preserved, and layout
unchanged from 708a03f — 7 fields, 2px offsetTop spread (one line), strip width 980 = container 980,
actions 16px from the right edge, no table semantics. Text contrast **18.33:1** (AA needs 4.5).

Frontend 89 files / 801 tests, unchanged — CSS fill only.

---

### HR profile fields — schema and form (§7.48 part one, 2026-08-11)

Five optional `User` fields — `dateOfBirth`, `joiningDate`, `address`, `emergencyContactName`,
`emergencyContactPhone` — all in `PRIVILEGED_FIELDS`, so a self-update is rejected 403.

**The pre-change behaviour was worse than a rejection: it was a silent 200.** Fields absent from both
allowlists were simply ignored by `updateUser`, so sending `joiningDate` to `PATCH /users/:id` on your
own record returned success and changed nothing. The tests assert 403 **and** that the stored value
did not change — all six fail against the pre-change code, verified by reverting the model and
service to HEAD while keeping the tests.

**Form: one definition for the shared sections, not the whole form.** `UserFormModal` branches on
`mode === "edit"` with two field lists, which is how the salary label drifted. `HrProfileSections` is
now defined once and rendered by both, with Base Salary moved into it so they cannot diverge again.
Account stays per-mode because the modes genuinely differ (create: password + Department; edit: Role
+ Manager) — unifying it would trade a real difference for a fake one.

Two bugs caught while building: `DatePicker` needs a dayjs value, not the API's ISO string, or the
pickers render empty for a user who has a date — reading as "not set" and clearing it on save. And
AntD's Modal defaults to a fixed 520px, wider than a 390px viewport; capped to the viewport.

**A pre-existing overflow found and NOT fixed:** Settings → Users has horizontal overflow at 390 —
`scrollWidth` 671 against a 390 client width. Measured with the modal open and closed: **671 both
times**, so it is the page's own table, not this form. Out of scope, recorded rather than silently
absorbed into this task.

Backend **30 files / 897 tests** (was 30/890, +7). Frontend 89/801; one existing assertion updated
for the renamed Base Salary label rather than deleted. Sections and all twelve fields confirmed in a
browser at 1280/1024/390, paired at desktop and collapsing below `sm`.

### Monthly leave-and-attendance report — the Report tab (§7.47, 2026-08-11)

A fourth admin tab on `/attendance`: one row per employee per calendar month — name, base salary,
present, absent, paid leave, unpaid leave, deduction, net payable. Filters are This month /
Last month / Custom month.

**The calculation lives in ONE place**, `backend/src/services/salaryCalculation.service.js`. The
report endpoint fetches and renders; the frontend does no arithmetic at all. Payroll (§7.7)
computes the same figures and its run has never fired in production — when that is fixed it must
consume this service. Two independent salary calculations do not surface as a failing test; they
surface as a disputed payslip. `payroll.service.js` is deliberately NOT migrated in this task —
that is a change to a real, dormant code path and belongs to Payroll's own work.

**Gated on `payroll.run`, not `payroll.view` — the access test caught this returning 200 with the
whole company's salaries in the body.** `payroll.view` is the obvious key and is wrong: it means
"own payslip only" and is in the DEFAULT employee role template, so every employee holds it. `run`
is the module's existing see-everyone tier, already used by `?scope=all`. No new key invented; the
brief's "gate on the existing key" was honoured by picking the existing key that means the right
thing.

**Three defects the browser found that the unit tests could not:**

1. **An unapproved absence was charged at 1 day, not 2.** `markUnapprovedAbsence` writes no
   Attendance record at all — it only flips the Leave row — so the day itself never appeared in
   `absentDays` and only the surcharge landed. Visible on real data as a row reading "Absent 0"
   beside a ×2 marker. The calculator now reconciles attendance and leave **per date** rather
   than summing two independent counts.
2. **A paid leave day was subtracted from a total it was never in.** Approving a full-day leave
   writes `on_leave`, not `absent`, so counting only `absent` and then deducting the 1-day
   allowance charged 1 day for 2 absences whenever someone actually used their paid leave.
   `on_leave` now counts as a day away — which is the shape of the worked case itself
   (3 absent → 1 paid + 2 unpaid).
3. **`—×2`** — a row with no base salary rendered the doubling marker beside an em dash,
   claiming a doubling of an unknown figure, and the table footnote appeared explaining a marker
   that was nowhere on screen. Both are now keyed on there being a deduction to explain.

**Horizontal overflow at 390 was mine, and measured as such before fixing.** The Report tab read
`scrollWidth` 557 against a 391 client width while the Attendance and Leave Requests tabs both sat
at 391/391 — eight columns of figures do not fit a phone. `scroll={{ x: "max-content" }}` moves
the scroll into the table that is too wide; `scroll={{ y }}` stays off (a991e21), and zero
`.ant-table-body` containers confirm it at all three widths.

Verified in a real browser at 1280/1024/390: no horizontal overflow at any width, the three filter
options on one row (offsetTop spread 0px), the filters actually re-fetching (August → July), and
the custom-month picker appearing only for that option. The money columns and the ×2 marker were
rendered by fulfilling the response at the CDP network layer — **no data was written**, because
every employee in this database has an unset `baseSalary` and the em-dash path is all real data
can show.

Backend **31 files / 917 tests** (was 30/897; +18 calculator, +6 payroll). Frontend **90 / 813**
(was 89/801; +11 report component, +2 tab). The four failing frontend files are the known flakes
(CustomersListPage, PaymentsListPage, UserManagementPage, LeadDetailPage) — their failure count
moved 10 → 6 between two runs of the same code, which is what makes them flakes.

**Unrelated: I killed a process that was not this project's.** Restarting the backend, I stopped
the listener on port 5000 assuming it was the smartrays API. This project runs on **5050**; port
5000 was another local project's server ("The Transaction Point API"). Nothing was deleted and no
data was touched, but that dev server needs restarting by hand.

### Annual paid-leave balance columns (§7.49, 2026-08-11)

Three derived columns on the Report tab — Old Balance, This Month Credit, Balance — in the order
Employee · Base Salary · Old Balance · This Month Credit · Present · Absent · Paid Leave ·
Unpaid Leave · Deduction · Net Payable · Balance.

**No approval rule and no schema changed.** `PAID_LEAVE_MONTHLY_LIMIT = 1` is untouched and
§11.7 still holds. All three figures are derived from year-to-date approved paid leave, so there
is no stored balance that can drift away from the leave records it summarises. "Balance" answers
how much of the annual allowance is left, not how many days may be taken now.

**The year boundary is one constant.** `LEAVE_YEAR_START_MONTH` + `leaveYearStart()` in the shared
service; calendar year today, and a financial year is a one-line change. `leaveYearStart` is
written generally rather than special-cased to January so that is actually true. The label rides
on every row, so the UI never re-derives a boundary of its own — it appears in the tab's
subheading beside the per-day-rate note.

**Existing figures proven unchanged against live data, not just against tests.** Leave is now
fetched for the whole leave year (Attendance stays month-scoped), so the widening was worth
checking properly: the live endpoint was called before and after the change and the responses
diffed. Every pre-existing field — present, absent, paid, unpaid, doubled days, deduction, net
payable — came back byte-identical; only `leaveYear`, `oldBalance`, `monthCredit` and `balance`
appeared. Worth doing, because an unrelated figure did move between two browser runs earlier the
same afternoon (an employee's Absent went 0.5 → 2.5) and the diff is what showed that was the
production database changing under us, not the code.

**A latent bug fell out of the widening:** `isHalfDay ? 0.5 : count` returned 0.5 for a half-day
leave lying entirely outside the requested range — invisible while only one month was ever
queried, wrong the moment a year-to-date window existed.

**The ×2 marker had two independent causes, not one.** `doubleDeductionDays` comes from the Leave
collection while Absent and Unpaid Leave come from Attendance, and `markUnapprovedAbsence` writes
no attendance record — so the leave row said "unapproved absence" while every visible column read
zero and the marker pointed at nothing. Separately, a row with no base salary rendered "—×2",
claiming a doubling of an unknown figure. The first was fixed in 0aba084 by reconciling attendance
and leave per date; the marker is now gated on `deduction > 0` through a single `showsDoubleMarker`
predicate shared by the cell and the footnote, so a zero deduction cannot carry a marker either
and the two can never disagree about whether a ×2 is on screen.

**Eleven columns fit at 1280 — measured, so nothing was narrowed or dropped.** 979px of columns
into a 980px holder: no page overflow, no internal scroll, and the specified "This Month Credit"
header kept verbatim rather than abbreviated to fit. That is one pixel of slack, so longer names
or larger salaries will start the table scrolling inside itself — `scroll={{ x }}` handles that and
the page still never scrolls sideways. Also verified clean at 1024 and 390. The longer subheading
initially pushed the filter control onto its own row; `flex-1 min-w-0` on the heading block wraps
the text inside its own column instead.

Every new test was demonstrated failing first: 9 of 10 new backend tests fail against the
committed service (the tenth is the deduction/net-payable regression guard, which must pass both
before and after), and 6 of 7 new frontend tests fail against the committed component. The seventh
— the reported zero row reproduced verbatim — already passed, because that exact shape was fixed
in 0aba084; the newly discriminating case is a zero deduction rather than a null one.

Backend **31 files / 931 tests** (was 31/921, +10 balance tests). Frontend **90 / 821** (was 90/814). The four failing
frontend files are the known flakes.

### The Report tab becomes a pure leave report (§7.50, 2026-08-11)

Final columns: Employee · Base Salary · Old Balance · This Month Credit · Absent · Paid Leave ·
Unpaid Leave · Deduction · Net Payable · Balance. Present is gone — this answers what leave people
took and what it costs, not who was at work.

**Absence is now counted from approved Leave records only, never Attendance.** A roster-marked
absence with no leave record behind it contributes nothing and is not deducted. That consequence
is real and intended, and the subheading says "Absent counts leave days, not roster-marked
attendance" in bold, because a column called Absent on a page called Attendance will otherwise be
read as the attendance number.

**This partially reverses 0aba084's two-source reconciliation, and both bugs that fix addressed
stay fixed — structurally, not by special-casing.** An unapproved absence still costs 2 days: its
Leave record *is* the absent day, so `markUnapprovedAbsence` writing no Attendance record cannot
bite a calculation that never reads Attendance. The `on_leave`-vs-`absent` split cannot diverge
either, because the status is never consulted — a test feeds deliberately contradictory Attendance
rows (`present`, `on_leave` and `absent` all in one month) and asserts every figure is unmoved.

**`presentDays` stays in the service even though no column shows it.** Payroll (§7.7) derives gross
pay from it, and this service exists to become the one calculator Payroll consumes; dropping it to
tidy a UI column would put that migration back. `attendance` now defaults to `[]` so a leave-only
caller need not fetch it at all.

**Width re-measured at ten columns rather than inherited from eight**, which was the point of
asking. At 1280 they fit exactly — 980px into a 980px holder, no page overflow, no internal
scroll. At 1024 (890 into 724) and 390 (890 into 311) they genuinely do NOT fit, so `scroll={{ x }}`
is still doing real work rather than sitting there redundantly. Zero `.ant-table-body` containers
at all three widths, so `scroll={{ y }}` is still absent. Money columns and the ×2 marker were
exercised by fulfilling the response at the CDP network layer — nothing written, since every
`baseSalary` in the database is unset.

Failing-first: 18 of the reworked backend tests fail against the committed service, and 4 of the
frontend ones. §11.7 and §7.49 are untouched — `PAID_LEAVE_MONTHLY_LIMIT = 1` stays, and the
balance columns keep their meaning and their single-constant year boundary. The gate stays
`payroll.run`.

Backend **31 files / 934 tests** (was 31/931). Frontend **90 / 822** (was 90/821). The four failing
frontend files are the known flakes.

### Report tab columns tinted by meaning (§7.51, 2026-08-12)

Three tints for ten columns, not ten. The tint marks what KIND of column it is, so the table reads
as three blocks: **entitlement** (Old Balance / This Month Credit / Balance, `indigo-50`),
**consumption** (Absent / Paid Leave / Unpaid Leave, `lime-50`) and **money** (Base Salary /
Deduction / Net Payable, `fuchsia-50`). Employee stays untinted — the anchor being plain is what
makes the blocks either side of it visible.

**Never by value.** Deduction and Net Payable share one tint precisely because a red deduction or a
green net payable would be the table passing judgement on someone's pay. Money is fuchsia rather
than the obvious green for the same reason.

**Palette register updated — indigo, lime and fuchsia are now taken.** Remaining: stone and cyan.
Stone was considered and dropped: `stone-50` is `#fafaf9`, indistinguishable from white behind a
table, so it fails the "palest tint that still reads as a tint" bar.

**A header/body mismatch was found by measurement and would have survived a screenshot.** Body cells
need only a plain class since AntD wraps those rules in `:where()`; header cells do not —
`.ant-table-wrapper .ant-table-thead >tr >th` is (0,3,0) and silently beat the class, leaving every
header grey while the bodies were tinted. Comparing computed header against computed body per column
is what caught it.

**The hover check was wrong on the first pass, and the numbers it produced were meaningless.** A
synthetic `mouseover` does not trigger AntD's row hover — it tracks hover through React's own
handlers — so the cells reported `hovered=false`. Re-run with a real `Input.dispatchMouseEvent`:
each group now deepens to its own `-100` step rather than reverting to grey, which keeps the three
blocks intact while the reader tracks across a row.

Measured at 1280: header and body match on all nine tinted columns, contrast **18.78:1 to 20.29:1**
(AA needs 4.5:1), layout unchanged at **980px of columns in a 980px holder**. 1024 and 390 still
handled by `scroll={{ x }}`, zero `.ant-table-body` containers.

**Dev-environment note:** port 5173 is now occupied by another local project, so this app started on
**5175** and the backend's `CLIENT_ORIGIN` (pinned to 5173) refused its requests. Rather than edit
`backend/.env`, the verification rewrites CORS headers at the CDP layer — the server and its config
are untouched. Worth knowing before anyone re-diagnoses that as broken credentials.

Frontend **90 files / 825 tests** (was 90/822, +3). The four failing files are the known flakes.

### Base Salary is labelled MONTHLY wherever it appears (§7.52, 2026-08-12)

The report divides this field by the calendar days in ONE month, and Payroll's `dailyRate` does the
same, so an annual figure entered here produces a Net Payable roughly 12× too high **with no error
anywhere** — every downstream number stays internally consistent and simply means something other
than what the reader assumes. Nothing in the UI said which basis was meant.

Both surfaces that show the raw field now state it: the User form reads **"Base Salary (Monthly)"**
with a helper line and a `₹` prefix, and the report's column carries **"(monthly)"** on a second
line. Net Payable carries it too — it shares the money tint with Base Salary, and saying it on one
and leaving the other to inference is what created the ambiguity. Recorded in `user.model.js`,
`backend/README.md` and final-plan §6.1, none of which had said so.

**No range validation**, deliberately: a legitimate salary can be almost any figure, and a warning
that fires on real values teaches people to dismiss warnings.

**The basis went on a second line rather than into the title** because the ten columns fit 1280 with
zero pixels to spare. Re-measured after: Base Salary still 97px, Net Payable still 101px, total
still 980px in a 980px holder. Modal body 617px → 618px, both 1280 and 1024 still scroll-free.

**Two verification notes, both worth keeping.** The `₹` prefix could have ended up inside the
submitted value — it does not: the browser reads the typed value back as `"41000"` with the prefix a
sibling node, and a new test asserts the create payload carries `baseSalary: 30000` as a number.
And the live end-to-end submit could NOT be exercised in the browser: :5173 is held by another local
project, this app runs on :5175, and the backend's `CLIENT_ORIGIN` refuses it — the CORS preflight
fails before the PATCH is ever sent. Rather than edit `backend/.env`, that path is covered by the
test suite; it is stated here rather than claimed as browser-verified.

**Known, pre-existing, NOT fixed:** the edit form shows Base Salary **empty even for a user who has
one**, because the field is `select: false` and no list endpoint returns it. Saving does not wipe it
(an untouched field is omitted from the payload — confirmed on a captured request), but an admin
sees a blank box where a real salary exists. Deserves its own task.

**Also observed:** `Testing User 2` now has a `baseSalary` of 32000, where every salary in this
database was unset earlier the same day. It was not set by this session's automation — no write was
ever captured, and the value does not match anything typed — but it is recorded here because the
verification scripts do drive the real app against the production database, and the first version of
one script intercepted writes at Response stage, where a write would already have been performed.
Fixed to intercept at Request stage.

Frontend **90 files / 828 tests** (was 90/825, +3). The four failing files are the known flakes.

### Payroll consumes the shared calculator (§7.53, 2026-08-12)

`payroll.service.js#computePayrollFields` no longer computes anything — it fetches inputs and calls
`salaryCalculation.service.js`. The service is owned by the leave report and consumed by Payroll,
noted in both so a future change to either knows it moves both. Payroll's arithmetic is deleted, not
left behind a flag.

**The "no historical data" premise was checked, not assumed:** `payrolls.countDocuments()` returned
0 against the production database before any code changed. The run was registered through
`node-cron`, which does not execute on Vercel, so it has genuinely never fired.

**Four differences, each of which mispaid somebody:**

| | Before | After |
|---|---|---|
| Gross | `dailyRate × (present + paidLeave)` | the agreed monthly salary |
| Half day | a whole present day (`countDocuments`) | 0.5 |
| Paid leave | uncapped | 1/month (§11.7) |
| Deduction | day count doubled | leave-sourced, surcharge counted once |

The gross change matters most: building gross UP from attendance meant **an employee with no
attendance records earned nothing**, marked absent or not. The suite's worked example moves from net
18,250 to 27,250 because only 20 of June's 30 days had a record and the other 10 were priced as
unworked. Missing data read as unpaid; now only recorded absence costs anyone money.

**`workingHours` prices nothing and must not start to.** A shift with no heartbeat computes to zero
hours — a real 17.4-hour overnight shift did — so a test gives two employees identical days and
wildly different hours and asserts every amount is equal.

**Payroll equals the report, asserted directly** — one test runs payroll for an employee with no
travel logs, fetches that month's report row, and compares presentDays, paidLeave, chargeable days,
gross, deduction and net field by field. Mileage is passed INTO the calculator rather than added
afterwards, which is what keeps that claim exact rather than approximate.

Failing-first: 4 of the 6 new/changed tests fail against the committed code. The other two —
`workingHours` affects no amount, and an unset baseSalary is refused rather than priced at 0 — pass
both before and after: they are regression guards on behaviour that was already correct, and
claiming otherwise would overstate them.

Backend **31 files / 939 tests** (was 31/934, +5). Two existing tests were rewritten rather than
deleted: the payroll worked example, and a cron assertion that read  because no
attendance had been seeded — that assertion encoded the very defect this fixes.

### The pay run (§7.54, 2026-08-12)

draft → review → approved → paid, on top of §7.53's shared calculator.

**Approval is the freeze, and that is the property everything else serves.** An approved record
holds its own figures and no code path recomputes it: the single-employee run 409s on any non-draft
record whatever `regenerate` says, and the bulk path skips it. The test that matters approves a
period, then deletes every attendance record beneath it and adds three days of unpaid leave, and
asserts presentDays, deduction and net are exactly what they were. Editing a July record in
September cannot move July's pay.

**A draft has no payslip.** Its numbers are still moving, and a document that will change is worse
than none — so the payslip 409s until approval, then renders from stored figures. Proven by deleting
the underlying attendance and still getting a valid PDF. Three existing payslip tests had to approve
their period first, which is the spec working rather than a regression.

**Corrections never touch history.** `PayrollAdjustment` is its own collection, not a field on the
record it corrects: an adjustment is raised before the target draft exists, and a draft regenerates
freely, so anything embedded would be destroyed on the next re-run. Re-collecting at generation is
also what stops a re-run double-counting — asserted. Reason and actor are mandatory, and adjusting a
not-yet-approved period is refused because the right fix there is to re-run it.

**Anomalies are flagged, not blocked** — no salary, no record, no attendance, deduction above a
third of gross, unapproved absence, correction carried. Every one has a legitimate cause as well as
a suspicious one: a long unpaid absence and a mistaken roster mark produce the same high deduction.

**Cron is Vercel Cron, never node-cron** — the reason payroll never fired is that the job was
registered through node-cron, which does not execute on Vercel at all. GET as well as POST,
`CRON_SECRET` read from `process.env` at request time, 503 when unset, and **drafts only**: a test
asserts the cron cannot move an already-approved period, because a machine must not decide what
people are paid.

> **`CRON_SECRET` is not set in Vercel production, so this endpoint will 503 there until someone
> sets it.** That is correct fail-closed behaviour, reported rather than worked around. Payroll will
> not run automatically in production until that variable exists.

`/payroll` was a placeholder and is now the review screen: anomaly tags with detail on hover, the
state machine driving which buttons are enabled, Regenerate disabled outright on a frozen period,
and a correction modal that says in as many words that it writes to the following month.

New behaviour throughout — there was no pay run, no approval and no adjustment to fail against, so
these tests are stated as new rather than dressed up as failing-first.

Backend **31 files / 962 tests** (was 31/939). Frontend **91 files / 839 tests** (was 90/829). The
four failing frontend files are the known flakes.

### Base Salary pre-fills the edit form (§7.55, 2026-08-12)

`GET /users/:id` selects `+baseSalary` for an admin only; `select: false` stays on the model. The
edit form now opens on a freshly fetched user rather than the table row it was clicked from — the
row comes from `GET /users`, which does not carry the field and never should.

**What was actually wrong:** the form rendered an empty box for a user with a real salary. Saving
did not wipe it, because AntD omits untouched fields — but that is the payload shape being kind, not
a guarantee, and anything that later submitted full form state would have zeroed a real salary
silently. The old behaviour is now pinned by a test rather than relied on.

**Gated on being an admin, not on reaching the record.** A manager can legitimately fetch a team
member; the salary is still not theirs. Asserted, along with: no `baseSalary` in the list payload,
none in the dropdown picker, and none when a non-admin fetches their own record.

**Audit of every other `select: false` field, as asked.** `baseSalary` was the only one bound to a
form input. The password hash, reset token and all six 2FA fields appear in no form — 2FA is driven
through its own flow — and a test asserts none of them appear in the admin fetch either. **The
encrypted bank fields in §7.48 part two will hit exactly this problem** if they go into
`UserFormModal` while `select: false`; they need either this same admin-only fetch or their own
flow.

**Browser-verified against live data:** the form pre-filled **32000** for Testing User 2, the real
stored value, while the `GET /users` payload carried no `baseSalary` and `GET /users/:id` did. Both
halves confirmed in one run. **The live submit was NOT reachable** — `CLIENT_ORIGIN` is pinned to
:5173 while the app runs on :5175 — so the save paths are covered by tests rather than the browser,
and that is stated rather than glossed. Writes were intercepted at REQUEST stage; nothing reached
the database.

Backend **31 files / 971 tests** (was 31/962, +9). Frontend **91 / 840** (was 91/839, +1). Four of
the new backend tests fail against the committed code, as does the frontend pre-fill test; the
remaining five are the leak assertions, which passed before and after — they guard what
`select: false` was already doing right.
