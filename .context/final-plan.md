# Smartrays Solutions CMS — Full Project Plan

> Source material: `.context/smartrays.md` (raw requirement notes + fixed tech stack/coding
> standards) and `.context/leads-customer-functional-spec.md` (a functional spec pulled from a
> *different* existing product, used here only as a data-model/UX reference for the Leads &
> Customer modules, re-expressed for our MERN stack). Both source files are informal notes, not
> a spec — this document turns them into one buildable plan: full data models, API surface,
> permission matrix, screens, architecture, and a phased roadmap. Every place where the source
> notes were silent or contradictory is marked as an **Assumption** or **Open Question** rather
> than silently resolved.

---

## 1. Executive Summary

Smartrays Solutions CMS is an internal **CRM + Operations platform** for a services agency,
covering the full client lifecycle (Lead → Customer → Project → Contract → Invoice/Payment →
AMC → Support Ticket) and the full workforce lifecycle (Employee → Attendance/Location →
Leave → Payroll → Task execution → Transport logging), unified under one role/permission
model and one MongoDB database. It also exposes a narrow **Customer Portal** for clients to
raise and track their own support tickets.

**Primary users:** Admin, Manager/Project Manager, Sales Associate, Employee (covers the
"Executive" job title too — one role, resolved §11.1), external Customer (portal-only).

---

## 2. Goals & Non-Goals

**Goals**
- Replace ad-hoc lead/customer tracking with a single pipeline (board + table views).
- Give every role a dashboard scoped to exactly what their permissions allow.
- Automate the Lead → Customer → Project → Invoice chain so sales doesn't hand-create projects.
- Track workforce attendance with verifiable location + photo proof, feeding payroll automatically.
- Give clients self-service ticket visibility without exposing internal data.

**Non-Goals (for v1, unless requirements change)**
- Payment gateway integration / automated disbursement (see Open Question §11.5) — payroll and
  payments are recorded, not necessarily paid out through the system.
- Multi-tenant / multi-company support — this is a single-organization internal tool.
- Native mobile apps — attendance/location/photo capture is a responsive web (PWA) feature, not
  a separate iOS/Android codebase, unless stated otherwise.

---

## System Design (HLD & LLD)

*Positioned here intentionally, ahead of §3 onward — this is the entry point for understanding
the whole system before writing code. Left unnumbered so the existing §1–§11 numbering, and
every cross-reference to it (§5, §6.5, §7.1, §7.4b, §11.9, etc.) throughout this document,
stays exactly as it is; nothing below is a substitute for the full detail in §1–§11, it's a map
of it. Reflects actual current state as of 2026-07-13, cross-checked against
`docs/project-status.md` — built vs. planned is called out explicitly throughout, not just
original intent.*

### HIGH-LEVEL DESIGN (HLD)

#### System Overview

```
┌─────────────────────────────┐        ┌───────────────────────────────┐
│         Frontend            │        │            Backend           │
│  React + Vite (SPA)         │  HTTPS │  Express REST API             │
│  Not started — no code yet  │◄──────►│  authenticate → fresh DB read │
│  (see §8 for the planned    │        │  → req.user (§4.1) → can()/   │
│  route map)                 │        │  authorize(Any) → controller  │
└─────────────────────────────┘        │  → service → model            │
                                        │  - node-cron — monthly payroll│
                                        │    run (§7.7, 2026-07-13) AND │
                                        │    the 5-min lead follow-up   │
                                        │    reminder cron (§7.16,      │
                                        │    2026-07-16) — both wired   │
                                        │  - web-push sender — wired    │
                                        │    (§7.16, 2026-07-16)        │
                                        │  - report generator — wired   │
                                        │    (§7.11, Phase 8)           │
                                        └───────────────┬───────────────┘
                                                         │
                                        ┌────────────────▼───────────────┐
                                        │           MongoDB              │
                                        │  users, leads, locationPings,  │
                                        │  rolePermissionTemplates,      │
                                        │  attendance (model only) —     │
                                        │  built; customers, contracts,  │
                                        │  projects, tasks, leave,       │
                                        │  payroll, tickets, payments,   │
                                        │  amc, … — planned (§6)         │
                                        └─────────────────────────────────┘
                                                         │
                                        ┌────────────────▼───────────────┐
                                        │   External services            │
                                        │  - Cloudinary — wired and in   │
                                        │    use (Attendance photos,     │
                                        │    §7.4, 2026-07-13)           │
                                        │  - Google Maps Distance Matrix │
                                        │    — wired and in use          │
                                        │    (Transport, §7.6, 2026-07-13)│
                                        │  - Web Push (VAPID) — wired    │
                                        │    and in use (§7.16,          │
                                        │    2026-07-16)                 │
                                        └─────────────────────────────────┘
```

Refined from the diagram in §4 to show the actual request path (`authenticate` → DB read →
`req.user` → permission check) rather than a generic label, since that path *is* §4.1's Single
Source of Truth rule made concrete, and to mark what's real vs. planned in the data layer.

#### Modules at a Glance

| Module | Status | Responsibility (one line) |
|---|---|---|
| `auth` | ✅ Built (§7.0) | Identity, sessions, account creation |
| `user` | ✅ Built (§7.0b, 2026-07-13) | User roster CRUD, "own team" scoping, dropdown picker — the model itself remains the shared foundation every other module reads via `req.user` |
| `lead` | ✅ Built (§7.1) | Sales pipeline: board/table, call logging, conversion entry point — conversion is now a real implementation (§7.2, 2026-07-13), not a 501 stub |
| `location` | ✅ Built (§7.4b) | Live GPS tracking during an open shift — live view + day-trail history |
| `permission` | ✅ Built (§7.12) | Role permission templates + per-user overrides — the authorization data source itself |
| `attendance` | ✅ **Fully built** (§7.4, 2026-07-13) | Check-in/check-out with photo capture (Cloudinary) + connectivity-gap-adjusted `workingHours` + own/team/org history and PDF/Excel reports |
| `customer` | ✅ Built (§7.2, Phase 2, 2026-07-13) | Client account: billing, contracts, contacts, credentials vault, activity log, contract→Project automation. `Invoice` remains a minimal placeholder model — Phase 7's Payments module (§7.9) adds partial balance/status reconciliation onto it, not full invoicing |
| `project` | ✅ Built (§7.3, Phase 2, 2026-07-13) | Delivery unit linked to a customer/contract; owns tasks + team assignment. No direct creation endpoint — always born from a Contract |
| `leave` | ✅ Built (§7.5, Phase 3, 2026-07-13) | Leave requests/approval, one-paid-leave-per-month quota (§11.7), the 2x unapproved-absence rule |
| `payroll` | ✅ Built (§7.7, Phase 4, 2026-07-13) | Monthly gross/net computation from Attendance + Leave + approved TravelLog data, mileage reimbursement, PDF payslips, monthly `node-cron` job |
| `ticket` | ✅ Built (§7.8, Phase 5) | Internal + Customer Portal support ticket lifecycle — raise/list/assign/status/comments/attachments. Customer Portal self-signup (§7.0) is a companion piece, built the same task |
| `payment` | ✅ Built (§7.9, Phase 7) | Admin-only manual payment log, with optional partial reconciliation against an existing `Invoice` (§11.3, resolved) |
| `amc` | ✅ Built (§7.10, Phase 7) | Annual maintenance contract tracking per customer, "own team"/"own" scoped via the underlying Customer's ownership |
| `report` | ✅ Built (§7.11, Phase 8) | Unified `POST /reports/generate` dispatcher (attendance/leave/payroll/transport/leads/customers) — uploads to Cloudinary, returns a download URL. `GET /attendance/report`/`GET /travel-logs/report` now internally reuse it (breaking response-shape change) |
| `notification` | ✅ **Built (§6.7/§7.11-Platform, Phase 9, 2026-07-16)** | `Notification`/`PushSubscription` models, Web Push (VAPID) delivery via `web-push`, self-scoped subscribe/list/mark-read endpoints. Wired into Leads (assignment + a 24h/15m follow-up-reminder cron) and Ticket assignment (a deliberate small addition beyond the Leads-only spec) — see §7.16 |
| `transport` | ✅ Built (§7.6, Phase 6, 2026-07-13) | Distance-per-shift (auto from Attendance checkout, or manual entry) via Google Maps, separate from `location`'s raw GPS stream. Approval workflow (`pending`/`approved`/`rejected`) added 2026-07-13; only `approved` entries feed Payroll mileage reimbursement (§11.4, resolved) |
| Dashboards | ⬜ Planned (§7.13, Phase 9) | Frontend widget shell composed by role + permissions — no dedicated backend module |
| `frontend` (scaffold) | ✅ **Built (Frontend Phase 0, 2026-07-16)** | Vite + Tailwind + Ant Design scaffold, API client, session store, route guards, dashboard/portal layout shells, full §8 route map wired (every route exists; only `/login` and `/` are functionally complete, the rest are placeholders) — see the Frontend Phase 0 LLD entry below and `frontend/README.md` |
| `lead` (frontend) | ✅ **Built (2026-07-16) — the reference implementation for every later frontend module** | Table View + Board View (`@dnd-kit` kanban) behind one shared page shell, Lead Detail slide-over (real route), Import wizard, filtered export — see §7.15 |
| `customer` (frontend) | ✅ **Built** | List View (search/owner/status filters, bulk activate/deactivate/delete) + Add Customer wizard (surfaces the backend's contract automation explicitly) + a real Customer Detail full page (billing/contacts/contracts/credentials vault/activity log) — see §7.17 |
| `attendance` (frontend) | ✅ **Built** | Check-in/out widget (native `getUserMedia`+`<canvas>` camera capture, native `Geolocation`, both mandatory before submit) + Personal/Team timeline views with connectivity gaps rendered as red bar segments + report download via the unified dispatcher — see §7.18 |
| `leave` (frontend) | ✅ **Built** | Request modal + scope-tabbed list (own/team/all, built from whichever grants the user holds) + admin-only Approve/Mark Unapproved Absence, the latter's 2x-deduction consequence shown directly in the confirm prompt — see §7.18 |
| `location` (frontend) | ✅ **Built — a new route, `/location`, with no prior frontend at all** | Live map (auto-polling `GET /location/live`) + History map (employee+date picker, `GET /location/history` as a polyline) via a generic `GoogleMapView` (native Maps JS SDK, no wrapper library) — see §7.18 |

#### Major Cross-Module Flows

1. **Lead → Customer → Delivery** (§7.1/§7.2/§6.3/§6.4 — Leads built, Customers/Projects planned):
   `Lead (status→won)` → `Convert to Customer` (pre-filled, admin-editable) → `Customer` created,
   `Lead` archived → adding a `monthly`/`onetime` `Contract` auto-creates a `Project` +
   invoice/recurring-profile → deactivating the `Customer` completes active `Project`s and
   pauses recurring profiles.
2. **Shift-gated Location Tracking** (§7.4/§7.4b — Location built, Attendance placeholder-only):
   `Check-in` → open `Attendance` record exists (`checkIn` set, `checkOut` unset) → client pings
   every `LOCATION_PING_INTERVAL_MINUTES` (default 2) → `LocationPing`s accepted and tied to
   that `Attendance._id` → `Check-out` closes the record → further pings rejected (409) until
   the next check-in.
3. **Permission lifecycle** (§7.12 — built): `User` created → `permissions` seeded from that
   role's *current* `RolePermissionTemplate` → admin edits one user's permissions via
   `PATCH /users/:id/permissions` (independent of the template from then on) → admin edits the
   *template* itself (does **not** touch any existing user, §4.1/§7.12) → `POST
   /users/:id/permissions/reset` re-syncs one user back to the template's *current* values,
   discarding whatever they'd customized.
4. **Support ticket lifecycle** (§7.8 — planned): raised (internal by Admin/Manager, or by a
   customer via the portal) → assigned to an employee → status transitions
   (`open→in_progress→resolved→closed`) with comments/attachments → customer portal only ever
   shows the raising customer's own tickets; internal visibility into portal-raised tickets is
   Admin/PM only.

#### Tech Stack Summary

See §3 for the full table + env vars. In short: Node/Express (ES Modules) + MongoDB/Mongoose on
the backend, React/Vite (no TypeScript) + Tailwind/Ant Design on the frontend (not started),
JWT-in-httpOnly-cookie auth, `vitest`/`supertest`/`mongodb-memory-server` for backend testing.

#### Cross-Cutting Architectural Principles

Full statements live where cited — this is a summary index, not a restatement:

- **Single source of truth for auth/authorization** — the database, never the JWT or client,
  decides identity and permissions, every request. See §4.1.
- **Every service-layer query scopes by ownership/team, no exceptions** — MongoDB has no RLS
  equivalent, so this is done by hand in every service that lists/fetches records. See §4.
- **Permission registry / template / per-user override model** — `PERMISSION_REGISTRY`
  (structural, code-only) validates `RolePermissionTemplate` (DB, admin-editable defaults) and
  `User.permissions` (DB, per-user actual grants). See §7.12.
- **No `Team` collection** — "own team" is always computed from `User.managerId`
  (self-reference, direct reports only, one level). See §11.9.

#### External Integrations at a Glance

| Service | Used for | Status |
|---|---|---|
| Cloudinary | File storage — attendance photos, ticket attachments, generated PDF/Excel reports | ✅ Wired and in use — `src/services/cloudinary.service.js`, Attendance check-in/check-out photos (§7.4, 2026-07-13) and Ticket attachments (§7.8, `uploadTicketAttachment`, `resource_type: "auto"` since attachments aren't guaranteed to be images). Generated-report storage still pending §7.11 |
| Google Maps Distance Matrix | Computing per-shift travel distance for the Transport/Travel module | ✅ Wired and in use (§7.6, 2026-07-13) — `src/services/googleMaps.service.js`, no SDK dependency (calls the REST API via `fetch`) |
| Web Push (VAPID) | Push notifications — lead assignment, follow-up reminders, ticket assignment | ✅ Wired and in use (§6.7/§7.16, Phase 9, 2026-07-16) — `src/services/webPush.service.js`, no SDK beyond the `web-push` npm package itself. Browser-side receipt (PWA service worker) is a frontend follow-up |

---

### LOW-LEVEL DESIGN (LLD)

Same subsections per module: **Data model** · **API surface** · **Permission requirements** ·
**Key business rules/invariants** · **Known deviations** · (built modules only) **Test coverage**.
Full field tables and endpoint lists live at the linked §6.x/§7.x — reproduced here only where
genuinely compact enough to be useful at a glance.

#### Built Modules

##### Auth (§7.0)
- **Data model:** no dedicated collection — reads/writes `User` (§6.1) directly.
- **API surface:** `POST /auth/register` (admin-only), `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`.
- **Permission requirements:** `/register` gated by `requireAdmin` (plain role check, not
  `can()` — account creation isn't a module/action pair, §5). Everything else just
  `authenticate`.
- **Key invariants:** JWT payload is `{ userId }` only (§4.1); `passwordHash` stripped from
  every response via a schema-level `toJSON` transform, not per-controller; cookie `maxAge`
  always derived from `JWT_EXPIRES_IN`, never hardcoded separately (a prior mismatch here was
  the cookie-clearing bug, see Changelog).
- **Known deviations:** ✅ Resolved — the register-time `permissions` override field existed
  temporarily before the Permissions module was built; removed once §7.12 shipped. ✅ Resolved
  2026-07-13 — account-creation logic itself moved out of this module entirely, into
  `user.service.js#createUser` (§7.0b); `auth.controller.js` now calls it directly.
- **Test coverage:** 13 tests (corrected 2026-07-13 — previously misdocumented as 11, an
  uncaught miscount, not a code change), including a regression test locking in the
  cookie-clearing fix.

##### User Management (§7.0b)
- **Data model:** no dedicated collection — reads/writes `User` (§6.1) directly, same as `auth`.
- **API surface:** `/users/dropdown`, `/users` (list), `/users/:id` (get/update),
  `/users/:id/deactivate`, `/users/:id/reactivate`, `/users/:id/manager` — full list at §7.0b.
- **Permission requirements:** `users.view_team`/`view_all` for list/get-others; account-
  lifecycle actions (`deactivate`/`reactivate`/`manager`) are `requireAdmin`, matching how
  account creation itself is gated in `auth` (§7.0).
- **Key invariants:** self-access to your own record is always allowed regardless of any grant,
  and a no-grant caller still gets a self-only `200` from the list endpoint rather than a `403`
  (deliberately different from a no-grant lookup of *someone else's* specific id, which stays
  `403`); `role`/`managerId`/`isActive`/`baseSalary` (the last added 2026-07-13 for Payroll,
  §6.1/§7.7) are admin-only to change, even on your own record, enforced at **both** the
  validation layer and the service layer (deliberate defense in depth); `managerId` must always
  resolve to a `manager`- or `admin`-role user, enforced by one shared helper reused across
  create/update/reassign.
- **Known deviations:** none from the ask — `POST /auth/register` remains the sole HTTP entry
  point for account creation; no `POST /users` was added (see §7.0b for why).
- **Test coverage:** 33 tests (31 from the original build + 2 added 2026-07-13 for `baseSalary`,
  §7.7). Found and fixed one real bug during the build: a plain object
  spread in `getUserById` let the scope filter's `_id` key silently clobber the explicit
  `_id: targetId` constraint, so a manager could fetch an unaffiliated user's record instead of
  getting the expected 404 — fixed with `$and` instead of a spread. Caught by a test.

##### Leads (§7.1)
- **Data model:** `Lead`, `LeadCall`, `LeadSource` — §6.2.
- **API surface:** full CRUD + `/export` + `/import` + `/:id/status` + `/:id/hot` +
  `/:id/calls` + `/:id/convert` (**real implementation as of 2026-07-13**, see §7.2) +
  `/lead-sources` — full list at §7.1.
- **Permission requirements:** `leads.view`/`create`/`edit`/`delete`, checked via `authorize()`.
- **Key invariants:** `lostReason` required when `status→lost`; `sales_associate`'s `ownerId`
  is server-forced to themselves on create and excluded from their own edit payload (reassignment
  is a manager/admin-only action); out-of-scope access is **404, not 403** (existence isn't
  leaked); `followUp=this_week` is a rolling 7-day window, not the calendar week.
- **Known deviations:** CSV/Excel export streams directly instead of going through the (not yet
  built) shared reports/Cloudinary pipeline; import has no interactive column-mapping UI (not
  built yet), just alias-matched headers. `/:id/convert`'s 501 stub was resolved 2026-07-13 once
  the `customer` module existed (§7.2) — `lead.service.js` calls
  `customer.service.js#createCustomer` directly.
- **Test coverage:** 34 tests (33 before the 2026-07-13 conversion work — one 501-stub test
  replaced with two real ones: rejects with no `projectManagerId`, then creates a real `Customer`
  and sets `convertedCustomerId`), covering CRUD/validation/filters and — most heavily —
  permission scoping (admin/manager/sales_associate/no-permission, ownerId-escalation
  prevention).

##### Live Location Tracking (§7.4b)
- **Data model:** `LocationPing` — §6.5 (TTL-indexed, 45-day auto-purge). Depends on the
  `Attendance` model (§7.4) to determine "open shift" — originally just the placeholder schema;
  as of 2026-07-13 that model is also driven by real `attendance` module endpoints (see below),
  though `location`'s own code never changed to accommodate this since it already queried by the
  same `checkIn.time`/`checkOut.time` shape.
- **API surface:** `POST /location/pings`, `GET /location/live`, `GET /location/history`,
  `GET /location/config` — full list at §7.4b.
- **Permission requirements:** `location.view`/`view_team`/`view_all` via `authorizeAny()` (the
  first module with more than one viewing tier) for the two GET-heavy endpoints; `POST /pings`
  is `authenticate`-only, deliberately with no module-permission gate (§7.4b explains why).
- **Key invariants:** a ping is only accepted with an open `Attendance` record, else 409;
  `employeeId` always comes from the session, never the request body; a visible-employee set is
  a *union* of every permission tier held, not just the widest one.
- **Known deviations:** none from the plan as designed — built exactly as specified in §7.4b.
- **Test coverage:** 19 original tests, plus 1 added 2026-07-13 once the `attendance` module
  existed: an end-to-end test proving a real `POST /attendance/check-in` unblocks a real
  `POST /location/pings`, and a real `POST /attendance/check-out` blocks the next one — no direct
  Mongoose writes anywhere in that specific test, unlike the rest of this suite's fixtures (see
  the Attendance entry below). Updated again the same day once photo capture became mandatory
  (§7.4): `location.test.js` now mocks `src/services/cloudinary.service.js` and supplies a
  `photo` on both calls in that one test, since a real check-in/check-out would otherwise 400.
  Found and fixed one real bug in `User` (unrelated to this module itself): Mongoose's
  `minimize: true` was silently stripping an explicit empty `permissions` override from API
  responses — fixed with `minimize: false` on the `User` schema.

##### Permissions (§7.12)
- **Data model:** `RolePermissionTemplate` — §6.1. `PERMISSION_REGISTRY` is a hardcoded
  constant, not a collection.
- **API surface:** `/permissions/registry`, `/permissions/templates(/:role)`,
  `/users/:id/permissions(/reset)` — full list at §7.12.
- **Permission requirements:** every endpoint gated by `permissions.manage`.
- **Key invariants:** editing a template is **never retroactive**; a per-user override is fully
  independent of the template after creation; `PATCH` is a full replace, not a deep merge, on
  both templates and per-user overrides; template seed values are generated from §5's matrix
  (a deliberate broadening for Manager/Sales Associate's Leads defaults, not a silent one).
- **Known deviations:** this module's own existence *is* the resolution of a deviation —
  it replaces both the hardcoded `getDefaultPermissionsForRole()` function and the register-time
  `permissions` field workaround (§7.0).
- **Test coverage:** 20 tests, including the specific "edit template after customizing a user,
  then reset, confirm the *new* template values win" sequence.

##### Attendance (§7.4, fully built 2026-07-13)
- **Data model:** `Attendance` — §6.5, now fully populated (started as a minimal placeholder
  reused from `location`, §7.4b). One field added beyond §6.5's list: `lastHeartbeatAt`
  (internal-only bookkeeping for connectivity-gap detection).
- **API surface:** `POST /attendance/check-in`, `POST /attendance/check-out`,
  `POST /attendance/heartbeat` (new — not in the original spec, added to make connectivity-gap
  detection possible), `GET /attendance/me?month=`, `GET /attendance/team?month=`,
  `GET /attendance/report?from=&to=&format=pdf|xlsx` — full list at §7.4.
- **Permission requirements:** none on check-in/check-out/heartbeat — self-service actions, same
  reasoning as `location`'s `POST /pings`. `attendance.view_team`/`view_all` (new registry
  entries) gate `/team` and `/report` — no plain `view` tier, since own attendance is always
  reachable via `GET /attendance/me` with no gate at all.
- **Key invariants:** one open check-in per employee at a time (409 on a second check-in, 409 on
  a check-out/heartbeat with nothing open) — reuses `location.service.js#findOpenAttendance`'s
  exact query shape; a connectivity gap is only ever detectable retroactively, at whichever
  arrives first between the next heartbeat or checkout, and is recorded when the silence since
  the last proof-of-life exceeds `ATTENDANCE_GAP_THRESHOLD_MINUTES` (new, optional, default 10);
  `workingHours` = gross shift duration minus total gap duration, clamped to 0.
- **Known deviations:** none from the ask — the heartbeat endpoint itself is new, not in §7.4's
  original endpoint list, added because connectivity-gap detection needs *some* distinct "still
  alive" signal and the task explicitly asked for this mechanism to be designed.
  `GET /attendance/report`'s PDF/Excel generation was deliberately built through a new shared
  `src/services/report.service.js` (generic `generateExcelReport`/`generatePdfReport`
  primitives) rather than inline in the controller — groundwork for §7.11 without building that
  pipeline now; Leads' existing export was NOT migrated onto it. **Revised 2026-07-13, later the
  same day:** photo was initially left optional server-side; a follow-up review determined that
  didn't actually enforce the presence-proof the photo exists for, so
  `validatePhotoPresence` was added to reject (400) a check-in/check-out with no photo at all.
- **Test coverage:** 32 tests in `attendance.test.js` (one more added for the photo-required
  fix — check-in and check-out each get their own explicit rejection test), no application bugs
  found. Cloudinary is mocked at the module boundary (`vi.mock`) — no test makes a real network
  call, keeping the suite fully self-contained. `location.test.js`'s end-to-end test was updated
  to supply a photo and mock Cloudinary too, since it now needs one to still pass. Report tests
  assert actual file structure (the `.xlsx`'s "PK" zip signature, re-read with `exceljs` to
  confirm team-only scoping; the PDF's `%PDF-` magic-number header), not just response headers.

##### Customers (§7.2, Phase 2, built 2026-07-13)
- **Data model:** `Customer`, `Contact`, `Contract`, `Credential` — §6.3, all built as designed.
  `Invoice` is a **minimal placeholder** (customerId, contractId, number, type, amount, balance,
  status, issuedAt) — the same treatment `Attendance` got for Location Tracking (§7.4b): just
  enough schema for the contract automation below to have somewhere real to write a draft record.
  No `invoice.service/controller/routes` exist — full invoicing (numbering, ledger, payment
  tracking) is Phase 7.
- **API surface:** full CRUD + bulk activate/deactivate/delete + nested contacts/contracts/
  credentials/activity — full list at §7.2. **`GET /customers/:id/invoices` and
  `GET /customers/:id/ledger` were deliberately NOT built** — both depend on real invoicing.
- **Permission requirements:** `customers.view`/`create`/`edit`/`delete`; `credentials.view`
  gated on top of `customers.view` (or `.edit` for mutations) — chained `authorize()` calls as an
  AND gate, no new middleware needed.
- **Key invariants:** `projectManagerId` required at creation (400 if missing, no role
  restriction on it, unlike `User.managerId`); ownership scoping identical to Leads
  (admin/manager-team/sales_associate-own, 404 not 403 out-of-scope); contract automation —
  `monthly`→recurring Project+draft Invoice, `onetime`→onetime Project+draft Invoice, `yearly`→no
  automation (neither source document describes one); deleting a contract completes its linked
  Project and cancels its linked Invoice; setting `customerStatus` to `inactive` completes every
  active Project for that customer, only on the active→inactive transition.
- **Known deviations:** the "pauses recurring profile" language in the reference spec has no
  literal analog — there's no separate RecurringProfile model in this build, so it maps onto
  completing the Project + cancelling the Invoice instead. `GET /invoices`/`/ledger` deferred to
  Phase 7 as noted above.
- **Test coverage:** 21 tests, no application bugs found.

##### Projects & Tasks (§7.3, Phase 2, built 2026-07-13)
- **Data model:** `Project`, `Task` — §6.4, built as designed.
- **API surface:** `GET /projects`, `GET /projects/:id`, `POST /projects/:id/team`,
  `GET /projects/:id/tasks`, `POST /tasks`, `PATCH /tasks/:id/start`, `PATCH /tasks/:id/stop` —
  full list at §7.3. **No `POST /projects`** — a project is only ever created via the customer
  module's contract automation above, never directly.
- **Permission requirements:** `projects.view`/`assign_team`; `tasks.view`/`assign` — real,
  admin-editable grants (manager/admin get both by default), not hardcoded role checks, per §4.1.
  Starting/stopping a task is an ownership check (assignee or admin), not a permission tier —
  there is deliberately no `tasks.update_own` registry entry.
- **Key invariants:** **one `in_progress` task per employee at a time**, enforced server-side
  (not just a disabled button) to survive multi-tab/multi-device races — checked fresh against
  the database on every start, not client state. "Team members addable by Manager/Admin only"
  (§7.3) is interpreted narrowly: holding `projects.assign_team` is necessary but not sufficient —
  the caller must also be *this specific project's* `projectManagerId`, or admin. A project has no
  `managerId`-based "own team" scoping the way Leads/Customers do — visibility is admin-sees-all,
  else PM-or-team-member-only.
- **Known deviations:** none from the ask.
- **Test coverage:** 19 tests, no application bugs found.

##### Leave (§7.5, Phase 3, built 2026-07-13)
- **Data model:** `Leave` — §6.5, built as designed plus one added field: `status`
  (`pending`/`approved`/`rejected`), needed to support the request→approve workflow the
  endpoints imply.
- **API surface:** `POST /leave/request`, `GET /leave?scope=own|team|all`,
  `PATCH /leave/:id/approve`, `PATCH /leave/:id/mark-unapproved-absence` — full list at §7.5.
- **Permission requirements:** `leave.view`/`view_team`/`view_all` — mirrors `location`'s
  three-tier shape exactly, but checked per explicitly-requested `?scope=` rather than resolved
  as an implicit union of every held grant (§7.5's endpoint design gives the caller the choice,
  `location`'s doesn't). Requesting your own leave needs no grant — self-service, same reasoning
  as Attendance check-in/out. `/approve` and `/mark-unapproved-absence` are `requireAdmin`, not a
  permission tier — binary admin-only actions, matching how `location`/`user` gate their own
  binary admin actions.
- **Key invariants:** one paid leave per calendar month, no carry-over (§11.7) — a single `paid`
  request over 1 day is rejected outright, and approving one is rejected if it would push the
  employee's other *approved* paid-leave days for that month over 1; only an admin may request
  leave on behalf of someone else (needed so `mark-unapproved-absence` has a record to act on for
  an employee who never self-requested); `mark-unapproved-absence` is an unconditional admin
  decree (works regardless of current status) that always sets `isDoubleDeduction: true`.
- **Known deviations:** "date(s)" (§6.5) built as an inclusive `startDate`/`endDate` range, the
  simplest reading that still covers a multi-day request.
- **Test coverage:** 18 tests, no application bugs found. **Confirmed 2026-07-13 (follow-up
  review):** one test explicitly proves the quota is enforced at approval time, not request
  time — two paid requests for the same employee in the same month both submit successfully
  (201), the first approval succeeds, and only the second is rejected (409, with a message
  naming the quota). This was already the implemented behavior, not a fix.

##### Transport/Travel (§7.6, Phase 6, built 2026-07-13)
- **Data model:** `TravelLog` — §6.5, built as designed. Distinct from `LocationPing` (raw GPS
  stream) — see §6.5's note on the two collections' different purposes.
- **API surface:** `POST /travel-logs`, `GET /travel-logs?scope=own|team|all&employeeId=&month=`,
  `GET /travel-logs/report?format=pdf|xlsx` — full list at §7.6. Module folder is
  `src/modules/transport/` (single-word convention, matching every other module folder); files
  inside are named `travelLog.*` (matching the model name).
- **Permission requirements:** `travelLogs.view`/`view_team`/`view_all` — mirrors `leave`'s
  three-tier, explicit-`?scope=` shape for the list endpoint; mirrors `attendance`'s
  `view_team`/`view_all`-only report gate for `GET /travel-logs/report`. Logging your own travel
  needs no grant — self-service, same reasoning as Attendance check-in/out.
- **Key invariants:** distance computed via Google Maps Distance Matrix (new
  `src/services/googleMaps.service.js`, no new npm dependency — uses Node's built-in `fetch`)
  when coords come from Attendance check-in/out (auto-generated at checkout,
  `attendance.service.js` calling directly into `travelLog.service.js#generateAutoTravelLog`,
  which never throws) or from manual-entry coords; a caller-supplied `distanceKm` on manual entry
  is never overridden by a Google Maps lookup. A plain employee/sales_associate naming someone
  else's `employeeId` on manual entry is rejected outright (403) — deliberately stricter than
  Leads' silent `ownerId`-forcing, since misattributing someone else's travel silently would hide
  a real mistake rather than surface it; a manager may log for their own direct report, an admin
  for anyone.
- **Known deviations:** none from the original ask. Whether this feeds Payroll (§11.4) was
  deliberately left open at first-build time, then resolved 2026-07-13 as a Payroll prerequisite
  (§7.7 STEP 0b): a `status` (`pending`/`approved`/`rejected`) approval workflow was retrofitted
  onto `TravelLog`, and only `approved` entries feed Payroll's mileage reimbursement — see
  §6.5/§7.6.
- **Test coverage:** 28 tests, no application bugs found (21 from the original build + 7 new
  2026-07-13 for the approve/reject flow — verified via the actual test file, correcting an
  earlier miscount that said 6). Includes a dedicated side-by-side scope test — admin/manager/
  employee each queried in the same test, asserted against the exact expected employee-id set
  for `scope=all`/`team`/`own` respectively — plus the 7 approve/reject tests. `googleMaps.service.js` mocked at the module boundary
  in `travelLog.test.js`, `attendance.test.js`, and `location.test.js` (the latter two since a
  real Attendance checkout now transitively calls it too).

##### Payroll (§7.7, Phase 4, built 2026-07-13)
- **Data model:** `Payroll` — §6.5, plus one field beyond the documented shape:
  `mileageReimbursement` (Number, default 0), the same treatment as Attendance's
  `lastHeartbeatAt` — necessary once §11.4 resolved to "yes, TravelLog feeds Payroll."
- **API surface:** `POST /payroll/run?month=&year=&employeeId=&regenerate=`,
  `GET /payroll?scope=own|all&month=`, `GET /payroll/:id/payslip?format=pdf` — full list at
  §7.7. `?employeeId=` and `?regenerate=` are stated additions beyond the original literal
  endpoint list. Module folder is `src/modules/payroll/`; the monthly cron lives in a new
  `src/cron/payrollCron.js`.
- **Permission requirements:** `payroll.view`/`run` — admin only for `run` and `scope=all`;
  only `employee` defaults to `view` (own payslip only). **No `team` tier at all** —
  Manager gets no payroll grant whatsoever, a deliberate divergence from every other workforce
  module (salary data is more sensitive than attendance/leave/travel data). `sales_associate`
  gets **no** `payroll` grant either — §5 marks it "–", the same as Manager, not "own payslip
  only" like Employee. **Correction (2026-07-13):** an earlier version of this build misread
  that "–" as blank/unspecified and granted `sales_associate` the same `payroll.view: true`
  default as Employee; fixed in `permission.service.js`'s `INITIAL_TEMPLATE_DEFAULTS` to match
  §5's literal text.
- **Key invariants:** computed from Attendance + Leave + approved-only TravelLog data
  (§11.4, resolved), pro-rated by days in the month, paid on the 1st of the following month. Two
  prerequisites closed first in the same task: `User.baseSalary` (§6.1) and TravelLog's approval
  workflow (§6.5/§7.6).
- **Known deviations:** none from the ask. **§11.5 resolved 2026-07-13 as part of this build:
  record-keeping only for v1** — `paidOn` is a computed field recording when the salary is
  expected to be paid, not a trigger for any real money movement; no payment-gateway/
  disbursement integration was built. Revisit only if the client explicitly requests real
  disbursement integration later.
- **Test coverage:** 26 tests (20 in `payroll.test.js` — 17 original + 2 added for the
  Sales Associate permission correction above + 1 Phase 8 regression test confirming
  `GET /payroll/:id/payslip` was deliberately excluded from the §7.11 report-dispatcher
  migration — plus 6 in `src/cron/payrollCron.test.js`), no
  application bugs found. Full formula computation checked against hand-computed expected
  values; see §7.7 for the complete writeup.

##### Customer Portal Self-Signup (§7.0/§7.8, Phase 5, built)
- **Data model:** no dedicated collection — extends `User` (§6.1) with `customerId`.
- **API surface:** `POST /auth/customer/signup` — full write-up at §7.0.
- **Permission requirements:** new `customer` `RolePermissionTemplate`:
  `{ tickets: { create: true, view_own: true } }`.
- **Key invariants:** verified via an email-domain match against `Contact.email` (primary) or
  `Customer.email` (fallback) — not an admin grant; rejected (400) with no match.
- **Known deviations:** none from the ask. See §7.0 for the full resolved-decisions write-up.
- **Test coverage:** 6 tests in `auth.test.js` (19 total for the module) — see §7.0.

##### Support & Ticketing (§7.8, Phase 5, built)
- **Data model:** `Ticket` — §6.6, plus one field beyond the documented shape: `subject`
  (String, required) — see §6.6.
- **API surface:** raise/list/assign/status/comments/attachments — full list at §7.8, matching
  the original literal endpoint list exactly (no additions, no omissions — no dedicated
  `GET /tickets/:id` was added since every mutating endpoint already returns the full updated
  ticket).
- **Permission requirements:** new `tickets: ["create", "assign", "view_all", "view_assigned",
  "view_own"]` registry entry, matching §5's matrix exactly — `manager` gets create/assign/
  view_all (covers "PM"); `employee` gets view_assigned only; `customer` gets create/view_own;
  `sales_associate` gets nothing.
- **Key invariants:** customer portal only ever shows the raising customer's own company's
  tickets (`scope=own`, never another company's); `scope=all` (admin/manager) sees everything
  **including** portal-raised tickets, per smartrays.md's "internal visibility ... Admin/PM
  only". Status transitions are unrestricted (§6.6/§7.8 are silent on transition rules) — a
  stated assumption, not an invented state machine.
- **Known deviations:** **§11.2 (category vs. lifecycle status split) — ✅ resolved as part of
  this build**: the split itself is adopted; the exact category enum values remain open to
  client confirmation if the list needs to grow, but that's a narrower, separate question than
  the shape decision this Open Question was actually about. No separate "recategorize"
  endpoint exists yet (category is set once, at creation).
- **Test coverage:** 35 tests, no application bugs found; see §7.8 for the complete writeup.

##### Payments (§7.9, Phase 7, built)
- **Data model:** `Payment` — §6.6, plus one field beyond the documented shape: `invoiceId`
  (ObjectId → `Invoice`, nullable) — see §6.6/§7.9.
- **API surface:** list/create — full list at §7.9, matching the original literal endpoint
  list exactly (`invoiceId` added to the create body, per the resolved reconciliation design).
- **Permission requirements:** `payments.view`/`create` (admin only — §5's matrix marks every
  other role "–", so unlike every other feature module there's no ownership scoping at all).
- **Key invariants:** **§11.3 resolved — partial reconciliation, not a standalone log and not
  full invoicing.** A `Payment` linked to both a `customerId` and an `invoiceId` reduces that
  `Invoice`'s `balance` and updates its `status` (`"paid"` at 0, `"partially_paid"` otherwise,
  clamped rather than going negative on an overpayment); a manual-only or
  customerId-without-invoiceId payment is just logged, nothing to reconcile — expected, not a
  gap. Full invoicing (auto-numbering, recurring generation, ledger views) stays out of scope.
- **Known deviations:** none from the ask.
- **Test coverage:** 16 tests, no application bugs found; see §7.9 for the complete writeup.

##### AMC (§7.10, Phase 7, built)
- **Data model:** `AMC` — §6.6, exactly as documented, no additions.
- **API surface:** list/create (new-or-existing-customer flow)/update — full list at §7.10,
  matching the original literal endpoint list exactly.
- **Permission requirements:** `amc: ["view", "edit"]` — Manager gets "own team", Sales
  Associate gets "own", both resolved via the underlying `Customer.ownerId` (AMC has no
  `ownerId` of its own) through a new `customer.service.js#getVisibleCustomerIds` export;
  Employee/Customer get neither.
- **Key invariants:** the two-flow creation (`new_customer` reuses
  `customer.service.js#createCustomer` directly to create a real `Customer` inline;
  `existing_customer` requires an in-scope `customerId`) matches smartrays.md's "ask which
  create client or convert client". No automation on renewal — `status` only changes via an
  explicit `PATCH /amc/:id`.
- **Known deviations:** none from the ask — no automation on renewal and no cross-linking to
  `Contract`/`Invoice`, both stated v1 simplifications per this task's own instruction.
- **Test coverage:** 20 tests, no application bugs found; see §7.10 for the complete writeup.

##### Reports (§7.11, Phase 8, built)
- **Data model:** none of its own — reads from every other module via each module's own
  existing scoped list/report function.
- **API surface:** single `POST /reports/generate` dispatching by module — §7.11, matching the
  original literal spec exactly. `GET /attendance/report`/`GET /travel-logs/report` migrated
  onto this same dispatcher internally (breaking change — see §7.11's full write-up).
- **Permission requirements:** no new `reports.generate` permission — gated per-module by
  reusing `can()` against that module's own existing actions via a small internal map.
- **Key invariants:** one shared PDF/Excel renderer (`src/services/report.service.js`, unchanged
  from its §7.4 groundwork), not one-off generators per module; uploads to Cloudinary and
  returns a download URL rather than streaming the binary. Never runs a raw, unscoped query —
  always dispatches through each module's own already-scoped data-fetcher.
- **Known deviations:** Leads' `GET /leads/export` stays exactly as it was, deliberately not
  migrated onto this pipeline (a separate, pre-existing CSV/Excel export — the new `leads`
  module report reuses `listLeads`, not `exportLeadsToExcel`, and is additive, not a
  replacement). `GET /payroll/:id/payslip` was also deliberately excluded — a single-document
  artifact, not a filtered-list report, so it doesn't fit this dispatcher pattern (proven by a
  dedicated regression test).
- **Test coverage:** 24 tests, no application bugs found; see §7.11 for the complete writeup.

##### Dashboards (§7.13, Phase 9)
- **Data model:** none — a frontend composition concept.
- **Key invariants:** one dashboard shell composing widgets by role + permissions, not four
  separate per-role codebases.
- **Known deviations:** none yet — not built, and no frontend work has started at all.

---

**Bridge to the Roadmap:** this HLD/LLD describes the system's complete target shape — every
module, built or not, in one place — with current build status marked inline throughout. §10 is
where build *order*, phase dependencies, and what's actually sequenced next live. Read this
section to understand what the system is and how its pieces fit together; read §10 to know
what to build next and why.

---

## 3. Tech Stack (fixed per `.context/smartrays.md` — do not deviate without discussion)

| Layer | Choice |
|---|---|
| Backend runtime | Node.js (latest LTS) |
| Backend framework | Express.js, ES Modules |
| Database | MongoDB + Mongoose |
| Frontend framework | React.js + Vite |
| Language | JavaScript only — no TypeScript |
| Routing | React Router DOM (`createBrowserRouter` / `createRoutesFromElements`) |
| Global state | Zustand — only for genuine cross-page state (session/user, active running task timer, notification count) |
| Styling | Tailwind CSS (layout/utility) + Ant Design (production components) |
| Auth | JWT in httpOnly + secure + sameSite cookies — never localStorage/sessionStorage |
| Push notifications | Web Push (VAPID) via a PWA service worker + `web-push` npm package — ✅ **backend half wired 2026-07-16** (§7.16, Phase 9): `web-push` sender, `Notification`/`PushSubscription` models, VAPID keypair now required env vars. The PWA service worker (browser-side receipt/display) is a frontend concern, still planned |
| Scheduled jobs | `node-cron` (in-process) — ✅ monthly payroll run wired 2026-07-13 (`src/cron/payrollCron.js`, §7.7); ✅ **lead follow-up reminder cron wired 2026-07-16** (`src/cron/leadFollowUpReminderCron.js`, §7.16, every 5 minutes); recurring invoice generation still planned |
| PDF/Excel export | `pdfkit` (PDF) — resolved 2026-07-13, `exceljs` already in use for Leads' export. Generic building blocks now live in `src/services/report.service.js` (`generateExcelReport`/`generatePdfReport`, added alongside Attendance's report endpoint) — groundwork for §7.11's real shared pipeline, not the pipeline itself. Leads' export predates this service and was not migrated onto it |
| File storage | **Cloudinary** — resolved 2026-07-13 (see §11.6). Used uniformly across all environments for attendance login photos, ticket attachments, and generated PDF/Excel reports; no separate local-disk path for dev, to avoid a dev/prod behavior split |
| Backend testing | **Resolved 2026-07-13** (added during the Leads test-suite build, not in the original plan): `vitest` (test runner — chosen over Jest for native ESM support, no build step needed) + `supertest` (HTTP-level tests against the Express app) + `mongodb-memory-server` (disposable per-test-file MongoDB, no dependency on a real running instance). See `backend/README.md` → Testing. |

**Env vars** (implemented in `backend/.env.example` as of Phase 0/Auth build):
```
NODE_ENV=
PORT=
MONGODB_URI=

JWT_SECRET=
JWT_EXPIRES_IN=                  # e.g. 7d — also drives the auth cookie's maxAge, see §7.0
COOKIE_NAME=                     # name of the httpOnly auth cookie, e.g. smartrays_token
CLIENT_ORIGIN=                   # allowed CORS origin (frontend dev server / prod domain)

SEED_ADMIN_NAME=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=             # used once by `npm run seed:admin`, see §7.0

CLOUDINARY_CLOUD_NAME=           # required as of 2026-07-13 (Attendance photo capture, §7.4)
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CREDENTIALS_ENCRYPTION_KEY=      # 32-byte key, base64-encoded, AES-256-GCM (see §6.3/§7.2/§11.8), required as of Phase 2

LOCATION_PING_INTERVAL_MINUTES=2 # see §7.4b — the client reads this via GET /location/config to
                                  # schedule its own ping loop instead of hardcoding the cadence.
                                  # Not required — defaults to 2 if unset.
ATTENDANCE_GAP_THRESHOLD_MINUTES=10 # see §7.4 — minutes of heartbeat silence before a
                                  # connectivityGaps[] entry is recorded. Not required — defaults
                                  # to 10 if unset.
GOOGLE_MAPS_API_KEY=             # required as of Phase 6 (Transport/Travel, §7.6) — see
                                  # src/services/googleMaps.service.js
MILEAGE_RATE_PER_KM=10           # see §6.5/§7.7 — currency units per approved TravelLog km,
                                  # payroll.service.js#runPayroll's mileageReimbursement. Not
                                  # required — defaults to 10 if unset. PLACEHOLDER value, a
                                  # deliberately simple v1 (single global rate, not
                                  # per-role/per-project) — client must confirm the real rate.
VAPID_PUBLIC_KEY=                # required as of Phase 9 (§6.7/§7.16) — web-push's own
VAPID_PRIVATE_KEY=               # generateVAPIDKeys() utility generates a real pair; no safe
                                  # placeholder exists for a public-key-cryptography keypair.
VAPID_SUBJECT=                   # optional — mailto:/https: contact URL per the Web Push spec.
                                  # Defaults to mailto:support@smartrayssolutions.com if unset.
```

All coding-standard rules from `.context/smartrays.md` (modular `modules/<feature>/` structure
with controller/service/model/routes/validation, centralized error handling + async wrapper,
`{success, message, data}` response envelope, thin controllers, business logic in services,
early returns, no cleverness) apply globally and are treated as settled — they are not
re-litigated per module below.

---

## 4. System Architecture

```
┌─────────────────────────────┐        ┌───────────────────────────────┐
│         Frontend            │        │            Backend           │
│  React + Vite (SPA)         │  HTTPS │  Express REST API             │
│  - role-based route guards  │◄──────►│  - JWT cookie auth middleware │
│  - Ant Design + Tailwind UI │        │  - can(user, module, action)  │
│  - Zustand: session, timer  │        │    permission middleware      │
│  - service-worker (push)    │        │  - modules/* (thin controller │
└─────────────────────────────┘        │    → service → model)         │
                                        │  - node-cron jobs             │
                                        │  - web-push sender            │
                                        │  - report generator (pdf/xlsx)│
                                        └───────────────┬───────────────┘
                                                         │
                                        ┌────────────────▼───────────────┐
                                        │           MongoDB              │
                                        │  users, leads, customers,      │
                                        │  contracts, projects, tasks,   │
                                        │  attendance, leave, payroll,    │
                                        │  tickets, payments, amc, …      │
                                        └─────────────────────────────────┘
                                                         │
                                        ┌────────────────▼───────────────┐
                                        │   External services            │
                                        │  - Google Maps Distance Matrix │
                                        │  - Cloudinary (photos,          │
                                        │    ticket attachments, reports)│
                                        └─────────────────────────────────┘
```

Since MongoDB has no row-level security equivalent to Postgres RLS, **every** service-layer
query that lists or fetches records must explicitly scope by the caller's ownership/team when
they hold the "own only" variant of a permission (e.g. `leads.view` vs. `leads.view.all`). This
is the single most important security rule in the whole system and is called out again per
module below.

### 4.1 Single Source of Truth for Auth

**Formalized 2026-07-13 — but not a new behavior.** This is a hard rule, not a suggestion,
stated with the same weight as the ownership-scoping rule above, and applied retroactively: it
governs `auth` (§7.0), `lead` (§7.1), `location` (§7.4b), and `permission` (§7.12) exactly as
built, and every module built from here forward, without exception.

**The database is the single source of truth for every authentication and authorization
decision** — login verification, registration, permission checks, session validation, role
checks, all of it. "Who is this user" and "what are they allowed to do" are never trusted from
anywhere except a fresh database read at request time. Concretely:

- **The JWT carries identity only.** The signed payload is `{ userId }` — nothing else. It
  proves "this is user X" and nothing more. Role, permissions, and any other authorization
  claim are never baked into the token, so there is nothing in it to go stale or to trust
  instead of the database.
- **Every authenticated request re-reads the user's current role and permissions from the
  database.** `authenticate` (`authenticate.middleware.js`) decodes the JWT for the `userId`
  only, then does a fresh `User.findById()` on every single request and attaches the result as
  `req.user`. `can()` (`permission.helper.js`) and every service-layer scoping check read
  `req.user.role`/`req.user.permissions` from that fresh document — never from the token
  payload, never from a client-sent field, never from an in-memory or session cache. **A
  practical consequence, not a hypothetical one:** if an admin edits a user's permissions via
  `PATCH /users/:id/permissions` (§7.12) while that user is mid-session, the change takes
  effect on their **very next request** — not after they log out and back in, because nothing
  about their authorization was ever cached anywhere between requests.
- **No authorization decision is ever made from anything the client sent.** A client-supplied
  `role`, `isAdmin`, `permissions`, or similar field in a request body, query string, or header
  is always ignored for authorization purposes — the real value only ever comes from
  `req.user`, and `req.user` only ever comes from the `authenticate` middleware's database
  lookup. (Fields like `POST /auth/register`'s `role` are data being *written* for a *new*
  account, decided by the already-authenticated admin making the call — not a claim about the
  *caller's own* authorization, which is the thing this rule actually governs.)

**Why "not a new behavior" is a verified claim, not an assumption:** `auth.service.js` has
signed `{ userId }`-only tokens since the Auth module's original build (§7.0); `authenticate`
has done a fresh `User.findById()` on every request since then too. Nothing about existing
behavior changed to satisfy this principle — it was already true, just implicit. This section
makes it explicit and durable so it can't be silently violated in a future module (e.g. by an
optimization that decodes role from the token to "save a query," or a shortcut that trusts a
client-sent flag) without visibly contradicting a stated rule.

---

## 5. Roles & Permission Matrix

Permissions are stored as a structured object/array on the `User` document (Mongo equivalent
of a JSONB permissions column) and checked everywhere through one shared
`can(user, module, action)` helper — both server-side (source of truth, on every route) and
client-side (to hide/disable controls, never trusted alone).

| Module → action | Admin | Manager/PM | Sales Associate | Employee | Customer (portal) |
|---|---|---|---|---|---|
| leads.view (all / own) | all | own team | own | – | – |
| leads.create/edit/delete | ✅ | ✅ | ✅ (own) | – | – |
| customers.view/create/edit/delete | ✅ (all) | own team (full CRUD, default) | own (full CRUD, default) | – | – |
| credentials.view (extra gate on top of customers.view/edit) | ✅ (bypass) | ✅ default | – | – | – |
| projects.view | ✅ (all) | own (PM or team member) default | – | own (team member) default | – |
| projects.assign_team | ✅ (bypass) | ✅ default (own projects only, see note) | – | – | – |
| tasks.view | ✅ (all) | ✅ default | – | ✅ default | – |
| tasks.assign | ✅ (bypass) | ✅ default | – | – | – |
| tasks start/stop (own task) | ✅ (bypass) | – | – | ownership check, not a grant | – |
| attendance.view_team/view_all | ✅ (bypass) | `view_team` default | – | – | – |
| location.view (own) | ✅ (bypass) | – | ✅ default | ✅ default | – |
| location.view_team | ✅ (bypass) | ✅ default | – | – | – |
| location.view_all | ✅ (bypass) | – | – | – | – |
| users.view_team | ✅ (bypass) | ✅ default | – | – | – |
| users.view_all | ✅ (bypass) | – | – | – | – |
| leave.view/view_team/view_all | ✅ (bypass) | `view_team` default | `view` default | `view` default | – |
| leave request/approve/mark-unapproved-absence | approve+mark: ✅ only | view own team's, can't approve | request only | request only | – |
| travelLogs.view/view_team/view_all | ✅ (bypass) | `view_team` default | `view` default | `view` default | – |
| travel-log manual entry (own / direct report / anyone) | ✅ (any employeeId) | own or direct report only | own only | own only | – |
| payroll.view/run | ✅ | – (deliberate — no `team` tier exists at all, unlike every other row above) | – (same as Manager — corrected 2026-07-13: an earlier build misread this "–" as a blank/unspecified cell and granted "own payslip only" to match Employee; that was wrong, this cell is an explicit "–" like Manager's) | own payslip only | – |
| tickets.create/assign | ✅ (bypass) | ✅ default (both) | – | – (no create grant) | create default (raise own only) |
| tickets.view_all/view_assigned/view_own | ✅ (bypass) | `view_all` default | – | `view_assigned` default | `view_own` default |
| payments.view/create | ✅ | – | – | – | – |
| amc.view/edit | ✅ | own team | own | – | – |
| reports.generate | ✅ | scoped | scoped | own | – |
| permissions.manage | ✅ | – | – | – | – |

**Resolved 2026-07-13 (§11.1):** "Employee" and "Executive" are **one role — `employee`** —
for v1, not two. There is no separate `executive` value in the permission matrix or the
`User.role` enum. If the client later asks for split permissions between the two job titles,
this table gains a column and `User.role` gains a value; until then, treat every mention of
"Executive" elsewhere in the source notes as the `employee` role.

**"Own team" definition (§11.9, resolved 2026-07-13):** there is no separate `Team` collection.
"Own team" means the set of `User` documents whose `managerId` equals the requesting manager's
`_id` — a single level of direct reports, not a recursive org chart. Every "own team" cell in
this matrix (Leads, Customers, Attendance, AMC) and every "team" scope query in §7 is scoped
this way. See §6.1/§6.7 for the schema change. `location.view_team` (added 2026-07-13, §7.4b)
reuses this exact same `managerId` scoping — no separate team concept for location either.

**`location.*` role defaults (added 2026-07-13, §7.4b) — the one exception to "every permission
defaults to false":** `employee`/`sales_associate` get `location.view: true` and `manager` gets
`location.view_team: true` automatically at account creation, unless an admin explicitly
overrides it. This doesn't change how `can()` works (still a flat lookup, no role-awareness).
**Updated 2026-07-13 (§7.12):** the mechanism behind this default moved from a hardcoded
function to an admin-editable `RolePermissionTemplate` per role — same values, same
"applies at creation time only" behavior, now changeable without a code deploy. See §7.12 for
the full design.

**`users.*` (added 2026-07-13, §7.0b) — no plain `view` tier, unlike `location`'s three-tier
design.** A user's own record is always reachable regardless of any grant (via `GET /auth/me`
and an unconditional self-bypass in the `user` module), so a separate "view own" grant would be
redundant here — `location` needed one because it has no equivalent "my own data" shortcut.
`manager` gets `users.view_team: true` by default, generated from this matrix the same way
`leads.*`/`location.*` already are (§7.12).

**`attendance.*`/`leave.*` (added 2026-07-13, §7.4/§7.5 — full Phase 3 build):**
`attendance` has no plain `view` tier, the same reasoning as `users.*` — an employee's own
attendance is always reachable via `GET /attendance/me` unconditionally, so `view_team`/
`view_all` (both gating visibility into OTHER employees' records) are the only two grants that
need to exist. `manager` gets `attendance.view_team: true` by default. `leave` mirrors
`location`'s full three-tier shape instead (`view`/`view_team`/`view_all`), because unlike
Attendance, viewing your OWN leave data (not just requesting it) genuinely is gated behind a real
grant — `GET /leave?scope=own|team|all` lets the caller explicitly choose a scope rather than
implicitly resolving one from whatever's held, matching how `location`'s endpoints work rather
than `users`'/`attendance`'s unconditional-self-access pattern. `sales_associate`/`employee` get
`leave.view: true` by default (their own requests); `manager` gets `leave.view_team: true`.
*Requesting* leave (`POST /leave/request`) needs no grant at all regardless of role — a
self-service action, same as Attendance check-in/out.

**`travelLogs.*` (added 2026-07-13, §7.6, Phase 6):** mirrors `leave`'s exact three-tier shape and
reasoning — `GET /travel-logs?scope=own|team|all` gives the caller an explicit choice, checked
against the matching action, so viewing even your own travel history is gated behind
`travelLogs.view` rather than being unconditional like Attendance's. `sales_associate`/`employee`
get `travelLogs.view: true` by default; `manager` gets `travelLogs.view_team: true`.
*Logging* your own travel (`POST /travel-logs`) needs no grant at all — self-service, same as
Attendance check-in/out and Leave's request endpoint. Logging on someone else's behalf is a
structural role+relationship check in `travelLog.service.js`, not a permission tier: a manager
may log for their own direct report, an admin for anyone, and a plain employee/sales_associate
naming anyone else at all is rejected outright (403) — deliberately stricter than Leads'
silent `ownerId`-forcing, since misattributing someone else's travel silently would hide a real
mistake rather than surface it.

**`customers.*`/`credentials.*`/`projects.*`/`tasks.*` (added 2026-07-13, §7.2/§7.3) — built as
part of Phase 2, superseding this row's original speculative shape:**
- `customers.delete` is granted to `manager` and `sales_associate` by default too, not just
  admin — a deliberate parity with `leads.delete`'s existing precedent (a sales associate can
  already delete their own leads; there's no principled reason a customer should be more
  protected). If this turns out to be too permissive in practice, narrowing it is a template edit
  (§7.12), not a code change.
- `credentials.view` is the one extra gate required on top of `customers.view` (read) or
  `customers.edit` (create/update/delete/reveal) — there's no separate `credentials.create`/
  `edit`/`delete`, since the reference spec only ever describes one "can see the vault at all"
  permission.
- `projects.assign_team` is necessary but not sufficient to change a project's team — the caller
  must also be *that specific project's* `projectManagerId`, or admin. "Manager/Admin only"
  (§7.3) reads narrower than "any user with the manager role" once actually built.
- There is deliberately no `tasks.update_own` grant — starting/stopping your own task is an
  ownership check (assignee or admin), the same reasoning as `leads.edit`'s `ownerId` scoping,
  not a permission tier a role could hold or lack.

---

## 6. Data Model (MongoDB Collections)

### 6.1 `User` & Permissions

**`User`**
| Field | Type | Notes |
|---|---|---|
| name, email, phone | String | email unique, used for login |
| passwordHash | String | bcrypt |
| role | enum | `admin`, `manager`, `sales_associate`, `employee`, `customer` — no separate `executive` value, resolved §11.1 |
| permissions | Object/Array | per-module action grants, admin-editable. Seeded from that role's `RolePermissionTemplate` at creation time (§7.12) unless the caller explicitly provides `permissions`; independently editable per-user after that — editing a template never touches existing users. Schema uses `minimize: false` (fixed 2026-07-13 during the Location Tracking build) so an explicit empty grant (`{}`) stays visibly present in API responses instead of Mongoose silently stripping it |
| managerId | ObjectId → User (self-reference) | optional; set on `employee`/`sales_associate` docs to their manager. Replaces the earlier `teamId → Team` design — resolved §11.9, no separate `Team` collection. "Own team" queries elsewhere in this doc filter by `managerId == requestingManager._id` |
| isActive | Boolean | |
| baseSalary | Number | **Added 2026-07-13 — resolved schema gap, not a silent addition.** Nothing before Payroll (§7.7, Phase 4) tracked a salary figure at all, and Payroll can't compute `grossAmount`/`netAmount` without one. `select: false` (same defense-in-depth pattern as `passwordHash`) — never returned by a plain list/dropdown query, only by `payroll.service.js`'s explicit `.select("+baseSalary")` or the update response itself. Treated as a **privileged field** in `user.service.js` — the same admin-only, not-self-editable treatment already given to `role`/`managerId`/`isActive`, for the obvious reason that self-service salary editing would defeat the field's purpose. Settable via the existing `PATCH /users/:id` flow, not a new endpoint. |
| customerId | ObjectId → Customer | **Added — resolved schema gap, not a silent addition.** Nothing before the Customer Portal (§7.8, Phase 5) linked a `role: "customer"` account to the `Customer` company it belongs to. Only ever set for `role: "customer"` accounts (null for every other role) — normally resolved automatically at self-signup via an email-domain match (`customer.service.js#resolveCustomerIdByEmailDomain`, see §7.0/§7.8), though an admin can also set it manually through the existing `POST /auth/register`/`PATCH /users/:id` flows as a fallback. Treated as a **privileged field** in `user.service.js` — the same admin-only, not-self-editable treatment as `baseSalary`/`role`/`managerId`/`isActive`, for the obvious reason that letting a portal user relink themselves to a different company would be a security hole. |
| pushSubscriptions | [ObjectId → PushSubscription] | |

**`RolePermissionTemplate`** — added 2026-07-13 (§7.12), replaces the hardcoded
`getDefaultPermissionsForRole()` added during the Location Tracking build (2026-07-13,
`permission.helper.js`) — that function was always documented there as "a registration-time
convenience," now formalized into a real, admin-editable module instead of a code constant.
| Field | Type | Notes |
|---|---|---|
| role | enum (same as `User.role`) | unique — one template per role |
| permissions | Object | same shape as `User.permissions` — `{ module: { action: boolean } }` |
| updatedAt | Date | |
| updatedBy | ObjectId → User | who last edited this template |

See §7.12 for the full design: how this relates to the hardcoded `PERMISSION_REGISTRY` and to
`User.permissions`, the endpoints, validation rules, and the explicit non-retroactivity rule.

### 6.2 Leads

**`Lead`**
| Field | Type | Notes |
|---|---|---|
| name, email, phone, companyName | String/String/String/String | phone has copy-button in UI |
| source | String (ref `LeadSource` config) | editable list, not hardcoded enum |
| status | enum | `new`, `contacted`, `qualified`, `proposal_sent`, `negotiation`, `won`, `lost` |
| businessStage | enum | `new`, `old`, `stable` — separate axis from `status`, smartrays.md-specific |
| ownerId | ObjectId → User | |
| budget | Number | |
| followUpDate, followUpNote | Date, String | one active follow-up per lead |
| isHot | Boolean | |
| notes | String | |
| lostReason | String | required when status → `lost` |
| convertedCustomerId | ObjectId → Customer | set on conversion, lead then archived |

**`LeadCall`** — leadId, calledAt, durationSeconds, outcome (`connected`/`no_answer`/`voicemail`/`callback`), notes

**`LeadSource`** — name, isActive (admin-managed config list, seed with: Website, Meta Ads,
Google Ads, Referral, BNI, Cold Call, Walk-in, LinkedIn, Clutch, Other)

### 6.3 Customers

**`Customer`**
| Field | Type | Notes |
|---|---|---|
| companyName | String | |
| billingType | enum | `registered` (GST), `non_gst`, `overseas` |
| billingName, billingAddress, billingState, gstin | String | India GST fields |
| phone, email, website, industry | String | |
| ownerId | ObjectId → User | account manager |
| projectManagerId | ObjectId → User | **required at creation** (smartrays.md-specific) |
| source | String | |
| customerStatus | enum | `active` / `inactive` |
| signedUpAt | Date | |
| notes | String | |

**`Contact`** — customerId, name, email, phone, designation, isPrimary
**`Contract`** — customerId, type (`monthly`/`onetime`/`yearly`), amount, label, renewalDate, termYears
**`Credential`** — customerId, service, username, passwordEncrypted, passwordIv, url, notes —
encrypted at rest with **AES-256-GCM**, resolved 2026-07-13 (§11.8): a single symmetric key
lives in the `CREDENTIALS_ENCRYPTION_KEY` env var (32-byte, base64), a fresh random IV is
generated per record and stored alongside the ciphertext (`passwordIv`), and decryption happens
only on explicit "reveal" — never returned in plaintext on list/detail fetches. No automated
key rotation in v1 (env-based single key, not a KMS); rotating the key is a manual runbook step
(re-encrypt all `Credential` docs with the new key) if it's ever needed. Gated behind
`credentials.view` on top of `customers.view`.
**`Invoice`** — customerId, contractId, number, type (`proforma`/`gst`), amount, balance, status, issuedAt

### 6.4 Projects & Tasks

**`Project`** — name, customerId, projectManagerId, teamMemberIds[], type (`recurring`/`onetime`),
status (`active`/`completed`/`paused`), linkedContractId, createdAt
**`Task`** — projectId, title, assignedToId, status (`todo`/`in_progress`/`done`), startedAt, stoppedAt
— **server-side constraint: one `in_progress` task per employee at a time**, enforced in the
service layer (not just a disabled button) to survive multi-tab/multi-device races.

### 6.5 Workforce

**`Attendance`** — employeeId, date, checkIn {time, coords, photoUrl}, checkOut {time, coords, photoUrl}, status (`present`/`absent`/`half_day`/`on_leave`), workingHours (computed), connectivityGaps[] (start, end) — rendered red on the timeline for network-drop/forced-logout periods.
✅ **Fully built 2026-07-13** (§7.4) — one field beyond this list was added during that build:
`lastHeartbeatAt` (Date, internal bookkeeping for connectivity-gap detection only, never exposed
as its own API concept — see §7.4's connectivity-gap design writeup for why it's needed).
**`Leave`** — employeeId, date(s) (built as an inclusive `startDate`/`endDate` range — the
simplest reading of "date(s)"), type (`paid`/`unpaid`/`unapproved_absence`), approvedBy,
isDoubleDeduction (Boolean — true only for the unapproved-absence-marked-by-admin case, per the
2x rule). ✅ **Built 2026-07-13** (§7.5) — one field beyond this list was added: `status`
(`pending`/`approved`/`rejected`), necessary to support the request→approve workflow §7.5's own
endpoints imply (a leave request has to start somewhere before an admin can "approve" it).
**`TravelLog`** — employeeId, date, originCoords, destinationCoords, distanceKm (from Google Maps Distance Matrix), source (`auto` from check-in/out or `manual`). **Retrofitted
2026-07-13 with an approval workflow** (§7.6/§7.7, done alongside resolving §11.4): `status`
(`pending`/`approved`/`rejected`, default `pending` — neither `auto` nor `manual` entries
auto-approve), `approvedBy` (ref `User`), `approvedAt` (Date). Required because Payroll's
mileage reimbursement (below) must only ever be computed from entries someone with authority
actually signed off on, not from an unverified GPS/self-reported distance.
**`Payroll`** — employeeId, month, year, daysInMonth, presentDays, paidLeaveDays, unpaidDeductionDays, workingHoursTotal, grossAmount, netAmount, generatedAt, paidOn (defaults to the 1st of the following month)
**`LocationPing`** — added 2026-07-13. employeeId (ref `User`), attendanceId (ref `Attendance`
— the specific open check-in/check-out record this ping belongs to), coords `{ lat, lng }`,
capturedAt (Date, device-reported), createdAt (Date, server-received; **TTL index**,
`expireAfterSeconds: 3888000` = 45 days — old pings purge automatically, no cleanup cron
needed). See §7.4b for ingestion rules, scoping, and endpoints. **Not the same thing as
`TravelLog` above** — `TravelLog` is a derived per-day/per-trip distance summary (Google Maps
Distance Matrix, §7.6); `LocationPing` is the raw ~2-minute GPS stream during a shift that
powers a live "who's where right now" view and a day's map trail. `TravelLog` could later be
computed *from* `LocationPing` data (Phase 6+ enhancement), but the two collections aren't
merged and serve different purposes today.

### 6.6 Support, Payments, AMC

**`Ticket`** — raisedByCustomerId (ref `User`, nullable if internal), category (`new_project`/`existing_client_query`/`other` — §11.2, resolved), status (`open`/`in_progress`/`resolved`/`closed`), assignedToId, customerId (ref `Customer`, always set — every ticket concerns a company, even one raised internally on their behalf), attachments[], history[] (timeline of status changes/comments).
✅ **Built (§7.8, Phase 5)** — one field beyond this list was added: `subject`
(String, required) — a short summary is necessary for any list view, and §6.6's terse field
list never included one; the same treatment as other fields added beyond a terse §6.x spec
(`baseSalary`, `lastHeartbeatAt`, etc.). There's no separate `description` field — the raiser's
initial free-text explanation becomes the very first `history[]` entry (`type: "comment"`)
instead, since `history[]` already exists specifically to hold comments. `attachments[]` is
`{ url, uploadedBy, uploadedAt }` per entry (not bare URL strings) — enough metadata to know
who attached what and when. `history[]` entries are `{ type: "status_change"|"comment",
authorId, comment, fromStatus, toStatus, createdAt }` — `fromStatus`/`toStatus` only populated
for `status_change` entries. See §7.8 for the full build.
**`Payment`** — customerId (or manual free-text name), date, amount, notes, recordedBy — admin-only tab.
✅ **Built (§7.9, Phase 7)** — one field beyond this list was added: `invoiceId` (ObjectId →
`Invoice`, nullable), for the **partial reconciliation** design that resolves §11.3 (see below
and §7.9/§11.3). `Invoice.status`'s enum gained a new value, `partially_paid` (between `sent`
and `paid`) — the original 4-value enum (`draft`/`sent`/`paid`/`cancelled`) had no status to
represent "some money has come in, but the balance isn't zero yet"; without it, applying a
partial payment would have had nowhere correct to leave the invoice's status. See §7.9 for the
full reconciliation logic.
**`AMC`** — customerId, amount, startDate, renewalDate, status (`active`/`expired`), createdFromFlow (`new_customer`/`existing_customer`).
✅ **Built (§7.10, Phase 7)** exactly as documented — no fields added or changed. No automation
on renewal (`status` is purely admin-set via `PATCH /amc/:id`, nothing flips it to `expired`
automatically when `renewalDate` passes) and no cross-linking to `Contract`/`Invoice` — both
deliberate, stated v1 simplifications, not gaps. See §7.10.

### 6.7 Platform

✅ **Built (§7.16, Phase 9, 2026-07-16)** — both models built exactly as documented below, no
fields added or changed. See §7.16 for the full write-up.

**`PushSubscription`** — userId, endpoint, keys (VAPID)
**`Notification`** — userId, type, message, isRead, relatedEntity (module + id)

No separate `Team` collection — resolved 2026-07-13 (§11.9). Manager-scoped "own team" views
(Leads, Customers, Attendance, Leave, AMC) are computed by looking up `User` documents where
`managerId` equals the requesting manager's `_id` (see §6.1), then filtering the target
collection's `ownerId`/`employeeId` against that set. Simpler than an explicit `Team`
collection and avoids keeping a second membership list in sync with `User.managerId`.

---

## 7. Module Specs (screens, workflows, API surface)

For every module: **Screens**, **Key workflow/business rules**, **REST endpoints** (all under
`/api/v1/<module>`, all wrapped in the `{success, message, data}` envelope, all behind
`authenticate` + `can(module, action)` middleware).

### 7.0 Auth & Session

✅ **Built** (first module implemented, ahead of the Leads/Customers phases below since every
other module depends on it). No dedicated `Auth` collection — reads/writes the `User` model
(§6.1) directly.

**Governed by §4.1 (Single Source of Truth for Auth):** the JWT this module issues carries
`{ userId }` only — no role, no permissions — and every downstream request re-reads the
user's role/permissions fresh from the database via `authenticate.middleware.js`. This module
*is* where that rule is implemented, not just subject to it.

**Rules:** internal tool, no public self-registration — `POST /register` requires an
already-authenticated admin (`requireAdmin` middleware, a plain role check, not the
`can(module, action)` permission matrix, since account creation isn't one of the 13 feature
modules in §5). The very first admin account can't come through the API (nothing is
authenticated yet), so a one-time `npm run seed:admin` script inserts it directly using
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`/`SEED_ADMIN_NAME` env vars. JWT is signed with
`JWT_SECRET`/`JWT_EXPIRES_IN` and stored **only** in an httpOnly cookie named by `COOKIE_NAME`
— `secure` in production, `sameSite: strict` in production / `lax` in dev, `maxAge` parsed
from `JWT_EXPIRES_IN` so the cookie never outlives the token. Passwords are hashed with bcrypt
and the `passwordHash` field is stripped from every JSON response via a schema-level `toJSON`
transform on `User` (§6.1), not by remembering to redact it in each controller.

**Endpoints:**
```
POST   /auth/register           admin-only (requireAdmin) — creates a staff account
POST   /auth/customer/signup    public — Customer Portal self-signup (added, §7.8)
POST   /auth/login              public — verifies credentials, sets the auth cookie
POST   /auth/logout             authenticated — clears the auth cookie
GET    /auth/me                 authenticated — returns the current user
```

**Customer Portal self-signup — `POST /auth/customer/signup` (added, §7.8, Phase 5).
RESOLVED DECISIONS for this task:**
- Customer Portal users authenticate through the **exact same** auth system as everyone else
  (`role: "customer"`, same JWT/cookie flow, same `POST /auth/login`) — no separate auth
  mechanism was built or is needed.
- `customer`-role accounts are **self-signed-up**, never admin-created via `POST /auth/register`
  (though `createUser` still accepts an optional `customerId` too, as an admin manual-fixup
  path — see §6.1).
- Verification is an **email-domain match**: `user.service.js#createCustomerSelfSignupUser`
  calls `customer.service.js#resolveCustomerIdByEmailDomain(email)`, which checks `Contact.email`
  first (a company realistically has several real people's addresses on file — higher
  hit-rate) and falls back to `Customer.email` (a single company-level address) only if no
  `Contact` matches. On a match, a new `User` is created with `role: "customer"` and
  `customerId` set to the matched `Customer`; on no match, signup is rejected — **400** (this
  codebase has no 422 anywhere else, so 400 keeps the error-code vocabulary consistent rather
  than introducing a one-off) with "No matching company found for this email domain — please
  contact your account manager."
- Permissions are seeded from the `customer` role's `RolePermissionTemplate` (§7.12) — added as
  part of this task: `{ tickets: { create: true, view_own: true } }` and nothing else (see
  §7.8/§5).
- `POST /auth/customer/signup` is deliberately **separate** from the admin-gated
  `POST /auth/register` — not overloaded onto it: it's public (no `authenticate`/`requireAdmin`)
  and has a different validator (`validateCustomerSignupInput` — no `role` field at all, always
  implicitly `"customer"`).

**Test coverage:** `backend/src/modules/auth/auth.test.js` — 19 tests (13 original — corrected
2026-07-13 from a previously misdocumented 11, an uncaught miscount, not a code change — + 6 new
for Customer Portal self-signup: succeeds via a `Contact`-email domain match, succeeds via the
`Customer.email` fallback when no `Contact` matches, rejects clearly with no domain match at
all, rejects a duplicate email, rejects an invalid email/short password, and the newly
signed-up account can log in afterward like any other), including a regression test asserting
the logout `Set-Cookie` header expires immediately (no
lingering `Max-Age`), locking in the cookie-clearing bug found and fixed during this module's
original build. Colocated with the module per this project's per-module file convention;
shared test infrastructure lives in `backend/tests/helpers/`. See `backend/README.md` →
Testing.

**Implementation note — RESOLVED 2026-07-13 (was: added during the Leads build, 2026-07-13):**
`POST /auth/register` previously accepted an optional `permissions` object, forwarded directly
onto `User.permissions`, as a stopgap because the full Permissions module (§7.12) didn't exist
yet and without *some* way to grant module permissions at account-creation time, every
non-admin account would be permanently locked out of every module. **Now that §7.12 is built,
this field has been removed.** `createUser` (`user.service.js`, §7.0b — moved there 2026-07-13
when the User Management module was built, see below) unconditionally seeds a new user's
`permissions` from their role's *current* `RolePermissionTemplate` (§6.1/§7.12) — there is no
way to override this at registration time anymore. Per-user customization now happens
**after** registration, via `PATCH /users/:id/permissions` (§7.12), which is the only
mechanism, matching every other module's admin-override pattern rather than being a special
case of the register endpoint.

### 7.0b User Management

✅ **Built and verified 2026-07-13** (33 tests as of the Payroll task's `baseSalary` addition,
§7.7 — 31 from the original build — `npm test`, see `backend/README.md` →
Testing). Completes the `user` module, which until now was a shared model only (imported
directly by `auth`/`lead`/`location`/`permission`) with no CRUD/roster-management layer of its
own.

**Resolved overlap with `POST /auth/register`:** account creation was already implemented
inside `auth.service.js` before this module existed. Rather than have two copies of "hash a
password, seed permissions from the current template, save" (one in `auth`, one in `user`),
`createUser` now lives **only** in `user.service.js`, and `auth.controller.js`'s `register`
handler calls it directly — `auth.service.js` no longer has a `registerUser` function at all
(not even a thin pass-through; there was nothing auth-specific left in it once creation and
session/login concerns were separated). **`POST /auth/register` remains the only HTTP entry
point for creating a user** — no `POST /users` was added, since the ask was to remove
duplicate *code*, not to expose a second URL for an already-established, tested, documented
action. `src/scripts/seedAdmin.js` was updated to call `user.service.js#createUser` for the
same reason.

**Data model:** no new collection — reads/writes `User` (§6.1) directly, same as `auth`.

**Permissions:** `users.view_team`/`view_all` (§5) — deliberately **no plain `users.view`
tier**, unlike `location`'s three-tier design. A user's own record is always reachable via
`GET /auth/me`, an unconditional self-bypass in `getUserById`, and (see below) `listUsers`'s
`fallbackToSelf` behavior, so a separate "view own" grant would be redundant here in a way it
isn't for `location` (which has no equivalent "my own data" shortcut outside this permission
system). `manager` gets `users.view_team: true` by default, added to the same
`RolePermissionTemplate` seed values §7.12 already generates from §5's matrix. Account-lifecycle
actions (deactivate/reactivate/reassign manager) are gated by `requireAdmin`, not a `can()`
permission — the same reasoning §7.0 already gives for why account creation itself is
`requireAdmin`: these aren't partial "viewing tiers" a manager could plausibly hold part of,
they're binary admin/non-admin actions.

**List vs. single-record scoping deliberately diverge on the no-grant case.**
`resolveVisibleUserFilter(requestingUser, { fallbackToSelf })` is the one function behind both
`GET /users` and `GET /users/:id`, but each calls it differently:
- `listUsers` passes `fallbackToSelf: true` — a caller with neither `view_team` nor `view_all`
  still gets a `200` back from `GET /users`, just narrowed to a 1-item list containing only
  themselves. A plain "list my stuff" request should never hard-fail just because the caller
  can't see anyone else's.
- `getUserById` passes the default `false` — deliberately fetching a specific *other* person's id
  with no grant at all is still a `403`, not silently redirected to the caller's own record. (The
  caller's *own* id is short-circuited before `resolveVisibleUserFilter` is ever called, so this
  branch only fires when someone is explicitly requesting someone else's id.)

This split — rather than one universal fallback rule — was chosen because the two endpoints
answer different questions: "what can I see, at minimum" (list — never worth a hard failure) vs.
"can I see *this specific record*" (single lookup — a no-grant request for someone else's id is
exactly the case 403 exists to reject).

**Validation-layer defense in depth (added after initial build):** the self-vs-admin field
restriction on `PATCH /users/:id` — non-admins may only touch `name`/`email`/`phone`, never
`role`/`managerId`/`isActive`, even on their own record — was originally enforced only in
`user.service.js#updateUser`. It's now **also** enforced in `user.validation.js`, which imports
the same `PRIVILEGED_FIELDS` list the service exports, so a request carrying a privileged field
from a non-admin is rejected before the controller (and therefore the service) ever runs. This is
a deliberate duplication, not an accidental one: if the service-layer check is ever weakened or
bypassed by a future refactor, the validation layer still blocks the request independently.

**Endpoints:**
```
GET    /users/dropdown           authenticate only — id/name/role, active users only. Not
                                  permission-gated: low-sensitivity picker data needed broadly
                                  by other modules' "assign to" UIs (Leads owner, Customer
                                  project manager, etc.), same reasoning as GET /lead-sources
                                  (§7.1).
GET    /users                    authenticate only, no route-level permission gate — full
                                  roster with optional ?role=&isActive=&managerId= filters,
                                  scoped in the service by the same managerId-based "own team"
                                  pattern as everywhere else (§11.9): view_all → everyone,
                                  view_team → direct reports + self, NO GRANT AT ALL → still
                                  200, narrowed to just the caller (fallbackToSelf; see above).
GET    /users/:id                authenticate only — self-access always allowed regardless of
                                  any grant; otherwise scoped like the list endpoint EXCEPT the
                                  no-grant case: fetching someone else's specific id with no
                                  users.* grant is 403 (not narrowed to self, unlike the list —
                                  see above), and 404 if some grant is held but this record
                                  isn't in scope (matching the Leads/Location 404-not-403
                                  precedent for not leaking existence).
PATCH  /users/:id                authenticate only — a user may always update their own
                                  name/email/phone. role/managerId/isActive are admin-only,
                                  even on your own record (an ownership check resolved in the
                                  service, the same reasoning as Leads' ownerId scoping — a
                                  fixed route-level permission can't express "self OR admin").
PATCH  /users/:id/deactivate     requireAdmin
PATCH  /users/:id/reactivate     requireAdmin
PATCH  /users/:id/manager        requireAdmin — sets or clears (managerId: null) a user's
                                  manager; a non-null managerId must belong to a user with
                                  role manager or admin, else 400 (same rule createUser
                                  enforces at account-creation time).
```

**Key invariants:**
- `managerId` (at creation, on update, and on reassignment) must always resolve to an existing
  user whose role is `manager` or `admin` — enforced in one shared `ensureValidManagerId`
  helper used by `createUser`, `updateUser`, and `assignManager` alike, not three separate
  copies of the same check.
- List/get scoping is a **union of every grant held**, not just the widest one — the same
  design already used in `location.service.js`, applied here for the same reason (an admin
  override granting `view_team` on top of some other grant must not be silently dropped by an
  early-return "pick the broadest" implementation).

**Found and fixed one real bug during the build, not before:** `getUserById`'s scope check
originally merged `{ _id: targetId }` with the scope filter via a plain object spread
(`{ _id: targetId, ...scopeFilter }`). For every other module built so far (Leads' `ownerId`,
Location's `employeeId`), the scope filter's key is *different* from the record's own `_id`, so
a spread is safe. Here, the `view_team` branch's scope filter is itself keyed on `_id`
(`{ _id: { $in: [...] } }`) — spreading silently let it clobber the explicit `_id: targetId`
constraint, so the query ended up matching *any* visible user instead of specifically the
requested one (a manager could fetch an unaffiliated sales associate's record and get a 200
instead of the expected 404). Fixed with `$and: [{ _id: targetId }, scopeFilter]` instead.
Caught by a test, not by inspection.

### 7.1 Leads

✅ **Built and verified 2026-07-13; automated test suite added 2026-07-13 (46 tests, `npm
test`, see `backend/README.md` → Testing).** Backend only — the screens below describe the
frontend this API supports, which hasn't been built yet (no `frontend/` work has started).
Writing the test suite did not surface any application bugs — every scoping/validation/filter
rule documented below already matched actual behavior. It did lock in, with a regression test,
the intentional 404-vs-403 out-of-scope-access decision two paragraphs down, and the
`sales_associate` ownerId-escalation guard, both of which are exactly the kind of rule that's
easy to accidentally break in a later refactor without a test catching it.

**Screens (not yet built):** Table view, Board (kanban, drag between `status` columns), Lead
detail slide-over (fields + call history + activity timeline + action buttons), CSV/Excel
import wizard (upload → column mapping → preview → bulk create), Bulk export.

**Rules:** one active follow-up per lead; `lost` requires `lostReason`; hot flag toggle;
convert-to-customer pre-fills but stays fully editable before save; push on assignment and
24h/15min before follow-up (cron: `follow-up-reminders`) — ✅ **built 2026-07-16, §7.16** —
`lead.service.js#notifyLeadAssignment` (createLead/updateLead) and
`src/cron/leadFollowUpReminderCron.js` (5-minute tick, `lead.service.js#sendDueFollowUpReminders`).

**Endpoints (as built — see `backend/README.md` for the full table with permissions):**
```
GET    /leads                 list (search, owner, follow-up filter, status)
POST   /leads                 create
GET    /leads/export          CSV/Excel export of current filter (registered before /:id)
POST   /leads/import           CSV/Excel bulk import
GET    /leads/:id             detail
PATCH  /leads/:id             edit
DELETE /leads/:id
PATCH  /leads/:id/status      change pipeline stage
PATCH  /leads/:id/hot         toggle hot
POST   /leads/:id/calls       log call
GET    /leads/:id/calls
POST   /leads/:id/convert     real implementation as of 2026-07-13 (§7.2) — creates a Customer
                              from the lead's data, sets Lead.convertedCustomerId
GET    /lead-sources          config list, lazily seeded with the 10 defaults on first fetch
```

**Implementation decisions made during the build, not fully specified in this plan before now:**
- **Out-of-scope access returns 404, not 403** — a lead outside a user's scope (per the §5/§11.9
  ownership rules) is indistinguishable from a nonexistent one, so its existence isn't leaked
  to someone who can't see it.
- **`sales_associate` ownership is enforced server-side, not just UI-side**: `POST /leads`
  always forces `ownerId` to the creator regardless of what's sent, and `PATCH /leads/:id`
  excludes `ownerId` from the updatable field set for that role — reassigning a lead ("Assign
  owner") is a manager/admin action only, done via `PATCH /leads/:id` with `ownerId` in the
  body (no dedicated `/owner` endpoint — the plan's endpoint list didn't have one, so this
  reuses the generic edit endpoint rather than inventing a new one).
- **`followUp=this_week`** is a rolling 7-day window from today, not the calendar Mon–Sun week
  — simpler to reason about, and the source notes didn't specify which.
  **`followUp=none`** is the "No Follow-up" filter from the reference spec.
- **CSV/Excel export streams the file directly** from the API (`Content-Disposition: attachment`)
  rather than going through the shared reports/Cloudinary pipeline planned for Phase 8 (§7.11)
  — that pipeline doesn't exist yet, and Cloudinary itself isn't wired up until Phase 2/3. Worth
  revisiting once §7.11 exists, so Leads export doesn't diverge from how every other module
  exports.
- **CSV/Excel import has no interactive column-mapping step** (the wizard UX in the "Screens"
  note above is a frontend concept that doesn't exist yet) — columns are matched
  case-insensitively against a fixed alias list (`name`, `email`, `phone`,
  `companyName`/`company name`/`company`, `source`, `status`, `budget`). Invalid rows are
  skipped and reported with a reason + row number rather than failing the whole batch. Imported
  leads are always owned by the importing user — mapping an "Owner" column to a different user
  isn't supported yet.
- **Assignment/follow-up push notifications** — ✅ **built 2026-07-16, §7.16** (Phase 9's
  Notification module). Previously deferred here pending that shared infrastructure; no longer
  a gap.

### 7.2 Customers

✅ **Built and verified 2026-07-13** (21 tests, `npm test`, see `backend/README.md` → Testing).
Built alongside `project` (§7.3) in the same Phase 2 task. **`GET /customers/:id/invoices` and
`GET /customers/:id/ledger` were deliberately NOT built** — both depend on real invoicing
(numbering, ledger balances, payment tracking), which is Phase 7. `Invoice` exists only as a
minimal placeholder model (§6.3) so the contract automation below has somewhere real to write a
draft record — the same treatment `Attendance` got for Location Tracking (§7.4b). This is also
where `POST /leads/:id/convert`'s 501 stub (§7.1) was resolved — `lead.service.js` calls
`customer.service.js#createCustomer` directly.

**Screens:** List (bulk select, bulk activate/deactivate/delete), Detail page (header, billing
card, contracts, contacts, credentials vault, invoice history + ledger view, activity log),
Add-customer wizard (company info → billing → contracts → contacts → project manager picker).
**Rules:** `projectManagerId` required on create; contract-type automations (§6.3/§6.4)
auto-create Project + invoice/recurring-profile; deactivation completes projects and pauses
recurring profiles; credentials masked by default, decrypt only via explicit reveal action
(audited). Credentials are stored AES-256-GCM-encrypted using the server-side
`CREDENTIALS_ENCRYPTION_KEY` env var (§6.3/§11.8) — the reveal endpoint is the only place
plaintext ever leaves the service layer, and every reveal call should be written to the
customer's activity log for audit purposes.
**Endpoints (✅ marks what's built so far):**
```
GET    /customers                                                                    ✅ built
POST   /customers                                                                     ✅ built
GET    /customers/:id                                                                 ✅ built
PATCH  /customers/:id                                                                 ✅ built
DELETE /customers/:id                                                                 ✅ built
POST   /customers/bulk        {ids, action: activate|deactivate|delete}               ✅ built
GET    /customers/:id/contacts       + POST/PATCH/DELETE                             ✅ built
GET    /customers/:id/contracts      + POST/PATCH/DELETE   (triggers project automations) ✅ built
GET    /customers/:id/credentials    + POST/PATCH/DELETE   (credentials.* gate)       ✅ built
POST   /customers/:id/credentials/:credId/reveal   (audited decrypt)                  ✅ built
GET    /customers/:id/invoices                                    NOT built — depends on Phase 7
GET    /customers/:id/ledger?from=&to=                             NOT built — depends on Phase 7
GET    /customers/:id/activity                                                       ✅ built
```

### 7.3 Projects & Tasks

✅ **Built and verified 2026-07-13** (19 tests, `npm test`, see `backend/README.md` → Testing),
in the same task as `customer` (§7.2), which is what actually creates a Project (there is no
`POST /projects` — see below).

**Screens:** Project detail (team members, linked contract, tasks list), Task board per
employee dashboard.
**Rules:** team members addable by Manager/Admin only (implemented narrowly — *this specific
project's* manager, or admin, not any user holding the manager role globally); task start/stop
enforces one in-progress task per employee server-side.
**Endpoints (✅ marks what's built; note there is deliberately no `POST /projects` — a project is
only ever created via the customer module's contract automation, §7.2/§6.3/§6.4):**
```
GET    /projects                                                                      ✅ built
GET    /projects/:id                                                                  ✅ built
POST   /projects/:id/team           add/remove member                                 ✅ built
GET    /projects/:id/tasks                                                            ✅ built
POST   /tasks                       (assign)                                          ✅ built
PATCH  /tasks/:id/start             rejects if another task already in_progress for user ✅ built
PATCH  /tasks/:id/stop                                                                ✅ built
```

### 7.4 Attendance

See §7.4b for **Live Location Tracking**, a related but separate `location` module (added
2026-07-13) that ties into an employee's open Attendance record.

✅ **Fully built and verified 2026-07-13** (31 tests, `npm test`, see `backend/README.md` →
Testing). Started as a minimal check-in/check-out slice (13 tests, same day, built for
`location`'s open-shift check, §7.4b) and extended to the complete scope below in the same task
that also built `leave` (§7.5) — "Full Phase 3." The `Attendance` model (§6.5) was extended, not
replaced — `connectivityGaps[]`/`workingHours` went from documented-but-unused to real, and
`checkIn.photoUrl`/`checkOut.photoUrl` went from present-but-always-null to actually populated
via Cloudinary. One open check-in at a time is still enforced server-side — the same "reject the
second one" pattern as the one-`in_progress`-task-per-employee rule (§6.4) — reusing, not
re-implementing, the "open record" query shape `location.service.js#findOpenAttendance`
established. No permission-registry entry for check-in/check-out/heartbeat — all three are facts
about your own shift, not `can()`-gated "view" actions, the same reasoning §7.4b already gives
for `POST /location/pings`. `GET /attendance/team`/`/report` **are** gated — see the new
`attendance.view_team`/`view_all` registry entries below.

**Connectivity-gap detection — design and reasoning (§6.5's spec here was intentionally terse:
"if network issue/logout during shift, ... mark red"):** a new `POST /attendance/heartbeat`
endpoint, which the client calls periodically while checked in. This is a **deliberately separate
concern from Location's GPS ping** (§7.4b) — not reused or coupled to it — since a heartbeat
carries no coords and exists purely to prove "the session is still alive"; conflating the two
would make Location's ping cadence and Attendance's gap-sensitivity the same tunable when they
answer different questions. The server can only ever detect a gap *retroactively*, at whichever
arrives first — the next heartbeat, or checkout: if more time has elapsed since the last proof of
life (a prior heartbeat, or check-in itself for the very first one) than
`ATTENDANCE_GAP_THRESHOLD_MINUTES` (new env var, optional, defaults to 10 minutes — roughly two
missed heartbeats at an expected ~2–5 minute client cadence before treating it as a real issue
rather than routine jitter), the entire silent window becomes one `connectivityGaps` entry
`{ start: <last proof of life>, end: <now> }`. Bookkeeping for this needed one field beyond §6.5's
list — `Attendance.lastHeartbeatAt` — see §6.5.

**`workingHours` — computed once at checkout:** gross shift duration (`checkOut.time -
checkIn.time`) **minus** total `connectivityGaps` duration, clamped to a minimum of 0. A gap
means the employee wasn't verifiably working during that window, so it shouldn't count toward
their hours — this is the reasoning behind subtracting rather than leaving gaps out of the
calculation entirely.

**Photo capture:** check-in/check-out accept a `photo`, either a base64 data URI (JSON body) or a
multipart file (`multer`, same pattern as Leads' CSV import) — both transports are supported on
the same route; `multer`'s middleware is a no-op on a non-multipart request, and
`attendance.validation.js` normalizes `coords` for both (a multipart body can only carry
`coords` as a JSON-stringified string field, not a real nested object). A photo is **mandatory,
enforced server-side** — revised after the initial build, where it was left optional on the
reasoning that "never a file-upload input" was a client-side UX constraint the API couldn't
meaningfully enforce. That reasoning didn't hold: smartrays.md's whole point in capturing a photo
is to prove physical presence at check-in/check-out, and that protection doesn't actually exist
if the API silently accepts a request with none — anyone hitting the endpoint directly, or a
modified client, bypasses it entirely. `attendance.validation.js#validatePhotoPresence` now
rejects (400) any request with neither `req.file` nor `req.body.photo`. New shared
`src/services/cloudinary.service.js` uploads to Cloudinary and returns only the secure URL — the
binary is never stored in MongoDB. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
`CLOUDINARY_API_SECRET` are now **required** env vars (previously optional, since nothing used
them yet).

**Location Tracking now proven to work end-to-end, not just against directly-seeded test data:**
one new test in `location.test.js` (not this module's own suite) checks in via the real
`POST /attendance/check-in`, pings via the real `POST /location/pings`, checks out via the real
`POST /attendance/check-out`, then pings again and confirms the 409 — no direct Mongoose writes
anywhere in that flow. `location.test.js`'s other tests still seed an open shift directly via a
`createOpenAttendance()` helper, deliberately, so each one isolates the specific location
scenario under test without an extra HTTP round trip; this one new test is what actually proves
the two modules' real endpoints connect. See §7.4b's "Build dependency" note, updated alongside
this to mark it resolved.

**Screens:** Check-in/out widget (camera capture via `getUserMedia`, geolocation via
`Geolocation` API — never a file-upload input), personal attendance timeline (red segments
for connectivity gaps), team/org attendance report.
**Endpoints (✅ marks what's built — full scope, as of 2026-07-13):**
```
POST   /attendance/check-in     {coords, photo(base64/multipart)}                     ✅ built
POST   /attendance/check-out    {coords, photo}                                       ✅ built
POST   /attendance/heartbeat    (new — not in the original endpoint list; connectivity-
                                 gap detection needed a distinct "still alive" signal)  ✅ built
GET    /attendance/me?month=                                                          ✅ built
GET    /attendance/team?month=          (manager scope: employeeId in {Users where managerId == req.user._id}) ✅ built
GET    /attendance/report?from=&to=&format=pdf|xlsx                                   ✅ built
```
Check-in/out photos upload directly to Cloudinary (§3/§11.6); `Attendance.checkIn.photoUrl` /
`checkOut.photoUrl` store the returned secure URL, not the binary.

**`GET /attendance/report` — built as groundwork for §7.11, not a one-off:** a new shared
`src/services/report.service.js` exports `generateExcelReport({sheetName, columns, rows})` (via
`exceljs`, already a dependency) and `generatePdfReport({title, rows, formatRow})` (via a new
`pdfkit` dependency) — generic document-building primitives, not Attendance-specific.
`attendance.service.js` supplies its own column/row shaping and calls these; the actual
streaming/buffer mechanics live in the shared service so the real cross-module reports pipeline
(§7.11, Phase 8) has two real functions to formalize/extend later instead of duplicated ad hoc
`exceljs`/`pdfkit` calls scattered across modules. Leads' existing `.xlsx` export
(`lead.service.js#exportLeadsToExcel`, built before this service existed) was deliberately **not**
migrated onto it — that code already works and is already tested, and migrating it wasn't part of
this task.

**Updated (Phase 8, §7.11) — `GET /attendance/report`'s response shape changed, a stated
breaking change:** the endpoint no longer streams the file directly; `attendance.controller.js`
now calls the new `report.service.js#generateReport` dispatcher (`module: "attendance"`)
internally — `generateAttendanceReport` itself is completely unchanged, still the function that
actually fetches and renders the data — and the response is now `{ downloadUrl }` (uploaded to
Cloudinary), matching §7.11's dispatcher exactly rather than leaving this endpoint as a special
case. `attendance.test.js`'s report tests were rewritten to assert against the real buffer the
mocked `uploadReportFile` was called with (the "PK"/"%PDF-" magic-number checks moved from the
streamed response body to the mock's captured argument, still proving a genuine file) and the
returned `downloadUrl`.

### 7.4b Live Location Tracking

✅ **Built and verified 2026-07-13** (19 tests, `npm test`, see `backend/README.md` →
Testing). Backend only at the time this section was written — **the frontend map UI is now
built too, see §7.18**. The API shape below (an ordered `{coords,
capturedAt}[]` for history, `{employeeId, coords, capturedAt}[]` for live) was deliberately
designed so that UI can be added later with no API changes.

Ties into Attendance (§7.4/§6.5) but lives in its **own module**, `location`
(own model/service/controller/routes/validation per §9) — not folded into `attendance/`,
matching how this project keeps each feature in its own module folder even when it depends on
another one's model (the same way `lead.service.js` already depends on the `User` model
cross-module).

**Data model:** see `LocationPing` in §6.5.

**Implementation decisions made during the build, not fully specified in this plan before now:**
- **`authorizeAny(module, actions[])`** was added to `authorize.middleware.js` — a small,
  generic extension (not location-specific) alongside the existing `authorize`/`requireAdmin`.
  Needed because `location` is the first module with more than one viewing tier
  (`view`/`view_team`/`view_all`): the route layer uses `authorizeAny` to gate "at least one
  of the three," while `location.service.js` resolves *which* tier(s) the user actually holds
  and builds the real visible-employee-id set (unioning grants, not just picking the widest —
  see the next point).
- **A user's visible-employee set is a union of every grant they hold, not just the widest
  one.** If a manager were ever also granted `view` on top of the `view_team` default (e.g. an
  admin override), an early-return "pick the broadest permission" implementation would have
  silently dropped their own visibility since `view_team` doesn't include self. Fixed by
  unioning all held grants instead.
- **Found and fixed a real bug in the existing `User` model, unrelated to `location.js` itself:**
  Mongoose's default `minimize: true` silently strips empty nested objects — including
  `permissions` entirely — from both what's saved and what's returned once every module inside
  it is empty. `permissions: {}` (an explicit "no grants at all," used to override a role
  default) was vanishing from `GET /auth/me`'s response instead of showing as `{}`. Fixed by
  setting `minimize: false` on the `User` schema (`user.model.js`) so `permissions` always
  faithfully reflects what's actually stored — relevant for §7.12's eventual
  permissions-management UI, which needs to show/edit the real state, not a state that
  silently disappears when empty. Caught by a test, not by inspection.
- **Role-based permission defaults (`getDefaultPermissionsForRole`, `permission.helper.js`)**
  are applied only inside `registerUser` (`auth.service.js`), not inside `can()` itself —
  `can()` remains a flat, role-unaware lookup exactly as before. This was specified in this
  plan already (§5's "`location.*` role defaults" note) but is confirmed here as implemented
  exactly that way, verified by three dedicated tests asserting the actual stored
  `permissions.location` value for a manager, a sales associate, and an explicit override.

**Rules:**
- A ping is only accepted if the employee currently has an **open** `Attendance` record
  (`checkIn` set, `checkOut` not yet set) — this is the *only* thing that enforces "tracking
  only happens during a shift." It deliberately doesn't duplicate any attendance status logic;
  it just queries the `Attendance` collection directly. No open record → **409 Conflict**, the
  ping is rejected and discarded — not silently accepted and dropped, since a client polling
  every couple of minutes needs a clear, visible signal to stop (e.g. right after check-out).
- Default ping interval: **2 minutes**, via `LOCATION_PING_INTERVAL_MINUTES` (default `2`, §3)
  — an env var, not a hardcoded number, specifically because the *client* reads it (via
  `GET /location/config` below) to schedule its own ping loop. Changing the tracking cadence
  should never require a client redeploy.
- **Live view** — latest ping per employee, restricted to employees who currently have an open
  Attendance record. A ping from someone who's since checked out isn't "live," it's history.
- **History view** — one employee's full ping trail for a single calendar day, meant to render
  as a path on a map. Frontend not built yet (no `frontend/` work has started); the API shape
  (an ordered array of `{coords, capturedAt}`) is exactly what a map polyline needs.

**Permissions — new `location` module, same mechanism as every other module, nothing new
invented:**

| Action | Scope | Admin | Manager/PM | Sales Associate | Employee | Customer |
|---|---|---|---|---|---|---|
| `view` | own pings only | ✅ (bypass) | – (not granted by default) | ✅ default | ✅ default | – |
| `view_team` | direct reports (§5/§11.9 `managerId` scoping) | ✅ (bypass) | ✅ default | – | – | – |
| `view_all` | everyone | ✅ (bypass) | – | – | – | – |

Checked through the exact same `can(user, "location", action)` helper as every other module —
`permission.helper.js` needs no changes. Admin always bypasses via the existing role check,
same as everywhere else.

**How the role defaults work without adding a second permission mechanism:** until now every
permission in this system defaulted to `false` and required an explicit admin grant (see
§7.0's note on `POST /auth/register`'s optional `permissions` object). For `location`
specifically, `registerUser` now pre-fills `permissions.location` based on role —
`{ view: true }` for `employee`/`sales_associate`, `{ view_team: true }` for `manager` — **but
only when the caller doesn't explicitly provide `permissions.location`**. An admin can still
override any user's grants exactly as before. This is a registration-time convenience, not a
new runtime mechanism: `can()` stays a flat, role-unaware lookup — it only ever reads whatever
ended up stored in `user.permissions`.

Note the asymmetry, carried over exactly as specified rather than smoothed out: a manager's
default is `view_team` only, **not** `view` — a manager isn't automatically granted visibility
into their *own* location trail unless an admin adds it explicitly. Flagging this here in case
it's an oversight rather than intentional; easy to change (add `view: true` to the manager
default) if so.

**Endpoints (as built):**
```
POST   /location/pings                      authenticate only, no module permission — every
                                             checked-in employee can always submit their own
                                             pings, regardless of who's allowed to *view* them.
                                             Body: { coords: {lat, lng}, capturedAt }.
                                             409 if no open Attendance record.
GET    /location/live                       authorizeAny("location", ["view","view_team","view_all"])
                                             — scoped the same way as leads/customers (§5/§11.9),
                                             resolved in the service, not the route (see
                                             implementation notes below): view → just self if
                                             checked in; view_team → direct reports who are
                                             checked in; view_all → everyone checked in. Returns
                                             the latest ping per employee.
GET    /location/history?employeeId=&date=  authorizeAny("location", ["view","view_team","view_all"])
                                             — employeeId optional (defaults to self), date
                                             optional (defaults to today). An out-of-scope
                                             employeeId returns 404, not 403, matching the
                                             precedent set in §7.1. Returns the day's ping trail
                                             ordered by capturedAt, shaped for a map polyline.
GET    /location/config                     authenticate only — returns
                                             { pingIntervalMinutes } so the client schedules its
                                             own ping loop instead of hardcoding the interval.
```

**Why `POST /location/pings` has no module-permission gate:** submitting a ping isn't a "view"
action — it's closer to attendance check-in/out, a fact about your *own* current shift, not a
query over anyone else's data. Every other module ties create/edit to its own permission
action (`leads.create`, etc.), but the `location` matrix above only defines `view`/`view_team`/
`view_all` — there's deliberately no `location.create`, since a ping isn't really "created" by
choice the way a lead is; it's an automatic side effect of having an open shift, already gated
by the 409-against-Attendance check. `authenticate` alone is the correct and sufficient gate.

**Build dependency — flagged explicitly when this section was written, now resolved.**
Originally: this feature ties into Attendance, but Attendance (§7.4) was Phase 3 and had not
been built yet at the time `location` was built — only `auth` and `lead` existed in code then.
`location`'s core rule (reject a ping with no open Attendance record) needed *some* `Attendance`
model to query against, so `location` was built first against a minimal placeholder model
(schema plus a way to identify an "open" record — `checkIn` set, `checkOut` unset), with real
check-in/check-out endpoints deferred.

**Resolved 2026-07-13:** the minimal Attendance check-in/check-out slice (§7.4) is now built —
`POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/me`. `location` was
never changed to accommodate it; it already queried the placeholder model by the exact shape
(`checkIn.time` set, `checkOut.time` null) that `attendance.service.js` now also produces through
real endpoints instead of direct test-only DB writes. Verified end-to-end in
`location.test.js`'s "End-to-end: real check-in/check-out via the attendance module" test: a real
`POST /attendance/check-in` unblocks a real `POST /location/pings`, and a real
`POST /attendance/check-out` blocks the next one — no direct Mongoose writes anywhere in that
flow. (Most of `location.test.js`'s other tests still seed an open shift directly via a
`createOpenAttendance()` test helper — deliberately, so each one isolates the specific location
scenario under test without an extra HTTP round trip; only this one new test exists to prove the
two modules' real endpoints actually connect.)

### 7.5 Leave

✅ **Built and verified 2026-07-13** (18 tests, `npm test`, see `backend/README.md` → Testing),
same task as the full Attendance build (§7.4) — "Full Phase 3." Leave cadence resolved in §11.7:
one paid leave per calendar month, no carry-over.

**Rules:** `scope=team` resolves to employees where `managerId == req.user._id` (§6.1/§11.9);
manager can view but not approve — only Admin can call `/approve` or
`/mark-unapproved-absence`. Requesting your own leave needs no `leave.*` grant at all (a
self-service action, same reasoning as Attendance check-in/out); viewing leave data — even your
own — does, mirroring `location`'s three-tier permission shape (`view`/`view_team`/`view_all`)
rather than the unconditional self-access pattern `attendance`/`users` use, since §7.5 gives the
caller an explicit `?scope=own|team|all` choice to check against, not an implicit union of
whatever's held.
**Endpoints:**
```
POST   /leave/request                                                                 ✅ built
GET    /leave?scope=own|team|all                                                      ✅ built
PATCH  /leave/:id/approve         (admin)                                             ✅ built
PATCH  /leave/:id/mark-unapproved-absence   (admin; sets isDoubleDeduction=true)       ✅ built
```
**Key invariants:** a `paid`-type approval is capped by the monthly quota (§11.7) — a single
request over 1 day is rejected outright, and a second approved paid leave in the same calendar
month for the same employee is rejected too, counting only that employee's other *approved*
paid-leave days (pending/rejected ones don't count against the quota). **The quota gate lives
entirely in `approveLeave`, not `requestLeave` (confirmed 2026-07-13, §11.7)** — submitting a
second paid request in the same month always succeeds (201, `status: "pending"`); only the
second *approval* attempt is rejected. `mark-unapproved-absence` is an unconditional admin
decree, not a normal approval — it works regardless of the record's current status and always
sets `isDoubleDeduction: true` per the 2x rule (smartrays.md).

### 7.6 Transport/Travel

✅ **Built and verified 2026-07-13** (28 tests, `npm test`, see `backend/README.md` → Testing).
Built initially as a standalone logging + reporting feature, with §11.4 ("does travel distance
feed payroll, or is it reporting-only?") deliberately left open; **§11.4 was resolved 2026-07-13
as part of the Payroll prerequisite work (§7.7 STEP 0b): yes, `TravelLog` feeds Payroll's
mileage reimbursement, but only entries someone with authority has explicitly approved** — see
the approval workflow below.
**Module folder is `src/modules/transport/`** (single lowercase word, matching every other module
folder's convention — `auth`, `lead`, `customer`, `project`, `leave`, etc.), with files named
`travelLog.*` (matching the actual model name, the same relationship `customer/`'s folder has to
its `customerActivity.model.js`).

**Endpoints (✅ marks what's built; `?scope=own|team|all` on the list endpoint is a deliberate
refinement of this section's original `?employeeId=&month=` shape, matching the explicit-scope
pattern §7.5/Leave already established — `?employeeId=` still exists too, as an optional further
narrowing within whatever the resolved scope permits):**
```
GET    /travel-logs?scope=own|team|all&employeeId=&month=                             ✅ built
POST   /travel-logs                 manual entry                                       ✅ built
PATCH  /travel-logs/:id/approve                                                        ✅ built
PATCH  /travel-logs/:id/reject                                                         ✅ built
GET    /travel-logs/report?format=pdf|xlsx                                             ✅ built
```
Uses Google Maps Distance Matrix server-side when origin/destination coords come from
attendance check-in/out (new `src/services/googleMaps.service.js`, no new npm dependency — calls
the REST API directly via Node's built-in `fetch`).

**Approval workflow (added 2026-07-13, resolves §11.4):** every `TravelLog` — `auto` or
`manual` — is created `status: "pending"`; nothing auto-approves. `PATCH
/travel-logs/:id/approve` and `PATCH /travel-logs/:id/reject` are gated by a **structural
relationship check** in `travelLog.service.js` (mirrors `resolveEmployeeIdForManualEntry`'s
existing shape for manual-entry attribution, not a new `can()` permission tier): allowed for
the target employee's own manager (`User.managerId` match) or an admin, rejected (403)
otherwise. Re-approving/re-rejecting an already-resolved log is rejected (409) — a travel log
can only be resolved once; there is no unwind/re-open endpoint in v1. `approvedBy`/`approvedAt`
are used generically for "who resolved this and when," covering both outcomes, not just
approvals — the same naming Leave's `approvedBy` already uses even for
`mark-unapproved-absence` (§7.5), which isn't a normal approval either. Route-level guard is
`authenticate` only, same as `POST /travel-logs`, since the actual authorization is structural
and enforced in the service.

**Auto-generation hooks into `attendance.service.js#checkOut` directly** — the same cross-module
direct-call pattern already used elsewhere (`location`→`Attendance`, `lead`→
`customer.service.js#createCustomer`), not a new event/callback mechanism. `generateAutoTravelLog`
is guaranteed to never throw: missing checkIn/checkOut coords, or a Google Maps failure, both just
mean no `TravelLog` gets created — checkout itself can never fail because travel logging failed.

**Manual entry is deliberately stricter than Leads' `ownerId`-forcing precedent:** self-service by
default; a manager may log on behalf of their own direct report, an admin on behalf of anyone —
but a plain employee/sales_associate naming someone else's `employeeId` is **rejected outright
(403)**, not silently redirected to themselves the way Leads silently forces `ownerId`. Leads'
silent redirect makes sense there (reassigning record ownership is low-stakes, the correct outcome
is unambiguous); asserting a fact about someone ELSE's physical travel is a different kind of
claim, and silently misattributing it instead of rejecting it outright would hide a real mistake.
If `distanceKm` is supplied directly it's used as-is (manual entries may not always have precise
coords); otherwise, if both coords are given, `distanceKm` is computed via Google Maps the same
way an auto-generated entry's is.

**Permission design:** `travelLogs.view`/`view_team`/`view_all` — mirrors `leave`'s three-tier
shape for the list endpoint (explicit `?scope=`, per-scope permission check, not an implicit
union), and mirrors `attendance`'s report gate (`view_team`/`view_all` only) for
`GET /travel-logs/report`, reusing `src/services/report.service.js`'s generic builders rather
than writing new PDF/Excel generation code. `sales_associate`/`employee` get `travelLogs.view:
true` by default; `manager` gets `travelLogs.view_team: true`.

**Updated (Phase 8, §7.11) — `GET /travel-logs/report`'s response shape changed, a stated
breaking change:** same migration as Attendance's report endpoint above —
`travelLog.controller.js` now calls `report.service.js#generateReport` (`module: "transport"`)
internally, `generateTravelLogReport` itself is unchanged, and the response is now
`{ downloadUrl }` instead of a streamed file. `travelLog.test.js`'s report tests were rewritten
the same way Attendance's were.

**Test coverage:** 28 tests, all passing — includes a dedicated side-by-side scope
test proving admin/manager/employee scoping simultaneously, plus (added 2026-07-13) **7** tests
for the approve/reject flow (verified via the actual test file — an earlier count of 6 here was
wrong): default-to-`pending` for both sources, manager-approves-own-report,
admin-can-reject, manager-blocked-for-non-report, non-manager/non-admin-blocked,
re-resolving an already-resolved log rejected with 409, and a nonexistent id returning 404.
`googleMaps.service.js` is mocked at
the module boundary (`vi.mock`) in `travelLog.test.js`, and also in `attendance.test.js`/
`location.test.js` since a real Attendance checkout now transitively calls it too — no test makes
a real Google Maps API call.

### 7.7 Payroll

✅ **Built and verified 2026-07-13** (25 tests — 19 in `payroll.test.js` (17 original + 2 for
the Sales Associate permission correction below) + 6 in
`src/cron/payrollCron.test.js` — `npm test`, see `backend/README.md` → Testing).
Two prerequisites were closed first, in the same task: `User.baseSalary` (§6.1) and TravelLog's
approval workflow (§6.5/§7.6, resolving §11.4). **Module folder is `src/modules/payroll/`**.

**Endpoints (✅ marks what's built; `?employeeId=` on the run endpoint is a stated addition
beyond this section's original literal list):**
```
POST   /payroll/run?month=&year=&employeeId=&regenerate=   (admin, or cron on the 1st)   ✅ built
GET    /payroll?scope=own|all&month=                                                     ✅ built
GET    /payroll/:id/payslip?format=pdf                                                   ✅ built
```
`?employeeId=` runs just that one employee; omitted, it bulk-runs every active employee with a
`baseSalary` set (what "cron on the 1st" itself calls). `?regenerate=true` (also a stated
addition — the "admin-only override" the original ask asked for a judgment call on) overrides
the "already generated" guard: a targeted `?employeeId=` run throws **409** without it; a bulk
run **silently skips** already-generated employees instead (idempotent for a cron that fires
twice), with `regenerate=true` overriding both the same way (recomputes the same document in
place — enforced by a compound unique index on `employeeId`+`month`+`year`, not a duplicate
record). Employees with no `baseSalary` set (every `admin` account included) are skipped in a
bulk run, not errored; a targeted run for one is rejected outright (400).

**`runPayroll`'s formulas, implementing this section's original spec exactly:**
- `daysInMonth` — actual calendar days in that month/year.
- `presentDays` — count of `Attendance` records with status `present`/`half_day` that month.
- `paidLeaveDays` — sum of inclusive days across approved `paid` `Leave` that month (capped at 1
  in practice by `leave.service.js#approveLeave`'s own monthly quota, §11.7 — this sums whatever
  is actually approved, it doesn't re-enforce the cap here).
- `unpaidDeductionDays` — approved `unpaid` `Leave` days, plus approved `unapproved_absence`
  days doubled, driven by the existing `isDoubleDeduction` flag already on the `Leave` model.
- `workingHoursTotal` — sum of `Attendance.workingHours` for the month.
- `grossAmount` = `(baseSalary / daysInMonth) × (presentDays + paidLeaveDays)`.
- `mileageReimbursement` = sum of `distanceKm` from that employee's **`status: "approved"`**
  `TravelLog` entries that month (never `pending`/`rejected`) × `MILEAGE_RATE_PER_KM` (§3, new
  env var — a deliberately simple v1, one single global rate, not per-role/per-project, stated
  explicitly as a simplification; the default value is a placeholder the client must confirm).
- `netAmount` = `grossAmount − (unpaidDeductionDays × dailyRate) + mileageReimbursement`.
- `paidOn` = the 1st of the month after the payroll month.

Leave records are attributed to the month containing their `startDate` (mirrors
`leave.service.js`'s own monthly-quota window) — a stated v1 simplification: paid leave is
capped at 1 day and unpaid/absence spans are short in practice, so a split-across-months day
count wasn't worth the added complexity.

**`Payroll.mileageReimbursement`** — not in §6.5's documented field list, added the same way
Attendance's `lastHeartbeatAt` was: necessary once §11.4 resolved to "yes, it feeds payroll,"
and there's nowhere else on the model to record the resulting amount. Already folded into
`netAmount`; kept as its own field too so a payslip can show it as a separate line item.

**Monthly cron (`src/cron/payrollCron.js`, a new top-level directory — not folded into
`src/services/`, since scheduled-job orchestration is a distinct concern from the stateless
external-service wrappers already there):** registered from `server.js` after the database
connects; runs at 00:05 on the 1st of every month, bulk-running Payroll for the **previous**
calendar month — matches smartrays.md's "salary paid on the first day of every month" cadence.
Calls `payroll.service.js#runPayroll` directly, the same cross-module direct-call pattern used
elsewhere (attendance→travelLog) — no HTTP request to run through the admin-gated route.

**Permission design:** new `payroll: ["view", "run"]` registry entry — only two actions, no
`team` tier at all (§5's matrix: Manager gets no payroll grant whatsoever, a deliberate
divergence from every other workforce module — salary data is more sensitive than
attendance/leave/travel data). `run` doubles as the "administrative access" gate for
`scope=all` on the list endpoint too, since the matrix never lists a separate `view_all` and
only admin ever holds `run` anyway. Only `employee` defaults to `payroll.view: true` ("own
payslip only") — §5's matrix marks `sales_associate` with an explicit "–" for `payroll.view/run`,
the same symbol it uses for Manager's "no access at all," **not** a blank/unspecified cell.

**Correction (2026-07-13):** the initial build of this module misread that "–" as unspecified
and granted `sales_associate` the same `payroll.view: true` default as `employee` — reasoning
it was a spec oversight, by analogy to the symmetric `sales_associate`/`employee` treatment
Leave/Attendance/TravelLog already get. That analogy doesn't hold here: this cell isn't blank,
it's an explicit "–", identical to Manager's. Fixed in `permission.service.js`'s
`INITIAL_TEMPLATE_DEFAULTS.sales_associate` — the `payroll` key was removed entirely, so
`sales_associate` now gets no payroll access by default, matching Manager. A `sales_associate`
with no per-user override gets **403** on `GET /payroll` (the list endpoint's explicit
scope-permission check) and **404** on `GET /payroll/:id/payslip` for their own record (falls
through `getPayslip`'s same not-self-or-broad-grant branch as any other out-of-scope lookup —
see below).

**`GET /payroll/:id/payslip` mirrors `user.service.js#getUserById`'s exact shape:** the
`payroll.run` broad grant bypasses to any record; otherwise self-scoped and gated behind
`payroll.view`; 404-not-403 for anything else, matching the Leads/Location/User precedent for
single-record out-of-scope lookups. This means a caller who IS the record's own employee but
lacks `payroll.view` still gets 404, not 403 — the endpoint doesn't distinguish "this isn't your
record" from "you can't see records at all," the same collapsed signal every other single-record
lookup in this codebase uses.

19 tests (17 original + 2 for the Sales Associate correction above), no application bugs found.
Covers the full formula computation against hand-computed
expected values, the 409-vs-silently-skip distinction between a targeted and a bulk re-run,
`regenerate=true` recomputing in place, `scope=own`/`all` access (manager blocked from
`scope=all`; `sales_associate` blocked from `GET /payroll` entirely with 403), and payslip
access (self succeeds for `employee`, admin succeeds for anyone, an unrelated employee gets 404,
a manager gets 404 even for their own direct report, a `sales_associate` gets 404 even for their
own record, unsupported `format` rejected).

**Cron job coverage — 6 more tests, `src/cron/payrollCron.test.js`:** the job body was pulled
out into a separately exported `runMonthlyPayrollJob(referenceDate = new Date())`, taking the
reference date as a parameter specifically so tests never need to wait on a real cron fire or
fake global `Date`/timers (risking destabilizing `mongodb-memory-server`/Mongoose's own internal
timer usage) — three tests seed a real employee with a real `baseSalary`, call the job directly
with a fixed reference date, and confirm it produces the exact same `Payroll` record a manual
bulk `POST /payroll/run` would (idempotent on a repeat call, skips an employee with no
`baseSalary`). `resolvePreviousMonth` (pure date math) is tested directly — same-year case and
the January→prior-December wraparound. `registerPayrollCron` is tested by mocking `node-cron`'s
`schedule` export (`vi.spyOn`) and asserting it's called with the exact `"5 0 1 * *"` expression
— nothing is ever left actually scheduled against a real timer during the test run.

### 7.8 Support & Ticketing

✅ **Built (Phase 5)** — 35 tests (`ticket.test.js`), no application bugs found. Two-part task:
(A) Customer Portal self-signup — see §7.0 for the full write-up (User/auth-side); (B) the
`Ticket` module itself, below. Module folder is `src/modules/ticket/`.

**Screens:** Internal ticket list + assignment (Admin/Manager), Employee "my tickets" view,
Customer Portal ticket raise/status/history (portal only shows the customer's own tickets;
internal visibility into portal-raised tickets is Admin/PM only per smartrays.md — "PM" is
covered by `manager`, per the employee/executive-merge decision, §11.1).

**Endpoints (✅ marks what's built — matches the original literal list exactly, no additions
or omissions):**
```
POST   /tickets                       (internal raise, or customer portal raise)             ✅ built
GET    /tickets?scope=all|assigned|own                                                        ✅ built
PATCH  /tickets/:id/assign                                                                    ✅ built
PATCH  /tickets/:id/status                                                                    ✅ built
POST   /tickets/:id/comments                                                                  ✅ built
POST   /tickets/:id/attachments        uploads to Cloudinary, stores returned URL             ✅ built
```
No dedicated `GET /tickets/:id` — deliberately not added beyond this literal list. Every
mutating endpoint above (`assign`/`status`/`comments`/`attachments`) returns the full updated
`Ticket` document (including its current `history[]`), the same "return the mutated record"
convention already used everywhere else (`PATCH /leave/:id/approve`, `PATCH
/travel-logs/:id/approve`, etc.) — so a frontend never actually needs a separate detail fetch.

**Creation (`POST /tickets`) branches by role, both requiring `tickets.create`:**
- **Internal** (admin/manager): `customerId` is required in the body and must reference a real
  `Customer` — there's no self-scoping to derive it from, unlike every "self-service" endpoint
  elsewhere in this codebase. `category` is optional (defaults to `"other"`); `assignedToId` is
  an optional convenience for create-and-assign in one step (`PATCH /tickets/:id/assign` still
  exists for later reassignment).
- **Portal** (customer): `customerId`/`raisedByCustomerId` are always derived from
  `req.user.customerId`/`req.user._id` — never trusted from the body, the same "self-service,
  don't trust client-supplied ownership" pattern as Leads' `ownerId` forcing and TravelLog's
  `employeeId` resolution. `category` is **always forced to `"other"`**, regardless of anything
  sent — portal users are never asked to categorize; an admin/manager can only currently set it
  at internal-creation time (there's no separate recategorize action in this build — a stated
  known deviation, see below).
- Both paths require `subject` (short title) and `description` (the initial free-text
  explanation, becoming the first `history[]` comment entry) in the body.

**Listing (`GET /tickets?scope=`):** `scope=all` needs `tickets.view_all` (admin/manager —
**everything, including portal-raised tickets**, per smartrays.md's "internal visibility ...
Admin/PM only"); `scope=assigned` needs `tickets.view_assigned` (employee — only tickets
`assignedToId` matches them); `scope=own` needs `tickets.view_own` (customer — only tickets
where `customerId` matches `req.user.customerId`, never another company's). Unlike
Leave/TravelLog/Payroll, a missing `?scope=` does **not** default to "own" — Ticket has no
universal "own" tier the way those modules do (an admin/employee has no "own tickets" concept
at all). Instead it resolves to whichever tier the caller's role actually holds, in priority
order `all` > `assigned` > `own` — a stated, deliberate divergence from the rest of this
codebase's list-endpoint convention.

**Assign (`PATCH /tickets/:id/assign`):** `tickets.assign` (admin/manager only) — no structural
check on top of that, the same shape as `PATCH /leave/:id/approve`'s plain admin gate.
`assignedToId` must reference a real `User` (400 otherwise).

**Status change (`PATCH /tickets/:id/status`):** §6.6/§7.8 are silent on which transitions are
allowed — **this allows ANY transition** (including "backwards", e.g. `closed` → `open`, a
ticket legitimately needing reopening) and just logs it in `history[]`; a stated assumption,
not an invented state machine the spec never asked for. Permission is a **structural** check,
not a single route-level tier (mirrors TravelLog's approve/reject): allowed for admin/manager
(anyone holding `tickets.assign`) **or** the ticket's own assigned employee (smartrays.md: the
assignee "work[s] on it", implying they progress its status) — nobody else, notably not the
raising customer. A caller who can't even **view** the ticket at all gets **404** (matches the
Leads/Location/User/Payroll out-of-scope precedent); a customer who legitimately CAN view their
own ticket but tries to change its status gets **403** instead — a different signal ("you can
see this, but you can't do that") from "this doesn't exist for you at all".

**Comments (`POST /tickets/:id/comments`):** "anyone with view access to a specific ticket can
comment" (admin/manager always; employee if assigned; customer if it's their own company's
ticket) — no narrower permission than the same view-access check status-change uses for its
404 case, deliberately with no extra 403 layer on top (unlike status-change, which does add
one) since the spec explicitly opens commenting to everyone who can see the ticket at all.

**Attachments (`POST /tickets/:id/attachments`):** reuses
`src/services/cloudinary.service.js#uploadTicketAttachment` (a new export alongside the existing
`uploadAttendancePhoto`, sharing the same Cloudinary client/config — not a duplicated upload
implementation) — `resource_type: "auto"` since a ticket attachment isn't guaranteed to be an
image the way an attendance photo is. Accepts the same either-transport shape Attendance's
photo capture established (multipart `req.file`, or a base64 data URI in `req.body.attachment`).
Gated by the same view-access check as comments — treated as part of the same "add information
to this ticket" family of actions, a stated inference since §7.8 doesn't say otherwise.

**Permission design — new `tickets: ["create", "assign", "view_all", "view_assigned",
"view_own"]` registry entry**, matching §5's matrix exactly (see §5 for the full row-by-row
mapping): `manager` gets `create`/`assign`/`view_all` (covers "PM"); `employee` gets only
`view_assigned` (no `create` — employees don't raise tickets themselves in this design);
`customer` gets `create`/`view_own` (§7.12's new template, added this task); `sales_associate`
gets **nothing** — the matrix marks both ticket rows "–" for that role.

**Known deviations:**
- **§11.2 (category vs. lifecycle status split) — ✅ resolved by this build**: the split itself
  (separate `category` and `status` fields, rather than smartrays.md's single overloaded
  `status`) is adopted and built. The **exact enum of category values**
  (`new_project`/`existing_client_query`/`other`) remains something to confirm with the client
  if the list ever needs to grow — that detail, not the shape decision, is what's still
  genuinely open.
- No separate "recategorize" endpoint — `category` is set once at creation (internal callers
  can specify it directly; portal callers always get `"other"`) and isn't independently
  PATCH-able afterward in this build. Worth adding later if staff need to reclassify a
  portal-raised ticket without going through `PATCH /tickets/:id/status`.
- `subject` was added beyond §6.6's documented field list (see §6.6) — a resolved gap, not a
  silent one.

**Test coverage:** 35 tests, no application bugs found on the first implementation. Covers:
create (internal admin/manager raise with `customerId` required and validated,
create-and-assign in one step, portal raise auto-scoped and forced to `category: "other"`
regardless of what's sent, `sales_associate`/`employee` both blocked with 403, missing/invalid
`customerId`/`subject`/`description` rejected); list scoping (`scope=all` sees everything
including portal-raised tickets — checked separately for **both** admin and manager, since
manager's "PM" access is its own distinct grant rather than admin's blanket bypass;
`scope=assigned` sees only the caller's own assignments, not every ticket; `scope=own` sees
only the caller's own company and **explicitly cannot** see another's — tested directly with
two `Customer`s from two different companies, checked in both directions; `sales_associate`
blocked entirely; a customer requesting `scope=assigned` blocked; the role-based default-scope
resolution; an invalid scope rejected); assign (admin/manager only, a nonexistent assignee
rejected, employee/customer blocked, a nonexistent ticket 404s); status (the assigned employee
can change it and the resulting history entry has the right `fromStatus`/`toStatus`,
admin/manager can change it without being the assignee, an unrelated employee 404s, a customer
on their own ticket gets 403 not 404, a backwards transition like `closed`→`open` is allowed and
logged, an invalid status rejected); comments (admin/manager/assigned-employee/own-company-
customer can all comment, an unrelated employee or a different company's customer both get
404, an empty comment rejected); **history ordering** (a mixed sequence — initial raise, a
comment, a status change, another comment, a final status change with an accompanying comment —
is asserted to appear in `history[]` in the exact order it happened, not just as isolated
single-entry checks); and attachments (a valid upload via the mocked Cloudinary
service appends the returned URL, a request with no file is rejected).

### 7.9 Payments (Admin-only tab)

✅ **Built (Phase 7)** — 16 tests (`payment.test.js`), no application bugs found. Module folder
is `src/modules/payment/`.

**Endpoints (✅ marks what's built — matches the original literal list exactly, plus
`invoiceId` added to the body per the resolved reconciliation design below):**
```
GET    /payments                                                               ✅ built
POST   /payments   {customerId|manualClientName, date, amount, notes, invoiceId?}  ✅ built
```
Both admin-only (`payments.view`/`create`) — §5's matrix marks every other role "–" for this
module, so there's no ownership scoping at all, unlike every other feature module in this
codebase; a plain route-level `authorize()` gate is sufficient.

**§11.3 resolved (Payments use PARTIAL RECONCILIATION, not a fully standalone log and not full
invoicing):**
- When a `Payment` has a real `customerId` **and** an `invoiceId`, the linked `Invoice`
  (validated to actually belong to that `customerId` — 400 if it belongs to a different
  customer) has its `balance` reduced by the payment amount. Reaching exactly 0 →
  `Invoice.status: "paid"`; anything left over → `Invoice.status: "partially_paid"` (the value
  added to `INVOICE_STATUSES` for this task — see §6.6). An overpayment clamps the balance to 0
  rather than going negative — a stated v1 simplification, no refund/credit tracking exists.
  Reconciling against an invoice with no `balance` set (a `draft` created without a
  `Contract.amount`, §6.3) or a `cancelled` invoice is rejected (400) — neither has a sensible
  balance to reduce.
- When a `Payment` has only `manualClientName` (no `customerId`) — or a `customerId` with no
  `invoiceId` — it's a standalone log entry with nothing to reconcile against. **This is
  expected, not a gap**: not every payment is tied to a specific invoice (e.g. a walk-in cash
  client, or a customer paying informally outside the invoicing flow).
- This does **not** mean full invoicing exists now — auto-numbering, recurring generation, and
  ledger views all remain out of scope (Phase 7's `Invoice` is still the minimal placeholder
  model from §6.3/§7.2). Only the balance/status update on an *existing* `Invoice`, and only
  when a payment is explicitly linked to one.

**Validation:** exactly one of `customerId`/`manualClientName` must be provided (never both,
never neither); `invoiceId` can only be provided alongside a `customerId` (an invoice always
belongs to a real customer, so a manual-only payment has nothing to link to).

### 7.10 AMC

✅ **Built (Phase 7)** — 20 tests (`amc.test.js`), no application bugs found. Module folder is
`src/modules/amc/`.

**Endpoints (✅ marks what's built, matches the original literal list exactly):**
```
GET    /amc                                                                    ✅ built
POST   /amc   {flow: 'new_customer'|'existing_customer', customerId?, newCustomerPayload?}  ✅ built
PATCH  /amc/:id                                                                ✅ built
```

**The two-flow creation (smartrays.md: "AMC ... ask which create client or convert client"):**
`flow: "new_customer"` creates a real `Customer` inline — reuses
`customer.service.js#createCustomer` directly (the same cross-module direct-call pattern
already used elsewhere, e.g. lead→customer conversion, not a duplicated creation path) —
before creating the AMC record against the newly-created customer's id.
`flow: "existing_customer"` requires `customerId`, which must reference a real `Customer`
**within the requesting user's ownership scope** (see below) — validated with the same
structural pattern used throughout this codebase, not a separate permission tier.

**Permission design — "Manager = PM" clarification:** §5's matrix gives `amc.view`/`edit` a
scoped tier per role — Manager: "own team", Sales Associate: "own", Employee/Customer: "–".
Unlike Leads/Customers (which have their own `ownerId` field to scope by directly), **AMC has
no `ownerId` of its own** — its only link to ownership is indirect, through `customerId` →
`Customer.ownerId`. So "own team"/"own" here means "AMC records whose underlying Customer is
owned by (a) themselves, or (b) — for a manager — one of their direct reports", exactly
mirroring how Leads/Customers already resolve their own ownership scoping, just one hop
further through `Customer` instead of a direct field. Implemented via a new
`customer.service.js#getVisibleCustomerIds(requestingUser)` export (returns `null` for admin —
meaning "unrestricted" — or the visible `Customer` id list otherwise) rather than duplicating
the ownership-scoping logic a second time. `PATCH /amc/:id` on an out-of-scope record is
**404** (not 403), matching the Leads/Location/Customer precedent for not confirming whether
an out-of-scope record exists.

**Known deviations:** none from the ask. No automation on renewal for v1 — `status` only
changes via an explicit `PATCH /amc/:id`; nothing watches `renewalDate` and flips it to
`"expired"` automatically. No cross-linking to `Contract`/`Invoice` either. Both stated,
deliberate v1 simplifications per this task's own instruction, not oversights.

### 7.11 Reports

✅ **Built (Phase 8)** — 24 tests (`report.test.js`), no application bugs found. Module folder
is `src/modules/report/`.

Shared report-generation service consumed by attendance, leave, payroll, transport, leads,
and customers rather than one-off generators — single `POST /reports/generate` with
`{module, filters, format}` dispatching to per-module data-fetchers behind one PDF/Excel
renderer. The generated file is uploaded to Cloudinary (§3/§11.6) and the response returns a
download URL rather than streaming the binary through the API server.

**`report.service.js`'s dispatcher** pairs, per supported `module` (exactly the six named
above), a coarse access check with a data-fetch+render step:
- **`attendance`/`transport`** already had a combined fetch-and-render function from their own
  earlier builds (`generateAttendanceReport`/`generateTravelLogReport`, §7.4/§7.6) — the
  dispatcher calls those **directly, unmodified**, rather than splitting them apart or
  duplicating their column/row shaping.
- **`leave`/`payroll`/`leads`/`customers`** had no existing report-rendering code, only a
  scoped list/query function (`listLeaves`/`listPayroll`/`listLeads`/`listCustomers`). The
  dispatcher calls those existing functions **unmodified** to fetch data, then does its own
  **new** column/row shaping via the shared `generateExcelReport`/`generatePdfReport`
  primitives — this rendering code is new to this task and lives in `report.service.js`
  itself, not inside each source module (which stay untouched aside from the migration below).
  `leads`'/`customers`' owner names and `leave`'/`payroll`'s employee names are populated
  after the fact (`Model.populate(records, ...)`) without needing to modify the list functions
  themselves.

**No new `reports.generate` permission** — access is gated per-`module` by reusing `can()`
against that module's **own existing** permission actions, via a small internal
module→access-check map, not a parallel permission mechanism. The check is deliberately coarse
("can this role attempt a report from this module at all") — for modules with more than one
scope tier (`attendance`/`transport`: `view_team` OR `view_all`; `leave`: any of
`view`/`view_team`/`view_all`), holding any one qualifying grant passes it, and the module's
own data-fetcher (still called by the dispatcher) resolves the actual scope and may itself
reject a broader one than the caller holds (e.g. `listPayroll` still 403s a manager or an
employee requesting `scope=all`/team without `payroll.run`). For `payroll`/`leads`/`customers`
(single-tier modules), the check is just `can(user, module, "view")`.

**Scoping is never re-implemented** — the dispatcher fetches data **as the requesting user**,
through each module's existing scoped function, the same one that module's own list/report
endpoint already uses. A manager requesting an `attendance` report gets exactly their team's
data, proven in `report.test.js` by asserting the dispatcher's report contains the exact same
employee set `GET /attendance/team` independently returns for the same manager.

**BREAKING CHANGE (intentional — no frontend exists yet to break):** `GET /attendance/report`
and `GET /travel-logs/report` now internally call this same dispatcher instead of duplicating
report generation, and their response changed from **streaming the file directly** to
returning **`{ downloadUrl }`** (uploaded to Cloudinary) — matching this section's stated
behavior exactly, rather than leaving those two endpoints as a special case. Existing tests for
both were rewritten to assert against the real buffer the mocked `uploadReportFile` was called
with (still proving a genuine, well-formed file — the "PK"/"%PDF-" magic-number checks are
unchanged, just moved from the streamed response body to the mock's captured argument) and the
returned `downloadUrl`, instead of a streamed response body.

**Explicitly out of scope:** `GET /payroll/:id/payslip` was **not** migrated and stays exactly
as it was (a direct PDF stream) — it's a single-document artifact, not a filtered-list report,
so it doesn't fit the dispatcher pattern (§7.7's own stated PDF-only, no-xlsx-option design is
unrelated to and unaffected by this task). A dedicated regression test in `payroll.test.js`
proves this endpoint still streams `application/pdf` directly rather than returning
`{ downloadUrl }`. Leads' `GET /leads/export` also stays exactly as-is
— a deliberately separate, pre-existing CSV/Excel export, unrelated to and not migrated onto
this dispatcher; the new `leads` module report is additive (reuses `listLeads`, not
`exportLeadsToExcel`), not a replacement.

**Per-module `filters` validation (`report.validation.js`) reuses each target module's own
existing query validator** rather than duplicating its checks — each one called as a plain
function against a `{ query: filters }` stand-in, the same call-the-existing-middleware-directly
pattern §7.10's `amc.validation.js` already established for
`customer.validation.js#validateCreateCustomerInput`:
- `attendance`/`transport` reuse their own `validateReportQuery` (from/to must parse as dates,
  from ≤ to).
- `leave` reuses `validateScopeQuery` (scope must be own/team/all).
- `payroll` reuses `validateListQuery` (scope must be own/all — Payroll has no `team` tier;
  month format).
- `leads`/`customers` have no dedicated query-validator middleware of their own to reuse — their
  list endpoints run unvalidated today — so their `status` filter, if given, is checked directly
  against `LEAD_STATUSES`/`CUSTOMER_STATUSES`, the same enum source their body validators already
  import, rather than a new hardcoded list.

This closes a gap from the initial build, where `filters` was only checked for being a plain
object, not for a shape sane for the requested module. It also brought test rigor up to a
consistent bar across all six modules: every module's success-path test now asserts the real
magic-number file signature ("PK" for xlsx / "%PDF-" for pdf) on the buffer the mocked
`uploadReportFile` was called with, not just the ones (`attendance`/`transport`/`customers`)
that already did.

### 7.12 Permissions

✅ **Built and verified 2026-07-13** (20 tests, `npm test`, see `backend/README.md` →
Testing). Formalizes the pattern already used ad hoc for `location` (role defaults +
per-user admin override, built during §7.4b) into one real module, replacing the hardcoded
`getDefaultPermissionsForRole()` workaround in `permission.helper.js` with a proper
admin-editable template system. Three pieces, each with a distinct, deliberately separate role:

**Governed by §4.1 (Single Source of Truth for Auth):** this is precisely why editing a
template is non-retroactive but editing a *user's* permissions takes effect on their very next
request. Templates only ever influence what gets written into `User.permissions` at the
moment `registerUser` runs; after that, every authorization check reads the live
`User.permissions` document fresh, every time, with nothing cached — so a
`PATCH /users/:id/permissions` call is visible to that user immediately, with no re-login and
no token reissue required.

- **`PERMISSION_REGISTRY`** (hardcoded, `src/constants/permissionRegistry.constants.js`) — a
  structural list of every module and its valid actions, e.g.
  `{ leads: ["view","create","edit","delete"], location: ["view","view_team","view_all"],
  permissions: ["manage"] }`. **Not admin-editable** — it only grows when a developer builds a
  new module and adds its permission actions to the registry alongside the route/service code
  that actually checks them. It exists so templates and per-user overrides can be validated
  against a known set of real module+action pairs (reject anything not in the registry, so a
  typo or a stale permission for a since-removed action can't silently do nothing) and so a
  future frontend can render toggles without hardcoding the list twice.
- **`RolePermissionTemplate`** (§6.1, DB, admin-editable) — what's **granted by default** to a
  role. Editing a template **only affects users created after the edit** — never retroactive.
  This mirrors how the original `getDefaultPermissionsForRole()` worked, just moved from a code
  constant into the database so an admin can change it without a deploy.
- **`User.permissions`** (§6.1, DB, per-user) — what's **actually granted** to one specific
  person. Seeded from their role's template at account-creation time
  (`registerUser`, `auth.service.js` — now reads the template from the DB instead of calling
  the hardcoded function), then independently editable per-user by an admin from then on,
  exactly as it already was for every other module.

**Initial registry contents** (only the modules that exist in code today — `leads`, `location`,
`permissions`, `users` (§7.0b), `customers`/`credentials`/`projects`/`tasks` (§7.2/§7.3),
`attendance`/`leave` (§7.4/§7.5), and `travelLogs` (§7.6, added 2026-07-13); grows as later
phases build payroll/etc.):
```
leads:       view, create, edit, delete
location:    view, view_team, view_all
permissions: manage
users:       view_team, view_all
customers:   view, create, edit, delete
credentials: view
projects:    view, assign_team
tasks:       view, assign
attendance:  view_team, view_all
leave:       view, view_team, view_all
travelLogs:  view, view_team, view_all
```

**Initial template seed values** (lazily created per role on first fetch, same pattern as
`LeadSource`, §7.1) — **revised 2026-07-13, superseding the "carried over unchanged" note this
originally had.** Now generated directly from §5's permission matrix instead of only from the
old hardcoded `location` defaults: every ✅ in that matrix becomes a `true` grant in the
matching role's template. This is a **deliberate broadening**, not a silent one — §5's matrix
already documented that Manager/Sales Associate should have real Leads access ("own team" /
"own"), it just wasn't wired up as an actual default until now, since there was previously no
mechanism to apply role defaults for anything but `location`. Location's values are unchanged
from before. `users.view_team` for `manager` was added 2026-07-13 alongside §7.0b.
`customers`/`credentials`/`projects`/`tasks` were added the same day alongside §7.2/§7.3:
manager gets full `customers` CRUD + `credentials.view` + `projects`/`tasks` view+assign (they
run delivery); sales_associate gets full `customers` CRUD (same as Leads — they convert deals)
but no `credentials`/`projects`/`tasks` access; employee gets `projects`/`tasks` view only (they
do the work, they don't assign it). `attendance`/`leave` were added 2026-07-13 alongside §7.4/§7.5:
manager gets `attendance.view_team`/`leave.view_team` (oversees their team's attendance and
leave, though only admin can approve/mark-unapproved-absence); sales_associate/employee get
`leave.view: true` (their own requests) — there's no equivalent `attendance.view` grant needed,
since Attendance's own-record access is unconditional rather than permission-gated. `travelLogs`
was added the same day alongside §7.6, mirroring `leave`'s exact shape: manager gets
`travelLogs.view_team: true`, sales_associate/employee get `travelLogs.view: true`.
```
admin:            {}   (irrelevant — admin always bypasses can(), §5)
manager:          { leads: { view: true, create: true, edit: true, delete: true },
                     location: { view_team: true },
                     users: { view_team: true },
                     customers: { view: true, create: true, edit: true, delete: true },
                     credentials: { view: true },
                     projects: { view: true, assign_team: true },
                     tasks: { view: true, assign: true },
                     attendance: { view_team: true },
                     leave: { view_team: true },
                     travelLogs: { view_team: true } }
sales_associate:  { leads: { view: true, create: true, edit: true, delete: true },
                     location: { view: true },
                     customers: { view: true, create: true, edit: true, delete: true },
                     leave: { view: true },
                     travelLogs: { view: true } }
employee:         { location: { view: true },
                     projects: { view: true },
                     tasks: { view: true },
                     leave: { view: true },
                     travelLogs: { view: true } }
customer:         {}
```

**Validation rule, applied to both template edits and per-user overrides:** every key in a
submitted `permissions` object must be a module that exists in `PERMISSION_REGISTRY`, every
action key under it must be one of that module's registered actions, and every value must be a
boolean — reject (400) anything else. This is what makes the registry load-bearing rather than
decorative.

**Endpoints:**
```
GET    /permissions/registry          authorize("permissions","manage") — returns
                                       PERMISSION_REGISTRY as-is, for a future frontend to
                                       render toggles from a single source of truth
GET    /permissions/templates         authorize("permissions","manage") — all 5 role templates,
                                       lazily seeding any that don't exist yet
GET    /permissions/templates/:role   authorize("permissions","manage") — one role's template
PATCH  /permissions/templates/:role   authorize("permissions","manage") — edit one role's
                                       template (validated against the registry); sets
                                       updatedBy/updatedAt; does not touch existing users
GET    /users/:id/permissions         authorize("permissions","manage") — one user's actual
                                       permissions (a user's own permissions are already
                                       visible to them via GET /auth/me, §7.0 — this endpoint
                                       is for an admin inspecting someone else's)
PATCH  /users/:id/permissions         authorize("permissions","manage") — admin override for
                                       one specific user (validated against the registry).
                                       A full replace, not a deep merge — matches
                                       PATCH /permissions/templates/:role's semantics.
POST   /users/:id/permissions/reset   authorize("permissions","manage") — overwrites this
                                       user's permissions with their role's CURRENT template,
                                       discarding any per-user customization. Reads the
                                       template fresh at call time, not whatever it looked
                                       like when the user was created or last customized.
```

No `POST /permissions/templates` — roles are a fixed 5-value enum (§6.1), not user-defined, so
templates are never "created" by a caller, only lazily seeded (GET) and edited (PATCH), exactly
like `LeadSource` never gets a create endpoint either (§7.1).

Gated by `permissions.manage` (§5) rather than `requireAdmin` — even though in practice only an
admin will ever hold that grant, using the same `can()`-backed mechanism as every other module
keeps this module self-consistent rather than a special case, and leaves room for a future
non-admin "permissions manager" role without an endpoint rewrite.

### 7.13 Dashboards
One dashboard shell (`/dashboard`) that composes widgets by role + permissions, rather than
four separate Admin/Manager/Sales/Employee dashboard codebases — avoids duplicating
list/filter/detail components four times.

---

### 7.14 Frontend Phase 0 (Scaffold + Auth + Routing Shell)

✅ **Built 2026-07-16** — mirrors what backend Phase 0 established: the foundation every
later frontend task builds on, not full-featured pages. No automated-test module list to
report per-file counts against yet (frontend testing just started) — 15 tests total across
4 files, all passing; see `frontend/README.md` for how to run them.

**Stack, exactly per §3 (no deviation):** Vite + React (JS only), Tailwind CSS + Ant Design,
React Router DOM (`createBrowserRouter`/`createRoutesFromElements` only), Zustand (session
store is the only global store so far), Axios. **One deliberate cleanup on top of the
pre-existing `frontend/` scaffold:** the default Vite template had wired an experimental
`@rolldown/plugin-babel` + React Compiler preset — neither is part of the fixed §3 stack,
and both add real risk (bleeding-edge, unproven interop with Tailwind/Ant Design/Vitest) for
zero required benefit at Phase 0. Replaced with the standard `@vitejs/plugin-react`.

**API client (`src/services/apiClient.js`):** one shared Axios instance,
`baseURL` from `VITE_API_BASE_URL`, `withCredentials: true` (the httpOnly cookie is never
read/stored client-side — token invisible to JS by design, §4.1). A response interceptor
clears session state and redirects to `/login` on any 401 **except** a failed login attempt
itself (that 401 is expected — wrong password, not an expiring session).

**Session store (`src/store/sessionStore.js`, Zustand — the only genuine cross-page state
built so far, per smartrays.md's "Zustand only when global state is required"):** calls
`GET /auth/me` once on app load to resolve `{ user, isAuthenticated, isLoading }` from a real
request — never a decoded token, mirroring §4.1's backend principle on the client side.
Exposes `login()`, `logout()`, `refetchSession()`, `clearSession()` (wired to the API
client's 401 handler via a `registerUnauthorizedHandler` indirection, avoiding a circular
import between the two files).

**Route guards (`src/routes/`):** `ProtectedRoute` (redirect-to-`/login` + loading state
while the initial `/auth/me` call is in flight — no flash of protected content),
`PermissionGate`/`usePermission` (mirrors backend `can(user, module, action)` for
hiding/disabling UI — **UI convenience only, stated as a comment in
`src/utils/permission.utils.js` itself, not just here**, since the backend is the only real
enforcement point), `RootRedirect` (`/`'s real by-role redirect: `customer` → `/portal`,
every staff role → `/dashboard`).

**Layouts (`src/layouts/`):** `MainLayout` (the one shared dashboard shell per §7.13 — nav
items filtered by `can()`, not four separate per-role layouts) and `PortalLayout` (separate,
no internal nav, per §8, for `role: customer`).

**Routing (`src/routes/router.jsx`):** every route in §8's map is wired today. `/login` and
`/` are fully functional; every other route renders a shared `PlaceholderPage` component
(heading + "coming soon") — filled in module-by-module in later frontend tasks, the same
phase-by-phase discipline the backend was built with.

**Testing:** Vitest + React Testing Library + `@testing-library/user-event`, jsdom
environment. Login page (renders/submits/error/redirect), `ProtectedRoute`
(loading/redirect/authenticated), `PermissionGate` (hide/fallback/show/admin-bypass), and
`RootRedirect` (customer vs. every staff role) are all covered — every API call mocked at
the module boundary, no real network calls, matching backend's Cloudinary/Google Maps
mocking discipline. **One real interop bug found and fixed during this build:** the
scaffold's pinned `vitest@2` bundles its own internal Vite 5.x (`vite-node`,
`@vitest/mocker`), which doesn't correctly apply this project's Vite-8-targeted
`@vitejs/plugin-react` — JSX silently fell back to the classic runtime in tests
(`ReferenceError: React is not defined`) even though the real dev/build pipeline was
unaffected. Fixed by upgrading to `vitest@4` (also resolves the transitive `esbuild`/`vite`
audit advisory `vitest@2` carried — the same fix `npm audit` itself suggested, not a forced
workaround). A second, unrelated fix: jsdom has no `window.matchMedia`, which Ant Design's
responsive components call unconditionally on mount — stubbed in `src/test/setup.js`.

**Known deviations:** none from this task's own scope — registration/Customer-signup pages,
real module pages (Leads/Customers/Attendance/...), and the Dashboard's actual widgets are
all explicitly out of scope for Phase 0, deferred to later frontend tasks per §10.

---

### 7.15 Leads Frontend Module

✅ **Built 2026-07-16** — the first real feature module built on the Phase 0 scaffold, and
the one every later frontend module should follow the shape of (see `frontend/README.md`'s
"Adding a new module" section, rewritten around this build). Built under
`frontend/src/modules/lead/`, wired into the existing placeholder routes `/leads`,
`/leads/board`, `/leads/:id`.

**New dependency:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — the
kanban board's drag-to-move-between-stages interaction. `dayjs` was also added as an
explicit direct dependency (previously only resolvable transitively through `antd`) since
`LeadFormModal`/`LogCallModal` import it directly for `DatePicker` value handling.

**Table View + Board View share one page shell** (`LeadsListPage`, rendered by both
`LeadsPage.jsx` and `LeadsBoardPage.jsx` with a `view` prop) — filters
(search/owner/follow-up) live in the URL's search params so toggling between the two
routes never loses the current filter selection. Table: Name/Company/Status/Source/Owner/
Follow-up/Budget/Created columns per leads-customer-functional-spec.md, inline status
dropdown, overdue follow-ups in red, quick hot-toggle and owner-reassignment actions from
the row itself. Board: one column per `LEAD_STATUSES` entry, `@dnd-kit` drag between
columns.

**One dispatcher for status changes, shared by three surfaces** —
`useLeadStatusChangeFlow` centralizes what happens when a lead's status changes, since
three different UI surfaces (Table's dropdown, Board's drag-and-drop, Detail page's action
buttons) all need the exact same two special cases: moving to `lost` opens a modal
collecting `lostReason` **before** the API call (never after a drag/click already looked
like it succeeded, which would otherwise silently fail against the backend's required-
field validation), and moving to `won` opens the Convert-to-Customer modal instead of a
plain status change, then calls the real convert endpoint followed by the actual status
change to `won` — matching leads-customer-functional-spec.md's stated behavior ("Won —
marks lead as won, triggers Convert to Customer flow"). Every other transition changes
immediately, no modal.

**Convert to Customer** (`ConvertToCustomerModal`) pre-fills `companyName`/`email`/
`phone`/`source` from the lead but stays fully editable before submit, per the spec.
`projectManagerId` has no lead-derived fallback (Lead has no equivalent field, and it's
the one value `POST /leads/:id/convert` requires) — picked from the shared `/users/
dropdown` list. On success, navigates to `/customers/:id` — at the time this module was
built, that route was still Phase 0's routing-skeleton placeholder (that route already
existed, confirmed rather than assumed); §7.17 has since built out the real Customer Detail
page it now lands on.
Reachable two ways: the Detail page's dedicated "Convert to Customer" button (converts
without forcing status to `won` — for converting before the lead is formally marked won),
and the "Won" action/board-drop (converts **and** marks `won`) — a deliberate, stated
distinction between the two, not an inconsistency.

**Activity Timeline — a real backend gap found and handled, not silently worked around:**
leads-customer-functional-spec.md calls for an Activity Timeline in the detail slide-over,
but the backend has no lead-specific activity log (`backend/src/modules/lead/` has only
`lead`/`leadCall`/`leadSource` — no `leadActivity.model.js`, unlike `customer`'s
`customerActivity.model.js`). Rather than treating this as a blocker or inventing a new
backend feature this task wasn't scoped to build, `buildActivityTimeline.js` assembles a
timeline client-side from data the API already returns: the lead's own creation/lost/
converted facts plus its call history, sorted newest-first. Documented in the code itself
(a comment stating exactly what was checked and why) so a future reader doesn't mistake it
for a backend-provided feed.

**Import wizard** (`ImportWizardModal`) — Upload → Preview & Mapping → Result, 3 Ant Design
`Steps`. **Also an honest reflection of an existing backend constraint, not a new one
introduced here:** `lead.service.js#importLeadsFromFile` matches columns against a
**fixed** alias list server-side — there is no interactive remapping endpoint. So the
wizard's "mapping" step is a read-only preview of that exact matching (a client-side
mirror of `COLUMN_ALIASES`, commented as such), not an editable remap that the API
couldn't act on anyway. Row preview parsing is a small hand-rolled CSV split (good enough
for a preview; the server does the real parsing via `exceljs`) — Excel files skip the row
preview rather than pulling in a second heavy parsing dependency just for that.

**Permission gating** (UI convenience only, real enforcement stays server-side, per §4.1
applied to the frontend) — every action gated against the exact `leads` `PERMISSION_REGISTRY`
actions the corresponding backend route requires: New Lead/Import → `create`; Edit/hot-
toggle/status-change/drag/Won/Lost/Convert → `edit`; Delete → `delete`; Export → `view`.
Owner reassignment is additionally gated by role (`role !== "sales_associate"`), mirroring
`lead.service.js#updateLead`'s own extra restriction beyond the plain permission check.

**Testing:** 40 tests total (`resolveDropDestination.test.js`, `useLeadStatusChangeFlow.test.js`,
`LeadBoard.test.jsx`, `LeadsListPage.test.jsx`, `LeadDetailPage.test.jsx`,
`ImportWizardModal.test.jsx`, plus Phase 0's original 15), all passing, no real network calls
(every `leadApi`/`userDirectoryApi` call mocked at the module boundary). **A deliberate,
documented testing-strategy decision:** simulating a real `@dnd-kit` pointer-drag sequence
under jsdom is brittle and doesn't exercise logic beyond what's already covered by testing
the pieces directly — so the drag interaction is tested as (1) a pure-function unit test of
the drop-target resolution logic, (2) a unit test of the status-change flow hook (immediate
transition / lost-needs-reason / won-triggers-convert), and (3) a plain rendering test that
cards land in the right columns — together covering every rule the drag enforces without a
flaky DOM-drag simulation layered on top.

**Known deviations:** none from this task's own scope. `/customers/:id` was still the Phase
0 placeholder at the time this task was built (confirmed to exist, not built out — that was
Customers' own future frontend task, since done — see §7.17).

---

### 7.16 Notifications & Web Push (Platform, Phase 9)

✅ **Built 2026-07-16** — the Notification module (§6.7), Web Push (VAPID) delivery, and the
lead follow-up reminder cron. **This closes out every backend phase in §10** — the last
unbuilt backend piece was Phase 9's backend half; only Phase 9's frontend half (Dashboard
polish, PWA service worker wiring) remains anywhere in the plan.

**Module folder:** `backend/src/modules/notification/` — `notification.model.js`,
`pushSubscription.model.js`, `notification.service.js`, `notification.controller.js`,
`notification.routes.js`, `notification.validation.js`. Both models built exactly as §6.7
documents them, no fields added beyond what's listed there.

**New required env vars:** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` — `src/services/
webPush.service.js` calls `web-push`'s `setVapidDetails()` at import time, which validates the
public key is a real 65-byte VAPID key and throws synchronously if it isn't; there's no safe
placeholder for a public-key-cryptography pair the way there is for e.g. a Cloudinary cloud
name, so a real keypair (generated once via `web-push`'s own `generateVAPIDKeys()` utility)
must exist from boot. `VAPID_SUBJECT` is optional (defaults to
`mailto:support@smartrayssolutions.com`).

**No `PERMISSION_REGISTRY` entry** — every action (subscribe/unsubscribe/list/mark-read) is
inherently self-scoped (your own subscriptions, your own notifications), the same "self data
needs no grant" reasoning already established for `users.*`/`attendance.*`'s always-reachable
own-data endpoints.

**`notification.service.js#createNotification(userId, type, message, relatedEntity?)`** creates
the DB record (the real source of truth regardless of push outcome) and attempts a push to
every **active** `PushSubscription` the user has, each attempted independently — a push failure
is logged and swallowed per-subscription, never thrown out of `createNotification`, so one bad
subscription can't suppress delivery to the user's other devices and the notification record is
never blocked by a delivery failure. A `404`/`410` response deactivates that subscription
(push service says it's gone) rather than deleting the row, so a later re-subscribe of the same
endpoint is a straightforward re-activate.

**`subscribe(userId, subscriptionObject)`** upserts by `endpoint`, not `userId` — the Push API
gives each browser/device subscription a globally unique endpoint, so this is the natural key;
re-subscribing an already-known endpoint (e.g. a shared device logged in as a different user)
re-associates it rather than erroring on a duplicate key. Links the subscription's id onto the
new `User.pushSubscriptions` array (§6.1/§6.7) — kept in sync, though `PushSubscription.isActive`
(not this array's membership) is what `createNotification` actually checks before sending.

**Wired into two existing modules:**
- **Leads** (`lead.service.js`) — exactly the spec's own requirement. `notifyLeadAssignment`
  (shared by `createLead` and `updateLead`) fires whenever a lead's `ownerId` ends up set to
  someone other than whoever made the change — assigning a lead to yourself needs no
  notification telling you what you just did.
- **Tickets** (`ticket.service.js#assignTicket`) — **a deliberate small addition beyond §7.8's
  literal scope**, stated here explicitly as an addition rather than a silent scope expansion.
  Made because the Notification infrastructure is fully generic and Ticket already has an
  `assign` action ready to hang a notification off of. Skipped when an admin/manager assigns a
  ticket to themselves, the same self-notify guard as Leads.

**`src/cron/leadFollowUpReminderCron.js`** — the other literal Leads requirement. Runs every 5
minutes (`*/5 * * * *`) — far more frequent than the monthly payroll cron, since "24h before"
and "15min before" are both precise-ish moments, not a once-a-day batch. The job body,
`lead.service.js#sendDueFollowUpReminders(referenceDate)`, is exported separately for direct
testing with a fixed date, the same pattern `payrollCron.js#runMonthlyPayrollJob` established.
Checks two independent windows (24h, 15m) per tick — "`followUpDate` falls inside the next N
and hasn't been reminded for yet" — deliberately a "due within the window" check, not an
exact-time match, so a cron restart or a delayed tick can never cause a reminder to be silently
skipped: once a lead's follow-up enters a window it keeps matching every tick until the guard is
set. `won`/`lost` leads are excluded (nothing left to follow up on). A follow-up that's already
fully passed (server down through the whole window) never gets a reminder at all — this is a
"before it's due" nudge, not an after-the-fact one; the existing `followUp=overdue` filter
already covers that case.

**New `Lead` fields — a necessary schema addition, the same treatment as Attendance's
`lastHeartbeatAt`:** `followUpReminder24hSentAt`/`followUpReminder15mSentAt` (`Date`, nullable)
— idempotency guards so the cron never double-sends. Both reset to `null` whenever
`followUpDate` actually changes (`updateLead`), so rescheduling a follow-up "re-arms" both
reminders instead of silently staying suppressed for the new date.

**Testing:** 34 new tests (399 total backend suite) — 17 in `notification.test.js`
(subscribe/unsubscribe upsert-by-endpoint semantics, self-scoped list/read/read-all,
push-delivery behavior including the 404/410-deactivate-vs-transient-failure distinction), 9
in `leadFollowUpReminderCron.test.js` (both windows independently, no double-send, excluded
won/lost, already-passed follow-ups never remind, never throws), 6 new in `lead.test.js`
(assignment notification on create/reassign, no self-notify, follow-up reminder reset on
reschedule), 2 new in `ticket.test.js` (assignment notification, no self-notify). `web-push`
mocked at the module boundary in every test that touches it — no test ever sends a real push,
same pattern as Cloudinary/Google Maps mocking. No application bugs found — a clean net-new
build.

**Known deviations:** none from this task's own scope. The PWA service worker (browser-side
push receipt/display/click-through) is explicitly a frontend concern, not built here — this
task is the backend half only, per its own stated scope.

---

### 7.17 Customers Frontend Module

✅ **Built** — the second real feature module built on the Phase 0 scaffold, following the
shape §7.15's Leads module established (see `frontend/README.md`'s "Adding a new module"
section). Built under `frontend/src/modules/customer/`, wired into the existing placeholder
routes `/customers`, `/customers/:id`.

**List View** (`CustomersListPage`) — search/owner/status filters live in the URL's search
params, matching the Leads module's convention. `status` defaults to `"active"` via an
explicit "Show Inactive" checkbox rather than an empty string, so "no status filter set yet"
and "show all statuses" don't collapse to the same falsy value; the UI-only `"all"` sentinel
is translated to "omit the filter" right at the API boundary (`GET /customers?status=`), not
taught to the backend as a new concept. Sortable columns, row-select + bulk activate/
deactivate/delete (`bulkUpdateCustomers`).

**Add Customer wizard** (`CustomerFormWizard`) — Company Info → Billing → Contracts →
Contacts → Project Manager. The backend has no single "customer with nested contracts/
contacts" create endpoint, so the wizard creates the customer first, then each staged
contract/contact in turn. Contract creation is what actually triggers the backend's
project/invoice automation (`customer.service.js#applyContractCreatedAutomation`) —
invisible unless called out, so the success toast explicitly names which contract types
triggered it (e.g. *"Customer created — Project + draft Invoice auto-created for: Monthly"*)
rather than a generic "Customer created" that would leave the automation silent.

**Customer Detail** (`/customers/:id`) — a real, linkable **full page** (not a slide-over,
unlike Lead Detail — per leads-customer-functional-spec.md's own distinction between the
two), rendering `CustomerHeaderSection`/`CustomerBillingCard`/`CustomerContactsSection`/
`CustomerContractsSection`/`CustomerCredentialsSection`/`CustomerActivityLog` from one
`useCustomerDetail` hook.

**Credentials Vault — masking and reveal exactly matches backend behavior, not just a UI
convention:** passwords render as `••••••••` by default; revealing one requires an explicit
per-row confirm-click (`Popconfirm`, *"This action is logged to the customer's activity
log"*) — never automatic just because the page loaded — and re-masks on a second click. This
mirrors `customer.service.js#revealCredential` actually writing an activity-log entry on
every reveal server-side, so treating it as a deliberate, one-at-a-time action client-side
matches what the backend does with it, not an arbitrary extra click added for its own sake.
The whole section is wrapped in a `PermissionGate` for `credentials.view` **by the parent**
(`CustomerDetailPage`) — hidden entirely for a role without that grant, not merely disabled,
matching leads-customer-functional-spec.md's "only visible to users with credentials.view
permission" literally.

**Permission gating** (UI convenience only, real enforcement stays server-side, per §4.1
applied to the frontend, same as Leads) — every mutating action gated to the exact backend
`customers`/`credentials` `PERMISSION_REGISTRY` action its endpoint requires: Add Customer →
`customers.create`; Edit/bulk actions/contract-contact-credential CRUD → `customers.edit`
(credentials additionally require `credentials.view` to even see the section at all).

**Testing:** 13 tests total (`CustomersListPage.test.jsx`: 7, `CustomerDetailPage.test.jsx`:
6), all passing, no real network calls (every `customerApi`/`userDirectoryApi` call mocked
at the module boundary). Coverage includes: default active-only fetch + search + "Show
Inactive" toggle + column sort + bulk-action-calls-the-right-endpoint-with-the-right-ids (List
View); the full wizard walk-through asserting both the created contract's payload **and**
the automation-feedback toast text (Add Customer wizard); a role with no `customers.create`
grant never sees the Add Customer button (permission gating); every detail section rendering
real fetched data, a contract removal showing the completes-project warning before calling
delete, the credential staying masked until an explicit reveal confirm (and the reveal
endpoint genuinely not being called before that confirm completes), and the Credentials Vault
section being present/absent based on `credentials.view` (Customer Detail).

**Known deviations:** none from this task's own scope. `Invoice`-related UI
(`CustomerInvoicePlaceholder.jsx`) stays a placeholder, matching the backend's own `Invoice`
placeholder-model status (§6.4/§7.9) — real invoicing was never in scope for either side.

---

### 7.18 Attendance, Leave & Location Frontend

✅ **Built** — three related pieces sharing the same check-in/checkout state, built
together: the Attendance check-in/out widget + personal/team timeline views (§7.4), the
Leave request/approve list (§7.5), and a new Location live-map view (§7.4b, which had no
frontend at all before this task). Structured as **three separate module folders**
(`src/modules/attendance/`, `src/modules/leave/`, `src/modules/location/`) rather than one
combined module — they map 1:1 onto the three separate backend modules they each talk to,
matching this project's own "one module folder per feature" convention exactly.

**New dependencies: none.** Both new browser-API surfaces this task needed were deliberately
built on native APIs instead of adding a library:
- **Camera capture** — `navigator.mediaDevices.getUserMedia` + a `<canvas>` snapshot
  (`useCamera.js`). A camera library (e.g. `react-webcam`) earns its weight when you need
  front/back camera switching or other UX the native API makes painful — neither was asked
  for here ("live preview, capture on a button press"), so the native API was simple enough
  not to need one.
- **Google Maps** — the JS SDK loaded via a plain `<script>` tag
  (`useGoogleMapsScript.js`), talking to `window.google.maps` directly
  (`GoogleMapView.jsx`) rather than through a wrapper library (e.g.
  `@react-google-maps/api`). §7.4b's own stated scope for this view is deliberately basic
  (markers + a polyline, no clustering/info windows/autocomplete), so a wrapper's
  abstraction wouldn't earn its dependency weight here either. New env var
  `VITE_GOOGLE_MAPS_API_KEY` — **deliberately separate from the backend's own
  `GOOGLE_MAPS_API_KEY`**, since this one is loaded into the browser (visible in devtools)
  and must be HTTP-referrer-restricted, not server-IP-restricted the way the backend's key
  is; see `frontend/.env.example`.

**Check-In/Out Widget (`attendance/components/CheckInOutWidget.jsx`)** — fetches current
status on mount (`GET /attendance/me` for the current month, deriving the open record —
the one with no `checkOut.time` yet) rather than assuming "not checked in," so a page reload
mid-shift correctly shows Checked In + a live elapsed-time counter, not a stale default.
Both camera photo and geolocation coords are mandatory before Confirm enables — mirroring
the backend's own server-side-enforced photo requirement (§7.4) rather than a client-only
convenience; a denied geolocation permission surfaces a real, visible error message, never
a silently-stuck spinner. The photo is captured only on an explicit button press (never
automatic) and sent as a base64 data URI in the JSON body — the simplest of the two
transports `attendance.validation.js` already accepts, needing no `FormData` plumbing since
`canvas.toDataURL()` already produces a data URI.

**Personal/Team Attendance (`PersonalAttendanceView`/`TeamAttendanceView`)** — a
selectable month (Personal) or month + client-side employee filter (Team — the backend's
`GET /attendance/team` has no per-employee filter of its own, so the already-fetched
month's records are filtered in the browser rather than re-fetched per employee) feeding
one shared `AttendanceTimeline` table. Connectivity gaps (`connectivityGaps[]`, §6.5) are
rendered as visually distinct red segments on a proportional bar (`ConnectivityGapBar`) —
positioned and sized by actual gap-start/gap-end times relative to the shift's total
duration, a specific, real requirement (§7.4's "mark red"), not decoration. Team Attendance
is gated by `attendance.view_team`/`view_all` — checked inline with `can()` in
`AttendanceTeamPage.jsx` (an OR of two actions `PermissionGate`/`usePermission` can't
express in one call, since both only take a single module+action pair) rendering a 403
`Result` for anyone without either grant, the same pattern `LocationPage.jsx` reuses below.

**Leave (`leave/components/LeaveListPage.jsx`)** — scope tabs (own/team/all) are built from
whichever `leave.view*` grants the current user actually holds, mirroring the backend's own
"check each scope's own permission separately" design (`listLeaves`) rather than assuming a
hierarchy; defaults to `"own"` when available, matching the backend's own default when no
`?scope=` is given. The Request modal only offers `paid`/`unpaid` — `unapproved_absence` is
never requestable, matching `leave.validation.js`'s own exclusion. Approve and Mark
Unapproved Absence are rendered only for `role === "admin"` (§7.5: "manager can view but
not approve" — a manager viewing `scope=team` sees no Actions column at all, not a disabled
one). **The mark-unapproved-absence confirmation shows its 2x-deduction consequence
directly in the `Popconfirm`'s description text** ("This counts as a DOUBLE (2x) deduction
against this employee's leave balance..."), not a tooltip — burying an irreversible-feeling
action's consequence behind a hover would defeat the point of confirming at all.

**Location (`location/components/LiveMapView.jsx`/`HistoryMapView.jsx`, `pages/
LocationPage.jsx`)** — a genuinely new route, `/location`, gated the same 403-`Result` way
as Team Attendance by any of `location`'s existing `view`/`view_team`/`view_all` grants
(no new permission invented). Live view re-polls `GET /location/live` every ~12 seconds
(within this task's stated "~10-15 seconds" range — a UI re-poll cadence, deliberately not
read from the backend's own `LOCATION_PING_INTERVAL_MINUTES`, since that config is for how
often a client *submits* a ping, a different cadence than how often this view re-fetches to
display them) and plots one marker per visible, currently-checked-in employee, with a plain
list beneath doubling as a legend/fallback while the map script loads. History view is an
employee + date picker rendering `GET /location/history`'s ping trail as a polyline; an
out-of-scope `employeeId` surfaces the backend's 404 (§7.1's precedent) as a real error
message, not a silent blank map.

**Report downloads (Attendance + Leave)** — a new shared `frontend/src/components/
ReportDownloadButton.jsx` + `src/services/reportApi.js`, used by both modules (and meant
for every later module with a report) rather than duplicating the "pick a format, call
`POST /reports/generate`, get `{ downloadUrl }`, trigger a real download" flow per module.
`triggerFileDownload` opens the already-hosted Cloudinary URL via a synthetic `<a download>`
click — no blob/object-URL handling needed, unlike Leads' export, since this URL is already
real and hosted, not a same-origin blob this app created.

**Known gap from this task — resolved in a same-phase follow-up (`useCheckedInHeartbeatLoop`,
`attendance/hooks/`):** this task originally shipped with neither `POST
/attendance/heartbeat` nor `POST /location/pings` having a client-side submission loop,
flagged explicitly rather than silently skipped. The follow-up closed it with one hook
driving both loops for as long as the caller is checked in — a cross-module import
(`attendance/` importing `location`'s API), the same precedent the backend itself already
set with `attendance.service.js#checkOut` calling straight into
`transport/travelLog.service.js`. Driven by the same `isCheckedIn` boolean
`CheckInOutWidget.jsx` already computes (not a separate `start()`/`stop()` pair), which is
what makes "resume the loop on page reload mid-shift" free — the effect body is identical
whether `isCheckedIn` starts `true` or transitions to it. Heartbeat fires every 3 minutes
(inside the backend's own stated "~2-5 minute client cadence" assumption for its
10-minute-default gap threshold, per `env.js`'s comment); the ping interval is read fresh
from `GET /location/config` every time the loop (re)starts, never hardcoded. Both intervals
pause on `visibilitychange: hidden` and resume on visible (no `beforeunload` handler needed
— a real tab close destroys the intervals with the JS engine itself). A single failed
heartbeat/ping is logged and swallowed, never thrown, matching the backend's own
"never block the primary action" principle for this exact feature. A small pulsing-dot
"Tracking active" badge next to the Checked In tag makes the otherwise-invisible loop
visible. 7 additional tests (`useCheckedInHeartbeatLoop.test.js`, fake timers via
`vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync()`), covering fresh-start, resume-on-mount,
stop-on-checkout, cleanup-on-unmount (no leaked intervals), and failure-doesn't-throw —
bringing this section's total to 31 (see Testing below).

**Testing:** 32 tests (`vitest` + React Testing Library + `@testing-library/user-event`),
all passing, no real network calls. Exercises browser APIs untouched by any earlier frontend
task — `navigator.mediaDevices.getUserMedia`, `HTMLCanvasElement#getContext`/`#toDataURL`
(jsdom implements neither), `navigator.geolocation.getCurrentPosition`, and the Google Maps
JS SDK — each stubbed at the global/module boundary (see `frontend/README.md`'s Testing
section for the exact pattern, written up there specifically so later modules touching
these same APIs don't have to rediscover it). Covers: check-in/out blocked until both photo
and location are captured, correct API call once both are present, and correct UI state
before/after (including the "page loaded mid-shift" case); connectivity gaps rendered with
a real, distinguishing class/style (`bg-red-500`), not just present in the data; Team
Attendance's permission gate (403 for no grant, real content for `view_team`/admin);
Leave's request flow, admin-only approve/mark-absence, and the mark-absence consequence
text actually appearing before the API call fires; the report button's `{ downloadUrl }`
response triggering a real download call; both map views rendering real markers/a real
polyline from mocked live/history data; and (the same-phase follow-up) the heartbeat/ping
loop starting on fresh check-in, resuming identically on an already-checked-in mount,
stopping on check-out, cleaning up on unmount with no leaked intervals, and a failed
heartbeat/ping call never throwing — all via fake timers (`vi.useFakeTimers()` +
`vi.advanceTimersByTimeAsync()`, needed because the loop resolves a real `Promise` before
its first interval exists, which plain synchronous timer advancement doesn't flush).

---

### 7.19 Password Reset & User Management Frontend (2026-07-17)

✅ **Built 2026-07-17** — two previously-open gaps closed in the same task: real password reset
(both self-service and admin-override), and the User Management admin screen on the frontend,
which had never been built despite the backend `user` module (§7.0b) existing since Phase 0.

**Self-service password reset:**
- New `backend/src/services/email.service.js` wraps Nodemailer/SMTP — new required
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` env vars. Unlike `web-push`'s
  `setVapidDetails()`, `nodemailer.createTransport()` does not validate synchronously at
  import, so a bad-but-present value won't crash the boot, only a real send attempt — still
  treated as required (not optional-with-a-default) since password reset genuinely can't work
  without it.
- `User.passwordResetToken` (SHA-256 hash of the emailed token, never the raw value —
  `select: false`, same defense-in-depth as `passwordHash`) and `passwordResetExpiresAt`
  (~1 hour).
- `POST /auth/forgot-password` — **always** the same generic response, whether or not the
  email matches an account (or matches a deactivated one) — account-enumeration-safe by
  design, verified with dedicated tests for all three cases (match / no match / deactivated
  match).
- `POST /auth/reset-password` — validates the token's hash + expiry, sets the new password,
  clears the token fields so the link can't be replayed.
- Frontend: a "Forgot password?" link on the login page, a `/forgot-password` request-email
  page, and a `/reset-password?token=` page — all three new auth screens (plus login) share a
  new `AuthLayout` component (`frontend/src/components/AuthLayout.jsx`), factored out once a
  third screen needed the identical dark-glass background/card treatment.

**Admin override — `PATCH /users/:id/reset-password` (admin only):** a judgment call, stated
explicitly rather than silently picked: supports **both** an admin-supplied exact
`newPassword` **and**, when omitted, a backend-generated one-time temp password returned once
in the response (`data.tempPassword`, never persisted anywhere else). Chosen over forcing
every reset to be admin-typed, since "reset this locked-out user's password" is the common
case and shouldn't require the admin to invent a password on the spot; an admin who wants an
exact value can still supply one.

**User Management frontend screen (`frontend/src/modules/user/`) — the actual gap being
closed:** the backend `user` module (§7.0b) has had full roster CRUD, deactivate/reactivate,
and manager-assignment endpoints since Phase 0, but no frontend screen ever consumed them.
Built now: a list (admin sees everyone, manager sees their own team, both via the existing
`resolveVisibleUserFilter` scoping — no new backend logic needed), per-user Edit (name/email/
phone/role/managerId/baseSalary via the existing `PATCH /users/:id`), Deactivate/Reactivate
actions, the new admin password-reset action, a link to the Permissions module (still a
placeholder screen — `PermissionSettingsPage` — noted as such rather than silently ignored),
and Create User (admin only, via the existing `POST /auth/register`).

**New route: `/settings/users`** — added to `ROUTE_PATHS`/`router.jsx` and wired into
`MainLayout`'s nav (gated on `users.view_all`/`users.view_team`, matching the same scoping the
backend already enforces) since §8's route map didn't list one — stated explicitly here as an
addition, not silently introduced.

**Testing:** new backend tests cover forgot/reset token validity/expiry/reuse, the
non-leaking forgot-password response (matching / non-matching / deactivated account), and
both admin-override modes (supplied password, generated temp password) — full backend suite:
**412 tests, all passing.** New frontend tests cover the Forgot Password and Reset Password
pages and the User Management list/edit/deactivate/reactivate/admin-reset flows (API mocked
at the module boundary, no real network calls) — full frontend suite passing throughout.

**Login page visual redesign (bundled into the same task):** the first redesign pass read
"flat and almost-white" against a reference design — reworked into a genuinely deep,
directional navy gradient (3 stops: near-black corner → brand-navy mid → lighter navy far
corner) with a real off-center green (`#1d8343`) radial glow and a dark vignette, and a much
darker/more-translucent glass card (`bg-white/12` + `backdrop-blur-xl` + `border-white/20`)
with frosted-dark inputs. A follow-up round against the **live deployment** caught two more
problems the first pass missed: the hero-side logo (color version) was blending into the dark
background, and the gradient still read as flat at a glance — fixed with a `variant` prop on
`BrandLogo` (`color`/`white`, using the `logo-white-shadow.png` asset) and by widening
the gradient's lightness range and glow opacity. Verified with real Playwright screenshots
(desktop + mobile) against both local and the live production deployment at every iteration.

**Known deviations:** none from this task's own stated scope.

---

## 8. Frontend Route Map (indicative)

```
/                        → redirect by role
/login
/forgot-password          (§7.17, added 2026-07-17 — not in the original route map)
/reset-password           (§7.17, added 2026-07-17 — not in the original route map)
/leads                   (table)      /leads/board
/leads/:id
/customers               /customers/:id
/projects/:id
/tasks                   (employee "my tasks")
/attendance               (self)      /attendance/team (manager)
/leave
/payroll                  /payroll/:id/payslip
/travel-logs
/tickets                  /tickets/:id
/payments                 (admin)
/amc
/reports
/settings/permissions      (admin)
/settings/users            (admin/manager, §7.17, added 2026-07-17 — not in the original route map)
/portal                   (customer — separate layout, no internal nav)
```

---

## 9. Folder Structure

Per `.context/smartrays.md` — unchanged, included here for completeness:

```
backend/
├── server.js
├── app.js
├── .env / .env.local / .env.example
└── src/
    ├── config/
    ├── database/
    ├── modules/
    │   ├── auth/
    │   ├── user/         (✅ Built — User Management, §7.0b, 2026-07-13; model shared by
    │   │                   auth/lead/location/permission since Phase 0)
    │   ├── lead/
    │   ├── customer/       (✅ Built — Customer/Contact/Contract/Credential CRUD, contract
    │   │                    automation, credentials vault, activity log, §7.2, 2026-07-13;
    │   │                    Invoice is a minimal placeholder model, full invoicing is Phase 7)
    │   ├── project/         (✅ Built — Project/Task, team assignment, one-in_progress-task-
    │   │                    per-employee constraint, §7.3, 2026-07-13)
    │   ├── attendance/     (✅ Fully built — check-in/check-out with photo capture,
    │   │                    connectivity-gap detection, workingHours, team/org reports,
    │   │                    §7.4, 2026-07-13)
    │   ├── location/       (✅ Built — Live Location Tracking, §7.4b, 2026-07-13)
    │   ├── permission/     (✅ Built — RolePermissionTemplate + per-user permission endpoints,
    │   │                    §7.12, 2026-07-13)
    │   ├── leave/          (✅ Built — request/approve/mark-unapproved-absence, one-paid-
    │   │                    leave-per-month quota, §7.5, 2026-07-13)
    │   ├── transport/       (✅ Built — travelLog.* files (model name, not folder name),
    │   │                    auto-generation from Attendance checkout + manual entry,
    │   │                    pending/approved/rejected approval workflow (added 2026-07-13,
    │   │                    resolves §11.4), §7.6, 2026-07-13)
    │   ├── payroll/         (✅ Built — run/list/payslip, gross/net computed from Attendance +
    │   │                    Leave + approved-only TravelLog data, §7.7, 2026-07-13)
    │   ├── ticket/          (✅ Built — raise/list/assign/status/comments/attachments, Customer
    │   │                    Portal-scoped access, §7.8, Phase 5)
    │   ├── payment/         (✅ Built — admin-only log, optional partial reconciliation against
    │   │                    an Invoice, §7.9, Phase 7)
    │   ├── amc/             (✅ Built — new/existing-customer creation flow, own-team/own
    │   │                    scoping via the underlying Customer's ownership, §7.10, Phase 7)
    │   ├── report/          (✅ Built — unified POST /reports/generate dispatcher, six modules,
    │   │                    no new permission, §7.11, Phase 8)
    │   └── notification/    (✅ Built — Notification/PushSubscription models, self-scoped
    │                        subscribe/list/mark-read, wired into Leads assignment + follow-up
    │                        cron and Ticket assignment, §6.7/§7.16, Phase 9, 2026-07-16)
    ├── middlewares/       (auth, can(), errorHandler, asyncWrapper)
    ├── services/          (✅ cloudinary.service.js, credentialEncryption.service.js,
    │                        report.service.js (generic Excel/PDF builders), googleMaps.service.js,
    │                        webPush.service.js (§7.16, 2026-07-16) — all built)
    ├── cron/              (✅ payrollCron.js, added 2026-07-13, §7.7; ✅ leadFollowUpReminderCron.js,
    │                        added 2026-07-16, §7.16 — new top-level directory,
    │                        not folded into services/: scheduled-job orchestration is a
    │                        distinct concern from the stateless external-service wrappers above)
    ├── utils/ constants/ (incl. permissionRegistry.constants.js, §7.12) validations/ helpers/
    ├── route.js
    └── index.js

frontend/
└── src/
    ├── assets/ components/ layouts/
    ├── modules/            (leads/, customers/, attendance/, ... — components+api+hooks per feature)
    ├── pages/ routes/ services/ hooks/ context/ store/ utils/ constants/ styles/
    ├── App.jsx  main.jsx
```

---

## 10. Roadmap (MVP-first, sequential dependencies noted)

| Phase | Scope | Depends on |
|---|---|---|
| 0 | ✅ **Built:** Auth (register/login/logout/me, §7.0), User model + Permission helper (single `employee` role, `User.managerId` self-reference, no `Team` collection), `can()`/`authorize`/`requireAdmin` middleware, base scaffolding. Cloudinary SDK wiring deferred to Phase 2/3 (not needed until Attendance/Credentials). ✅ **Permissions module built and verified 2026-07-13** (§7.12 — `permission` module, `RolePermissionTemplate` + `PERMISSION_REGISTRY`, `authorizeAny` reused from §7.4b, 20 tests). Replaces the `location`-only hardcoded role defaults (§7.4b) and the register-time `permissions` override workaround (§7.0) with a real, admin-editable, non-retroactive template system. ✅ **User Management built and verified 2026-07-13** (§7.0b — `user` module completes the roster/CRUD layer on top of the shared `User` model, 33 tests as of the Payroll task's `baseSalary` addition, §7.7). Also deduplicated account-creation logic: `createUser` now lives only in `user.service.js`; `auth.service.js` no longer has a `registerUser` function. **Frontend Phase 0 (scaffold + auth flow + routing shell) also built 2026-07-16 — see §7.14** — Vite + Tailwind + Ant Design, API client, session store, route guards, dashboard/portal layout shells, full §8 route map wired (only `/login` and `/` functionally complete). | – |
| 1 | ✅ **Backend built:** Leads — CRUD, scoping, calls, hot flag, CSV/Excel import/export, lead sources (§7.1). ✅ **Frontend built 2026-07-16 — see §7.15**, the reference implementation for later frontend modules: Table + Board (kanban, `@dnd-kit`) views, Lead Detail slide-over, Import wizard, filtered export. ✅ **Assignment/follow-up push notifications built 2026-07-16 — see §7.16** (Phase 9's Notification module). | Phase 0 |
| 2 | ✅ **Built and verified 2026-07-13:** Customers + Contracts/Contacts/Credentials (incl. AES-256-GCM credential-encryption utility, `src/services/credentialEncryption.service.js`) + Project/Task automations (§7.2 — `customer` module, 21 tests; §7.3 — `project` module, 19 tests). Contract automation chain (monthly→recurring Project+draft Invoice, onetime→onetime Project+draft Invoice, delete→complete Project+cancel Invoice) and the deactivation cascade (active projects → completed) both implemented as real logic, not stubs. `Invoice` is a minimal placeholder model only (no service/controller/routes) — full invoicing is Phase 7, and `GET /customers/:id/invoices`/`/ledger` were deliberately not built. `POST /leads/:id/convert`'s 501 stub (§7.1) was resolved as part of this same task. `CREDENTIALS_ENCRYPTION_KEY` is now a **required** env var (`env.js` fails fast at boot without it). ✅ **Frontend built — see §7.17**: List View + Add Customer wizard (surfaces contract automation in its success toast) + a real Customer Detail full page (billing/contacts/contracts/credentials vault with explicit-reveal masking/permission-gating/activity log), 13 tests. | Phase 1 |
| 3 | ✅ **Fully built and verified 2026-07-13:** Attendance (camera+geo capture, photos to Cloudinary, connectivity-gap detection, workingHours, team/org reports — §7.4, `attendance` module, 32 tests) + Leave (request/approve/mark-unapproved-absence, one-paid-leave-per-month quota resolved in §11.7 and confirmed enforced at approval time not request time — §7.5, `leave` module, 18 tests). ✅ **Live Location Tracking built and verified 2026-07-13** (§7.4b — `location` module, 19+1 tests), ahead of the rest of this phase. Attendance started as a minimal check-in/check-out slice built the same day as Location (13 tests) and was extended to the full spec in this task, reusing rather than replacing the placeholder model. New: `POST /attendance/heartbeat` (not in the original endpoint list — added because connectivity-gap detection needs a distinct "still alive" signal, deliberately not coupled to Location's GPS ping), new shared `src/services/cloudinary.service.js` and `src/services/report.service.js`, `pdfkit` dependency added for `GET /attendance/report?format=pdf`. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are now **required** env vars. **Follow-up fix the same day:** the photo requirement on check-in/check-out was moved from client-side-only to server-side-enforced (400 if missing) — `location.test.js`'s end-to-end test updated to supply one. Full suite: **208 tests, all passing.** ✅ **Frontend built — see §7.18**: Attendance/Leave/Location built together as three module folders sharing the same check-in/checkout state — check-in/out widget (native camera+geolocation, no new dependency), personal/team timeline with connectivity gaps as red bar segments, Leave request/scope-tabbed-list/admin-only-approve, and a new `/location` live-map + history-trail view (native Google Maps JS SDK, no wrapper library). **Same-phase follow-up:** `useCheckedInHeartbeatLoop` closed the loop gap flagged above — heartbeat every 3 minutes, location pings on whatever `GET /location/config` currently says, both starting on fresh check-in AND resuming identically on an already-checked-in mount, pausing on a hidden tab, and never throwing on a failed call. 32 tests total (25 + 7). | Phase 0 (independent of 1–2) |
| 4 | ✅ **Built and verified 2026-07-13:** Payroll (§7.7, `payroll` module, 19 tests + 6 for `src/cron/payrollCron.test.js` = 25) — gross/net computed from Attendance + Leave + approved-only TravelLog mileage, `POST /payroll/run` (single-employee or bulk), `GET /payroll?scope=own\|all`, `GET /payroll/:id/payslip?format=pdf`, a monthly `node-cron` job (`src/cron/payrollCron.js`, new top-level directory). Two prerequisites closed first, in the same task: `User.baseSalary` (§6.1) and TravelLog's `pending`/`approved`/`rejected` approval workflow (§6.5/§7.6, resolving §11.4). `MILEAGE_RATE_PER_KM` is a new, optional env var (defaults to 10, a stated placeholder). **§11.5 resolved: record-keeping only for v1, no disbursement/payment-gateway integration.** **Correction (2026-07-13, follow-up):** `sales_associate`'s default `payroll` grant was fixed — §5 marks it "–" (no access), same as Manager, not "own payslip only" like Employee; an earlier build misread that "–" as blank and granted `sales_associate` the Employee default, now corrected in `permission.service.js`. Full suite: **263 tests, all passing** (verified via a real `npm test` run; the previously reported total also required correcting a miscount in the Transport/Travel approve/reject test count, 7 not 6). | Phase 3 |
| 5 | ✅ **Built and verified:** Support/Tickets + Customer Portal (§7.0/§7.8, `ticket` module, 35 tests + 6 in `auth.test.js` for Customer Portal self-signup). Customer Portal accounts authenticate through the exact same auth system (`role: "customer"`) and are self-signed-up (not admin-created), verified by an email-domain match against `Contact`/`Customer` records rather than an admin grant. `Ticket` raise (internal admin/manager, or customer portal self-raise)/list (`scope=all\|assigned\|own`)/assign/status-change/comments/attachments (Cloudinary, reusing `uploadAttendancePhoto`'s shared client) all built per §7.8. New `tickets` `PERMISSION_REGISTRY` entry and a `customer` `RolePermissionTemplate`. §11.2 (category/status split) resolved as part of this build. Full suite: **304 tests, all passing** (verified via a real `npm test` run — a follow-up added 2 more tests: manager's `scope=all` checked explicitly alongside admin's, and history-ordering across a mixed comment/status-change sequence). | Phase 2 (needs Customer) |
| 6 | ✅ **Built and verified 2026-07-13:** Transport/Travel (Google Maps Distance Matrix integration — §7.6, `transport` module, 28 tests). Auto-generates a `TravelLog` from Attendance checkout coords (direct call into `attendance.service.js#checkOut`, never fails checkout); manual entry with coords or a direct `distanceKm` override; `GET /travel-logs?scope=own\|team\|all` (mirrors Leave's shape) + `PATCH /travel-logs/:id/approve\|reject` (added 2026-07-13, resolves §11.4) + `GET /travel-logs/report` (reuses `src/services/report.service.js`). `GOOGLE_MAPS_API_KEY` is now a required env var. §11.4 (feeds payroll?) resolved 2026-07-13 — only `status: "approved"` entries feed Payroll mileage reimbursement. | Phase 3 |
| 7 | ✅ **Built and verified:** Payments + AMC (§7.9/§7.10, `payment`/`amc` modules, 16 + 20 tests). `Payment` (admin-only, no ownership scoping at all per §5) can optionally attach to a real `Invoice` via a new `invoiceId` field — applying it reduces `Invoice.balance` and updates `Invoice.status` (`paid` at 0, the newly-added `partially_paid` otherwise) — **§11.3 resolved: partial reconciliation, not a standalone log and not full invoicing**. `AMC`'s two-flow creation (`new_customer` reuses `customer.service.js#createCustomer` directly; `existing_customer` requires an in-scope `customerId`) matches smartrays.md's "ask which create client or convert client"; `view`/`edit` scoping ("own team"/"own") is resolved via the underlying Customer's ownership (new `customer.service.js#getVisibleCustomerIds` export), since AMC has no `ownerId` field of its own — Manager's "own team" tier is the "PM" role smartrays.md describes elsewhere. No automation on renewal for v1 (stated simplification). Full suite: **340 tests, all passing.** | Phase 2 |
| 8 | ✅ **Built and verified:** Reports (§7.11, `report` module, 24 tests). Single `POST /reports/generate` `{module, filters, format}` dispatching to `attendance`/`leave`/`payroll`/`transport`/`leads`/`customers` — each via that module's own existing, already-scoped data-fetcher (`generateAttendanceReport`/`generateTravelLogReport` reused unmodified; `listLeaves`/`listPayroll`/`listLeads`/`listCustomers` reused with new column/row rendering added in `report.service.js` itself). No new `reports.generate` permission — gated per-module by reusing `can()` against that module's own actions. Per-module `filters` shape validated by reusing each target module's own existing query validator (`validateReportQuery`/`validateScopeQuery`/`validateListQuery`) rather than duplicating checks; `leads`/`customers` fall back to their model's own status enum since neither has a dedicated query validator to reuse. **Breaking change (intentional):** `GET /attendance/report`/`GET /travel-logs/report` now internally call this dispatcher and return `{ downloadUrl }` instead of streaming the file — existing tests rewritten to assert against the real buffer the mocked upload was called with. `GET /leads/export` and `GET /payroll/:id/payslip` both deliberately excluded (pre-existing separate export; single-document artifact, respectively) — the payslip exclusion now has a dedicated regression test proving it still streams directly. Full suite: **365 tests, all passing.** | All prior phases have data to report on |
| 9 | ✅ **Backend half built 2026-07-16 — see §7.16:** Notification module (§6.7), Web Push (VAPID) delivery, lead follow-up reminder cron — wired into Leads (assignment + reminders) and Ticket assignment. **This closes out every backend phase.** Remaining, frontend-only: Dashboards polish, permission-driven widget composition, PWA service worker wiring for push receipt/display. | All |
| — | ✅ **Built 2026-07-17 — see §7.17:** password reset (self-service email flow + admin override) and the User Management frontend screen (`/settings/users`, closing a gap that existed since Phase 0 — the backend `user` module had endpoints with no frontend consumer). Bundled login page visual redesign in the same task. Not a numbered roadmap phase — a cross-cutting fix/gap-closure task, not new module scope. **Also: first production deployment, to Vercel — see the Deployment section below.** | Phase 0 (`user` module) |

Phases 1–2 and 3 can be built in parallel by two developers since they don't share models
until Phase 4/5.

---

## Deployment (added 2026-07-17)

✅ **First deployment, live on Vercel** — full details (redeploy steps, env vars, the
cross-origin cookie fix, backend serverless adaptation) live in the root `README.md`'s
Deployment section, not duplicated here. Summary:

- Two Vercel projects, monorepo, CLI-only deploys (no GitHub auto-deploy — the Vercel account
  and the `Tous-India` GitHub org are on different emails): `smartrays-crm-backend`
  (`backend/`) and `smartrays-crm` (`frontend/`).
- Backend adapted for serverless (`backend/api/index.js`, connection-caching in
  `src/database/connection.js`) without changing `app.js`/`server.js`'s local-dev behavior.
- **Known production gap, not silently accepted as fine:** `payrollCron` and
  `leadFollowUpReminderCron` (§7.7/§7.16) do not fire in production — node-cron requires a
  long-lived process, which Vercel's serverless functions are not. `server.js` guards their
  registration behind `process.env.VERCEL !== '1'` so this doesn't crash the deploy, but it
  means the monthly payroll run and the 5-minute lead follow-up reminders currently need a
  manual trigger (or a real fix) in production. **Planned real fix, not yet built:** Vercel
  Cron Jobs hitting a dedicated endpoint for the monthly payroll job (its cadence fits Vercel
  Cron's free-tier daily-minimum interval fine); the follow-up reminder cron needs a different,
  always-on answer entirely (a small VM or scheduler service), since Vercel Cron's free tier
  can't go as frequent as every 5 minutes.
- Cross-origin auth cookie (frontend/backend on different Vercel domains) verified working
  end-to-end — `sameSite: 'none'` + `secure: true` in production, confirmed via both a raw
  `curl` session and a real headless-browser login against the live deployment.

---

## 11. Open Questions & Resolved Decisions

Items marked ✅ are settled and reflected everywhere they touch this document. Items without
a checkmark still block on client input and remain flagged as open — do not silently assume.

1. **Employee vs. Executive** — ✅ **Resolved 2026-07-13:** one role, `employee`, for v1. No
   separate `executive` value in `User.role` or the §5 permission matrix. Revisit only if the
   client explicitly requests split permissions between the two job titles later.
2. **Ticket `status`** — smartrays.md's `new project`/`old client query` reads like a category,
   not a lifecycle state; this plan splits it into `category` + `status` (§6.6). ✅ **The split
   itself resolved (built, §7.8, Phase 5):** `Ticket` ships with separate `category`
   (`new_project`/`existing_client_query`/`other`) and `status`
   (`open`/`in_progress`/`resolved`/`closed`) fields. **Narrower and still open:** whether the
   exact category enum needs to grow beyond those three values — confirm with client if/when
   a new category is needed; the shape decision itself is no longer in question.
3. **Payments tab vs. Customer Invoice History** — same ledger or a separate manual cash log?
   ✅ **Resolved (§7.9, Phase 7, built): neither extreme — PARTIAL RECONCILIATION.** `Payment`
   is not a fully standalone cash log (it can optionally attach to a real `Invoice` and update
   its balance/status), but it's also not full invoicing/ledger duplication (no auto-numbering,
   no recurring generation, no ledger views — `Invoice` stays the same Phase 2 placeholder
   model). When a `Payment` has both a `customerId` and an `invoiceId`, applying it reduces that
   `Invoice.balance` by the payment amount and updates `Invoice.status` — `"paid"` if the
   balance reaches 0, otherwise the newly-added `"partially_paid"` value (§6.6). A manual-only
   payment, or a `customerId` with no `invoiceId`, is just logged — expected, not a gap, since
   not every payment is tied to a specific invoice.
4. **Transport/Travel distance** — ✅ **Resolved 2026-07-13** (as a Payroll prerequisite,
   §7.7 STEP 0b): it feeds payroll. `TravelLog` was retrofitted with a `status`
   (`pending`/`approved`/`rejected`) approval workflow — see §6.5/§7.6 — and
   `payroll.service.js#runPayroll`'s `mileageReimbursement` sums `distanceKm` only from that
   employee's **`status: "approved"`** entries for the month, never `pending`/`rejected` ones,
   multiplied by the `MILEAGE_RATE_PER_KM` env var (§3, a deliberately simple v1: one global
   rate, not per-role/per-project).
5. **Payroll** — ✅ **Resolved 2026-07-13** (§7.7, built this task): **record-keeping only for
   v1.** `Payroll.paidOn` is a computed field recording when the salary is expected to be paid
   (the 1st of the following month), not a trigger for any real money movement — no payment-
   gateway/disbursement integration was built. Revisit only if the client explicitly requests
   real disbursement integration later.
6. **File storage provider** — ✅ **Resolved 2026-07-13:** Cloudinary, used uniformly across
   all environments for attendance login photos, ticket attachments, and generated PDF/Excel
   reports. Env vars added to `.env.example` (§3): `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
7. **Leave cadence** — ✅ **Resolved 2026-07-13:** one paid leave per **month**, not
   quarter/year — matches smartrays.md's monthly Payroll cadence ("Salary get paid on the first
   day of every month", §7.7's `POST /payroll/run?month=&year=`). **No carry-over**: an unused
   paid leave in one calendar month does not roll into the next. Neither source document says
   anything about carry-over either way — this is a deliberate assumption stated explicitly here
   because the alternative (accumulating unused leave) was genuinely ambiguous, not implied by
   anything else in the plan.
   **Confirmed 2026-07-13 (follow-up review): the quota is enforced at APPROVAL time, not at
   request time, and this was already how it was implemented — not a fix.** `requestLeave` never
   checks the quota at all; an employee can always submit a second (or third) paid leave request
   in the same month, and it's created as `pending` like any other. `approveLeave` is the only
   place the quota is checked: a single paid request over 1 day is rejected (409) outright, and
   approving a request is rejected (409) if the employee already has another **approved** paid
   leave in that same calendar month (pending/rejected requests never count toward the quota).
   This is the more correct design — a request existing isn't the same as it being granted, so
   blocking the *request* would conflate "asked for" with "entitled to." Locked in by a test that
   submits two paid requests for the same employee in the same month (both succeed, 201) and then
   approves both in sequence (first succeeds, second is rejected with a message naming the
   quota). See §7.5 for the full build.
8. **Credentials vault encryption** — ✅ **Resolved 2026-07-13:** env-based AES-256-GCM, a
   single symmetric key in `CREDENTIALS_ENCRYPTION_KEY`, per-record random IV
   (`Credential.passwordIv`), no automated rotation in v1 — a KMS was deemed unnecessary
   complexity for this scale; manual key rotation is a documented runbook step if ever needed.
   ✅ **Implemented in code 2026-07-13** (§7.2, same day as the customer module) —
   `src/services/credentialEncryption.service.js`; `CREDENTIALS_ENCRYPTION_KEY` is now a
   required env var.
   See §6.3/§7.2.
9. **Team scoping** — ✅ **Resolved 2026-07-13:** no separate `Team` collection. "Own team"
   is computed from `User.managerId` (self-reference, direct reports only, one level, no
   recursive org chart). See §6.1/§6.7/§5.
10. **Customer Portal auth & account creation** — ✅ **Resolved** (§7.0/§7.8, Phase 5, built):
    Customer Portal users authenticate through the **same** auth system as every other role —
    `role: "customer"`, the same JWT/cookie flow, the same `POST /auth/login` — no separate
    auth mechanism. Accounts are **self-signed-up** (`POST /auth/customer/signup`), not
    admin-created, verified by an **email-domain match** against known `Contact`/`Customer`
    emails rather than an admin grant; rejected (400) with no match. See §6.1 (`User.customerId`)
    and §7.0/§7.8 for the full write-up.

---

*Supersedes the raw module list in `.context/smartrays.md` for scope/data-model/API detail.
`.context/smartrays.md` remains authoritative for tech stack, coding standards, and folder
structure (unchanged here). `.context/leads-customer-functional-spec.md` was used only as a
UX/data-model reference for Leads & Customers — its actual tech stack (Next.js/Supabase) is
not part of this project.*
