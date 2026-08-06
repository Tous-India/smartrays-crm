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
built — Phase 9's frontend half is down to just PWA service worker wiring, and the rest of the
frontend module-by-module build-out remains (Payroll/Transport/Tickets/AMC/Permissions still
render placeholder pages).
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
via `dashboardConfig.js`, not a separate task), the PWA service worker wiring (Phase 9's last
remaining piece), or real invoicing (still deferred — `Invoice` remains a placeholder,
Phase 7 only added partial reconciliation on top of it) — whichever is prioritized next.

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
| 9 | Push notifications end-to-end (backend) + Dashboard (frontend) | ✅ **Backend half built and verified 2026-07-16 — see `.context/final-plan.md` §7.16.** `notification` module: 17 tests (`notification.test.js`) — `Notification`/`PushSubscription` models exactly per §6.7, self-scoped subscribe (upsert-by-`endpoint`)/unsubscribe/list/mark-read/mark-all-read, no `PERMISSION_REGISTRY` entry needed (every action is inherently self-scoped, same reasoning as `users.*`/`attendance.*`'s always-reachable own-data endpoints). `src/services/webPush.service.js` wraps `web-push`, configured from new **required** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars (optional `VAPID_SUBJECT`) — real keypair generated via `web-push`'s own `generateVAPIDKeys()`, no safe placeholder exists for a crypto keypair. `createNotification` creates the DB record and attempts a push to every active subscription independently; a push failure is logged and swallowed per-subscription, never blocking the notification record; a 404/410 response deactivates that subscription. Wired into **Leads** (assignment on create/reassign, skipped when self-assigning — exactly the spec's own requirement) and, **a deliberate small addition beyond the Leads-only spec**, **Ticket assignment** (stated explicitly as scope added on top of what was asked, not silent). New `src/cron/leadFollowUpReminderCron.js` (9 tests) runs every 5 minutes — far finer-grained than the monthly payroll cron, since "24h before"/"15min before" are precise moments, not a once-a-day batch; checks a "due within window, not yet reminded" condition (robust to cron downtime) rather than an exact-time match; `won`/`lost` leads excluded; already-passed follow-ups never remind (the existing `followUp=overdue` filter covers that). New `Lead.followUpReminder24hSentAt`/`followUpReminder15mSentAt` (`Date`, nullable) — necessary idempotency-guard schema addition, same treatment as Attendance's `lastHeartbeatAt`; both reset to `null` when `followUpDate` changes so a reschedule re-arms both reminders. No application bugs found. **Dashboard (permission-driven widget composition) is now built — see the Frontend 4 and Frontend 5 rows above.** Remaining, frontend-only: PWA service worker wiring so a browser can actually receive/display a push. |

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
