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
| `team` | ✅ Built (§7.24, 2026-07-30) | Admin-only org-structure entity (name/type/head) layered over the existing `managerId` scoping — no stored member list, see §11.9 |
| `lead` | ✅ Built (§7.1) | Sales pipeline: board/table, call logging, conversion entry point — conversion is now a real implementation (§7.2, 2026-07-13), not a 501 stub |
| `location` | ✅ Built (§7.4b) | Live GPS tracking during an open shift — live view + day-trail history |
| `permission` | ✅ Built (§7.12); frontend built (§7.27, 2026-07-30) | Role permission templates + per-user overrides — the authorization data source itself. **Boot-time drift reconciliation (§7.12b, 2026-08-03)** — auto-syncs each role template's key set against `INITIAL_TEMPLATE_DEFAULTS`/`PERMISSION_REGISTRY` on every server start, never touching a customized value |
| `attendance` | ✅ **Fully built** (§7.4, 2026-07-13) | Check-in/check-out with photo capture (Cloudinary) + connectivity-gap-adjusted `workingHours` + own/team/org history and PDF/Excel reports |
| `customer` | ✅ Built (§7.2, Phase 2, 2026-07-13) | Client account: billing, contracts, contacts, credentials vault, activity log, contract→Project automation. `Invoice` remains a minimal placeholder model — Phase 7's Payments module (§7.9) adds partial balance/status reconciliation onto it, not full invoicing |
| `project` | ✅ Built (§7.3, Phase 2, 2026-07-13) | Delivery unit linked to a customer/contract; owns team assignment. No direct creation endpoint — always born from a Contract. Originally also owned Task functionality, deliberately removed 2026-07-29 (§6.4/§7.3) |
| `leave` | ✅ Built (§7.5, Phase 3, 2026-07-13) | Leave requests/approval, one-paid-leave-per-month quota (§11.7), the 2x unapproved-absence rule |
| `payroll` | ✅ Built (§7.7, Phase 4, 2026-07-13) | Monthly gross/net computation from Attendance + Leave + approved TravelLog data, mileage reimbursement, PDF payslips, monthly `node-cron` job |
| `ticket` | ✅ Built (§7.8, Phase 5) | Internal + Customer Portal support ticket lifecycle — raise/list/assign/status/comments/attachments. Customer Portal self-signup (§7.0) is a companion piece, built the same task |
| `payment` | ✅ Built (§7.9, Phase 7) | Admin-only manual payment log, with optional partial reconciliation against an existing `Invoice` (§11.3, resolved) |
| `amc` | ✅ Built (§7.10, Phase 7) | Annual maintenance contract tracking per customer, "own team"/"own" scoped via the underlying Customer's ownership |
| `report` | ✅ Built (§7.11, Phase 8; analytics endpoints added §7.23) | Unified `POST /reports/generate` dispatcher (attendance/leave/payroll/transport/leads/customers) — uploads to Cloudinary, returns a download URL. `GET /attendance/report`/`GET /travel-logs/report` now internally reuse it (breaking response-shape change). §7.23 adds 11 `GET /reports/analytics/*` MongoDB-aggregation endpoints (the first aggregation pipelines in this backend) in a new sibling `analytics.service.js`/`analytics.controller.js`, reusing each target module's own scoping logic |
| `notification` | ✅ **Built (§6.7/§7.11-Platform, Phase 9, 2026-07-16)** | `Notification`/`PushSubscription` models, Web Push (VAPID) delivery via `web-push`, self-scoped subscribe/list/mark-read endpoints. Wired into Leads (assignment + a 24h/15m follow-up-reminder cron) and Ticket assignment (a deliberate small addition beyond the Leads-only spec) — see §7.16 |
| `transport` | ✅ Built (§7.6, Phase 6, 2026-07-13) | Distance-per-shift (auto from Attendance checkout, or manual entry) via Google Maps, separate from `location`'s raw GPS stream. Approval workflow (`pending`/`approved`/`rejected`) added 2026-07-13; only `approved` entries feed Payroll mileage reimbursement (§11.4, resolved) |
| Dashboards | ✅ **Built (§7.13/§7.20/§7.21, Phase 9)** | Frontend widget shell composed by role + permissions, declarative widget catalog (`dashboardConfig.js`) — no dedicated backend module. Leads + Customers widgets (§7.20) plus 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/Payroll (§7.21); an Employee-facing own-scoped widget is a future incremental addition using the same pattern |
| `frontend` (scaffold) | ✅ **Built (Frontend Phase 0, 2026-07-16)** | Vite + Tailwind + Ant Design scaffold, API client, session store, route guards, dashboard/portal layout shells, full §8 route map wired (every route exists; only `/login` and `/` are functionally complete, the rest are placeholders) — see the Frontend Phase 0 LLD entry below and `frontend/README.md` |
| `lead` (frontend) | ✅ **Built (2026-07-16) — the reference implementation for every later frontend module** | Table View + Board View (`@dnd-kit` kanban) behind one shared page shell, Lead Detail slide-over (real route), Import wizard, filtered export — see §7.15 |
| `customer` (frontend) | ✅ **Built** | List View (search/owner/status filters, bulk activate/deactivate/delete) + Add Customer wizard (surfaces the backend's contract automation explicitly) + a real Customer Detail full page (billing/site details/contracts/contacts/activity log). Credentials Vault UI deliberately removed 2026-07-29 (backend/data untouched, just not surfaced) — see §7.17 |
| `attendance` (frontend) | ✅ **Built** | Check-in/out widget (native `getUserMedia`+`<canvas>` camera capture, native `Geolocation`, both mandatory before submit) + Personal/Team/Admin timeline views (**list/table only, no calendar anywhere — removed 2026-07-31, §7.5e**) with connectivity gaps rendered as red bar segments + report download via the unified dispatcher — see §7.18. **UI-read-only for every role (2026-07-31)** — admin manual-correction UI removed; `/attendance` redefined for admin as an org-wide, 5-filter view (`AdminAttendanceView`) — see §7.18's dated write-up |
| `leave` (frontend) | ✅ **Built** | Request modal (hidden for admin, §7.5c) + role-shaped tabs (**no "All" tab, no calendar — removed 2026-07-31, §7.5e**: admin none/unified-filterable, manager Own+Team, everyone else none) + Approve/Decline/Mark Unapproved Absence/**Delete** gated per-action (admin org-wide, manager on their own team, §7.5c/§7.5d), the latter two's consequence shown directly in the confirm prompt — see §7.18. **Extended 2026-07-31 (§7.5c/§7.5e):** required Reason field (request form + expandable Admin-table row + dashboard widget), Employee/Team/Status/Date-range Admin filters (Team filter corrected in §7.5e to use the real `Team` entity), wider columns + horizontal scroll |
| `location` (frontend) | ✅ **Built — a new route, `/location`, with no prior frontend at all** | Live map (auto-polling `GET /location/live`) + History map (employee+date picker, `GET /location/history` as a polyline) via a generic `LeafletMapView` (`react-leaflet` + free OpenStreetMap tiles, no API key — migrated 2026-08-04 from the Google Maps JS SDK, which was never actually functional in production since no billing/key was ever configured) — see §7.18/§11.11 |
| `user` (frontend) | ✅ **Built (§7.19, 2026-07-17)** | `/settings/users` roster list/edit/deactivate/reactivate/admin-password-reset/create, plus self-service + admin-override password reset (`/forgot-password`, `/reset-password`) — see §7.19 |
| `dashboard` (frontend) | ✅ **Built (§7.20/§7.21)** | `/dashboard` shell composing Leads + Customers widgets (§7.20) plus 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/Payroll (§7.21) — by role via a declarative catalog, each widget independently permission-gated and independently fetching/failing — see §7.20/§7.21 |
| `payment` (frontend) | ✅ **Built** — the first real UI for this previously backend-only module | `/payments` (admin-only): date-range filter tabs (Today/Yesterday/This Month/Financial Year/All Time) driving a server-paginated table + a Record Payment modal with a genuinely debounced customer search — see §7.22 |
| `reports` (frontend) | ✅ **Built (§7.23)** — `/reports`, the app's first-ever data-visualization page (`@ant-design/charts`, a new dependency) | Leads/Customers/Financial/Workforce chart sections (11 `@ant-design/charts` charts + one AMC renewals list) built on the 11 new analytics endpoints, each independently permission-gated/loading/error-isolated, plus a proper UI home for the pre-existing `POST /reports/generate` export dispatcher (module/filters/format picker) — see §7.23 |

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
- **"Own team" is always computed from `User.managerId`** (self-reference, direct reports only,
  one level) — a `Team` collection was added later (§7.24) as an admin-only org-structure label,
  but it has no stored member list of its own and sets `managerId` under the hood, so this
  scoping mechanism is unchanged. See §11.9.

#### External Integrations at a Glance

| Service | Used for | Status |
|---|---|---|
| Cloudinary | File storage — attendance photos, ticket attachments | ✅ Wired and in use — `src/services/cloudinary.service.js`, Attendance check-in/check-out photos (§7.4, 2026-07-13) and Ticket attachments (§7.8, `uploadTicketAttachment`, `resource_type: "auto"` since attachments aren't guaranteed to be images). Generated PDF/Excel reports (§7.11) briefly went through Cloudinary too (Phase 8) but were moved off it 2026-08-04 — reports are now streamed directly, never uploaded anywhere |
| Google Maps Distance Matrix | Computing per-shift travel distance for the Transport/Travel module | ✅ Wired and in use (§7.6, 2026-07-13) — `src/services/googleMaps.service.js`, no SDK dependency (calls the REST API via `fetch`) |
| Web Push (VAPID) | Push notifications — lead assignment, follow-up reminders, ticket assignment | ✅ Wired and in use (§6.7/§7.16, Phase 9, 2026-07-16) — `src/services/webPush.service.js`, no SDK beyond the `web-push` npm package itself. ✅ Browser-side receipt (service worker + Settings toggle) built 2026-08-07, §6.7 — end-to-end, verified against a real push service |

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
  **Added 2026-07-30 (§7.28):** `DeletedUserAuditLog` — a new, separate collection, written once
  per hard-delete (see below); the only place a deleted user's data survives afterward.
- **API surface:** `/users/dropdown`, `/users` (list), `/users/:id` (get/update),
  `/users/:id/deactivate`, `/users/:id/reactivate`, `/users/:id/manager` — full list at §7.0b.
  **Added 2026-07-30 (§7.28):** `DELETE /users/:id` — guarded, permanent hard-delete.
  **Added 2026-07-31 (§7.31):** `GET /users/:id/deactivation-impact` — what needs reassigning
  before deactivation; `PATCH /users/:id/deactivate`'s body now optionally accepts
  `{ reassignTeamsTo, reassignLeadsTo }`.
- **Permission requirements:** `users.view_team`/`view_all` for list/get-others; account-
  lifecycle actions (`deactivate`/`reactivate`/`manager`/**`delete`**) are `requireAdmin`,
  matching how account creation itself is gated in `auth` (§7.0).
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
- **Test coverage:** 62 tests (31 from the original build + 2 for `baseSalary` §7.7 + 8 for the
  team-head deactivation guard §7.28 + 5 for the 2026-07-30 hard-delete addition below, + 4 for
  the `teamId` filter + 12 for the 2026-07-31 guided-reassignment rework, §7.31 below). Found and
  fixed one real bug during the original build: a plain object
  spread in `getUserById` let the scope filter's `_id` key silently clobber the explicit
  `_id: targetId` constraint, so a manager could fetch an unaffiliated user's record instead of
  getting the expected 404 — fixed with `$and` instead of a spread. Caught by a test.

**Guarded hard-delete (`DELETE /users/:id`, added 2026-07-30, §7.28) — a real reversal of this
module's own earlier "no hard delete" stance**, not a variation on it. Every deviations note
above and every design decision through 2026-07-13 assumed deactivate/reactivate (a reversible
flag flip) was the *only* account-lifecycle end-state — there was never a delete endpoint, and
nothing in the original write-up even considered one. That assumption no longer holds: an admin
can now explicitly, permanently delete an account, with three conditions gating it in this exact
order — the account must already be deactivated (`isActive: false`), it must not currently be
any Team's `headManagerId` (defensive; should already be unreachable via the deactivate guard),
and a `reason` is mandatory (no undo exists once this runs). The reasoning for allowing this now,
where it was explicitly not built before: an admin-stated need to actually remove long-departed
accounts from the roster view, not just hide them behind an Inactive filter forever. A full
snapshot is written to the new `DeletedUserAuditLog` collection immediately before the delete —
the only place that data survives — and nothing elsewhere is cascade-deleted or rewritten: every
other module's existing "resolve an id to a name, fall back to `—`" convention (Leads' owner,
Attendance, Payments' collector, etc.) already displays a deleted user's old records gracefully,
so there's nothing to fix up there. See `backend/README.md`'s User Management section for the
full guard write-up and `frontend/README.md`'s "User Management Action column rework" section for
the UI side (icon-only Deactivate/Reactivate, a Delete icon shown only on Inactive rows, a
dedicated confirmation modal requiring a reason).

**Deactivate reworked to guided reassignment (§7.31, 2026-07-31) — a genuine reversal of the
2026-07-30 team-head hard-block guard (§7.28), not a variation on it.** That guard simply
refused to deactivate a team head outright, naming the team(s) and requiring the admin to go
reassign elsewhere first, then retry the exact same deactivate call. Now `PATCH /users/:id/
deactivate` does the reassignment itself, in the same request — and the scope grew beyond teams
too: a lead owner's still-open Leads (`status` not `won`/`lost`) now also need a new owner before
deactivation, not just a team's head. A new `GET /users/:id/deactivation-impact` tells the
frontend what's needed (`teamsLed` with member counts, `ownedLeadsCount`) so it can show a
reassignment modal before the final confirm rather than a hard rejection after clicking. With
nothing to reassign, deactivation behaves exactly as it always did — this only changes the path
for someone who currently leads a team or owns open leads. **Checked, not assumed, whether to
wrap the reassignment + deactivation in a Mongo transaction:** this app's dev/test database
(`mongodb-memory-server`, standalone, no replica set) doesn't support multi-document transactions
at all, only the production Atlas cluster does — so validate-everything-before-writing-anything,
then apply in a fixed order (team heads, lead owners, deactivation), was used instead of a
transaction that would break the entire test suite for this feature. See `backend/README.md`'s
User Management section for the full guard write-up and `frontend/README.md`'s "Deactivate
reworked to guided reassignment" section for the UI side (`DeactivationReassignModal.jsx`, one
`Select` per led team plus a single lead-owner `Select` when needed).

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

##### Projects (§7.3, Phase 2, built 2026-07-13; Task removed 2026-07-29)
- **Data model:** `Project` — §6.4, built as designed.
- **API surface:** `GET /projects`, `GET /projects/:id`, `POST /projects/:id/team` — full list at
  §7.3. **No `POST /projects`** — a project is only ever created via the customer module's
  contract automation above, never directly.
- **Permission requirements:** `projects.view`/`assign_team` — real, admin-editable grants
  (manager/admin get both by default), not hardcoded role checks, per §4.1.
- **Key invariants:** "Team members addable by Manager/Admin only" (§7.3) is interpreted
  narrowly: holding `projects.assign_team` is necessary but not sufficient — the caller must also
  be *this specific project's* `projectManagerId`, or admin. A project has no `managerId`-based
  "own team" scoping the way Leads/Customers do — visibility is admin-sees-all, else
  PM-or-team-member-only.
- **Known deviations:** none from the ask.
- **Test coverage:** 10 tests (19 originally, minus 9 Task-specific tests removed alongside the
  feature), no application bugs found.
- **Task functionality — deliberately removed 2026-07-29.** This entry originally also covered a
  `Task` model (§6.4), the endpoints `GET /projects/:id/tasks`/`POST /tasks`/
  `PATCH /tasks/:id/start`/`PATCH /tasks/:id/stop`, the `tasks.view`/`assign` permission grants,
  and the server-side one-`in_progress`-task-per-employee constraint. Removed at the user's
  request (backend + frontend + docs), Project itself left fully intact — see §6.4/§7.3 for the
  full historical record.

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
  as Attendance check-in/out. `/approve`, `/decline`, and `/mark-unapproved-absence` are
  `authorize("leave", ...)`-gated, not `requireAdmin` (**reversed 2026-07-31, §7.5c** — see below);
  admin keeps unconditional org-wide access via `can()`'s bypass, and manager now holds all three
  by default, scoped to their own team via a service-level `managerId` check.
- **Key invariants:** one paid leave per calendar month, no carry-over (§11.7) — a single `paid`
  request over 1 day is rejected outright, and approving one is rejected if it would push the
  employee's other *approved* paid-leave days for that month over 1; only an admin may request
  leave on behalf of someone else (needed so `mark-unapproved-absence` has a record to act on for
  an employee who never self-requested — admin is otherwise blocked from requesting for
  themselves, §7.5c below); `mark-unapproved-absence` is an unconditional decree (works regardless
  of current status) that always sets `isDoubleDeduction: true`; `reason` is required on request
  submission (§7.5c below).
- **Known deviations:** "date(s)" (§6.5) built as an inclusive `startDate`/`endDate` range, the
  simplest reading that still covers a multi-day request.
- **Test coverage:** 56 tests (18 original + 23 for half-day/decline/balance/notifications + 15
  for §7.5c), no application bugs found. **Confirmed 2026-07-13 (follow-up review):** one test
  explicitly proves the quota is enforced at approval time, not request time — two paid requests
  for the same employee in the same month both submit successfully (201), the first approval
  succeeds, and only the second is rejected (409, with a message naming the quota). This was
  already the implemented behavior, not a fix.
- **Manager parity + admin exemption + required `reason` (2026-07-31, §7.5c):** reverses the
  original "`/approve`/`/decline`/`/mark-unapproved-absence` are admin-only" design — manager now
  gets all three, scoped to their own direct reports (`ensureCanActOnLeave` in `leave.service.js`,
  the same "route confirms a grant, service resolves the record's team scope" split
  `getLeaveBalance`/`getTeamAttendance` already use). Admin is now blocked from requesting leave
  for themselves (mirrors the same exemption added to Attendance), but the admin-on-behalf-of
  mechanism (`payload.employeeId`) is untouched since `mark-unapproved-absence` depends on it to
  have a record to act on. `Leave.reason` (already existed, previously optional) is now required
  at both the schema and validation layer, kept separate from `declineReason`.

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

**Updated (§7.23) — 11 new `GET /reports/analytics/*` endpoints added alongside this same
dispatcher**, in a new sibling `analytics.service.js`/`analytics.controller.js` (this dispatcher,
`report.service.js`/`report.controller.js`, is untouched) — see §7.23 for the full write-up.

##### Dashboards (§7.13/§7.20/§7.21, Phase 9)
- **Data model:** none — a frontend composition concept.
- **Key invariants:** one dashboard shell composing widgets by role + permissions, not four
  separate per-role codebases. Permission-gating happens twice, deliberately: `dashboardConfig.js`
  picks per-role candidates, and each widget independently re-checks its own real permission
  before rendering (a per-user override can diverge from the role's template default).
- **Known deviations:** none from either task's own scope. §7.20 built Leads + Customers
  widgets; §7.21 added 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/
  Payroll. An Employee-facing own-scoped widget is a stated future incremental addition using
  the same pattern (write the widget, add one line to `dashboardConfig.js`), not a gap.

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
| Push notifications | Web Push (VAPID) via a PWA service worker + `web-push` npm package — ✅ **backend half wired 2026-07-16** (§7.16, Phase 9): `web-push` sender, `Notification`/`PushSubscription` models, VAPID keypair now required env vars. ✅ **Client half wired 2026-08-07** (§6.7): `public/sw.js`, `pushSubscription.js`, a Settings → Account toggle, and the optional `VITE_VAPID_PUBLIC_KEY` frontend env var |
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
GEOFENCE_RADIUS_METERS=500       # see §6.5/§7.4 — meters a location ping may drift from the
                                  # shift's check-in point before a geofenceViolations[] entry is
                                  # recorded. Not required — defaults to 500 if unset.
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
| leave request/approve/decline/mark-unapproved-absence/delete | ✅ org-wide, blocked from requesting for self (§7.5c) | own team: request/approve/decline/mark-unapproved-absence/delete all default (§7.5c/§7.5d), plus `view` for their own history (§7.5d); blocked outside own team | request only | request only | – |
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

**"Own team" definition (§11.9, resolved 2026-07-13, extended 2026-07-30):** "Own team" means
the set of `User` documents whose `managerId` equals the requesting manager's `_id` — a single
level of direct reports, not a recursive org chart. Every "own team" cell in this matrix (Leads,
Customers, Attendance, AMC) and every "team" scope query in §7 is scoped this way. See §6.1/§6.7
for the schema change. `location.view_team` (added 2026-07-13, §7.4b) reuses this exact same
`managerId` scoping — no separate team concept for location either.

**Reversal (2026-07-30):** a `Team` collection was later added (§7.24) as an admin-only org-
structure layer — name/type/head, admin-only CRUD — but it deliberately does **not** change the
scoping mechanism above. `Team` stores no member list of its own; adding a user to a Team is
implemented as literally setting that user's `managerId` to the Team's `headManagerId` (reusing
`user.service.js#assignManager`), so a Team's membership is always just `User.find({managerId:
team.headManagerId})` — the exact same query every "own team" scope already ran. The original
"no separate Team collection" call was about not needing a stored membership list to compute
"own team" — that's still true; `Team` is a thin admin-facing label over the same `managerId`
data, not a second source of truth. A user can only ever be in one team at a time, as a direct
consequence of `managerId` being a single field.

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
`leave.view: true` by default (their own requests); `manager` gets `leave.view_team: true`, plus
(2026-07-31, §7.5c) `approve`, `decline`, and `mark_unapproved_absence` by default, scoped to their
own direct reports at the service layer. *Requesting* leave (`POST /leave/request`) needs no grant
at all regardless of role — a self-service action, same as Attendance check-in/out — except that
an admin is blocked from requesting for themselves (§7.5c), the on-behalf-of path for other
employees remaining open to them.

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
| managerId | ObjectId → User (self-reference) | optional; set on `employee`/`sales_associate` docs to their manager. "Own team" queries elsewhere in this doc filter by `managerId == requestingManager._id`. A `Team` collection (§7.24) now exists as an admin-facing org label, but adding a user to a Team just sets this same field — see §11.9's 2026-07-30 reversal note |
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

### 6.4 Projects

**`Project`** — name, customerId, projectManagerId, teamMemberIds[], type (`recurring`/`onetime`),
status (`active`/`completed`/`paused`), linkedContractId, createdAt

**Task functionality — deliberately removed 2026-07-29.** This section originally also specified a
`Task` model: projectId, title, assignedToId, status (`todo`/`in_progress`/`done`), startedAt,
stoppedAt — with a server-side constraint of one `in_progress` task per employee at a time,
enforced in the service layer (not just a disabled button) to survive multi-tab/multi-device
races. Task was fully removed at the user's request (backend model/routes/service/controller/
tests, the `tasks` permission registry entry, and the frontend `TasksPage`/nav entry) — this note
preserves the historical record of what existed rather than silently deleting it.

### 6.5 Workforce

**`Attendance`** — employeeId, date, checkIn {time, coords, photoUrl}, checkOut {time, coords, photoUrl}, status (`present`/`absent`/`half_day`/`on_leave`), workingHours (computed), connectivityGaps[] (start, end) — rendered red on the timeline for network-drop/forced-logout periods.
✅ **Fully built 2026-07-13** (§7.4) — one field beyond this list was added during that build:
`lastHeartbeatAt` (Date, internal bookkeeping for connectivity-gap detection only, never exposed
as its own API concept — see §7.4's connectivity-gap design writeup for why it's needed).
**Extended for admin manual correction (§7.4's admin-correction addition, frontend Attendance
task):** two more fields — `isManuallyAdjusted` (Boolean, default `false`) and `adjustedBy`
(ObjectId → `User`, default `null`) — set together whenever `PATCH /attendance/:id` or
`POST /attendance/manual` (both admin-only) touch a record, so it's always visibly
distinguishable from a real, photo-verified self-check-in in both the API response and the UI.
`checkIn.time` was also relaxed from schema-required to optional (`default: null`) — a
manually-created `absent`/`on_leave` record legitimately has no real check-in event, and
synthesizing a fake timestamp for it would undermine the very distinction these two new fields
exist to preserve; the real self-service check-in path is unaffected and still always sets a
real timestamp there.
**Extended for geofencing (added later, §7.4's geofencing addition):** one more field,
`geofenceViolations` (`[{ start, end, maxDistanceMeters }]`) — structurally parallel to
`connectivityGaps[]`, rendered red on the timeline the same way, but a distinct color/marker
from connectivity gaps in the UI (an admin needs to tell the two issue *types* apart, not just
see "something was wrong"). **Design decision: geofenced against the shift's own `checkIn.coords`
(already stored, reused as-is, no new field needed to hold it), not a per-site/fixed-office
geofence.** A per-site geofence — a configured office location + radius, independent of where
an employee actually checked in — was considered and deliberately **not** built: this system has
no "site"/"assigned office" concept anywhere in its data model (Customer has a `siteAddress`, but
no `User`/`Attendance` record is ever assigned to one), and neither smartrays.md nor this plan
ever described one. Geofencing against the check-in point directly answers this task's own
literal framing — "moves beyond a radius from their check-in point" — with zero new
configuration surface; a per-site model would be a materially different, larger feature (site
management, assigning employees to sites) that wasn't asked for. `GEOFENCE_RADIUS_METERS` (new
env var, optional, defaults to 500) tunes the radius. See `backend/README.md`'s Attendance
section for the full violation-window design (live, not retroactive, unlike connectivityGaps —
a violation can be genuinely open (`end: null`) between pings) and why distance is computed via
a plain Haversine formula (`src/services/geo.service.js`, new) rather than the Google Maps
Distance Matrix API `googleMaps.service.js` already uses for TravelLog.
**`Leave`** — employeeId, date(s) (built as an inclusive `startDate`/`endDate` range — the
simplest reading of "date(s)"), type (`paid`/`unpaid`/`unapproved_absence`), approvedBy,
isDoubleDeduction (Boolean — true only for the unapproved-absence-marked-by-admin case, per the
2x rule). ✅ **Built 2026-07-13** (§7.5) — one field beyond this list was added: `status`
(`pending`/`approved`/`rejected`), necessary to support the request→approve workflow §7.5's own
endpoints imply (a leave request has to start somewhere before an admin can "approve" it).
**Extended later (§7.5's five additions):** `isHalfDay` (Boolean, default `false`) — a half-day
request counts as 0.5 days against quotas/payroll rather than a full day; validation requires
`startDate === endDate` whenever it's true. `declineReason` (String, nullable) — set only by the
new `PATCH /leave/:id/decline`, kept separate from the existing `reason` field so declining never
overwrites the requester's own stated reason for taking leave. No new `status` enum value was
needed — `declineLeave` sets the existing, previously-unused `"rejected"` value.
**Made required (2026-07-31, §7.5c):** `reason` (previously optional) is now `required: true` at
the schema layer, plus enforced (400) at the validation layer on request submission.
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
full reconciliation logic. **Extended 2026-07-30 (§7.9)** with an edit/delete audit trail:
`isDeleted`/`deletedAt`/`deletedBy`/`deletionReason` (soft delete, chosen since these are
financial records — never truly destroyed, only excluded from list/total queries), plus a new
sibling `PaymentAuditLog` collection (`paymentId`, `action`, `changedBy`, `reason`,
`previousValues`) recording every edit/delete. See §7.9 for the full design.
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

✅ **Client half built 2026-08-07** — the browser can now actually receive a push. Until this,
the backend had been sending into nothing: a push only reaches a browser through a **service
worker**, and none existed.

- `frontend/public/sw.js` — `push` shows the notification, `notificationclick` focuses an
  already-open tab and navigates it (opening a new window only if the app is closed). It
  **caches nothing and has no `fetch` handler** — a cache would serve stale HTML after a
  deploy, which is a worse problem than the one push solves.
- `frontend/src/modules/notification/pushSubscription.js` — subscribe/unsubscribe, permission
  reporting, and re-sending a **rotated** subscription. A browser can silently issue a new
  endpoint; if the server never hears about it, every push 410s and the subscription is
  deactivated, so push dies with no visible cause. `syncSubscription()` on load compares
  against the last endpoint sent (localStorage) and re-POSTs on a mismatch.
- `PushNotificationToggle` in Settings → Account — the **only** thing that ever calls
  `Notification.requestPermission()`.
- `notificationRoutes.js` — one route table shared with the bell, so a push and an in-app click
  land in the same place. `sw.js` must carry a duplicate (a worker is a standalone script
  served from the site root and cannot import from `src/`), so its test parses the real
  `sw.js` off disk and asserts the copies agree.

**The worker registers on load; permission is deliberately not requested on load.** A browser
prompts once, users reflexively deny, and **a denial can never be re-requested
programmatically** — so the prompt is tied to a deliberate click, and the `denied` state
renders a *disabled* switch plus an explanation that it must be changed in browser settings,
rather than an enabled-looking control that would silently do nothing forever.

**New optional env var `VITE_VAPID_PUBLIC_KEY`** — the **public** half only; the private key
must never reach the browser. It has to belong to the same backend `VITE_API_BASE_URL` points
at, since a subscription is cryptographically bound to the key that created it and a mismatch
fails at delivery with a 403, silently. Unset is a supported state, handled the same way as
`ATTENDANCE_CLEANUP_TOKEN`'s 503: **the toggle renders nothing** rather than offering a control
that cannot work.

Verified in a real browser (jsdom has neither service workers nor `PushManager`): a real push
signed by the backend's own `sendPush()` was accepted by FCM (`201`) and observed being
displayed by the worker with the right title, body and click target. Two environment traps
worth recording — **Chrome disables the Push API in incognito**, so Playwright needs
`launch_persistent_context`; and **headless Chromium always reports
`Notification.permission === "denied"`** regardless of `grant_permissions`, making the enable
path unreachable headless.

Manager-scoped "own team" views (Leads, Customers, Attendance, Leave, AMC) are computed by
looking up `User` documents where `managerId` equals the requesting manager's `_id` (see §6.1),
then filtering the target collection's `ownerId`/`employeeId` against that set — avoids keeping
a second membership list in sync with `User.managerId`. A `Team` collection (§7.24, added
2026-07-30) exists as an admin-facing org-structure label on top of this, but it stores no
member list — see §11.9's reversal note.

**`Team`** — name, type (free text), headManagerId (ObjectId → User, must be manager/admin),
isActive. See §7.24.

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
- **Duplicate detection on import** (added after the initial build) — a row is skipped
  (never created, never used to update an existing record) if its `email` OR `phone`
  (case/whitespace-normalized) matches an existing lead anywhere in the system, org-wide, not
  scoped to the importer. Deliberately excludes `companyName` — distinct genuine contacts can
  share a company. Checked against both already-saved leads and rows already accepted earlier
  in the same file, so two rows in one upload sharing an email/phone don't both get created —
  only the first is kept. Each skipped row is tagged `type: "invalid"` or `type: "duplicate"`;
  duplicates also carry `matchedField` and, when they matched an already-saved lead rather than
  an earlier row in the file, `existingLeadId`/`existingLeadName`. The import result reports
  `importedCount`/`duplicateCount`/`failedCount` as three separate totals. See
  `lead.service.js#importLeadsFromFile`.
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

### 7.3 Projects

✅ **Built and verified 2026-07-13** (10 tests after the 2026-07-29 Task removal below, `npm test`,
see `backend/README.md` → Testing), in the same task as `customer` (§7.2), which is what actually
creates a Project (there is no `POST /projects` — see below).

**Screens:** Project detail (team members, linked contract).
**Rules:** team members addable by Manager/Admin only (implemented narrowly — *this specific
project's* manager, or admin, not any user holding the manager role globally).
**Endpoints (✅ marks what's built; note there is deliberately no `POST /projects` — a project is
only ever created via the customer module's contract automation, §7.2/§6.3/§6.4):**
```
GET    /projects                                                                      ✅ built
GET    /projects/:id                                                                  ✅ built
POST   /projects/:id/team           add/remove member                                 ✅ built
```

**Task functionality — deliberately removed 2026-07-29.** This module originally also included a
Task board (per employee dashboard), the endpoints `GET /projects/:id/tasks`, `POST /tasks`,
`PATCH /tasks/:id/start`, `PATCH /tasks/:id/stop`, and the rule that starting a task enforced one
in-progress task per employee server-side — see §6.4 for the full historical record. Removed at
the user's request; the Project module itself (team add/remove, project CRUD, contract-linked
automation) was left fully intact.

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
PATCH  /attendance/:id          admin-only manual correction (status/checkIn/checkOut
                                 time; recomputes workingHours)                       ✅ built
POST   /attendance/manual       admin-only manual creation for a day with no record   ✅ built
```
Check-in/out photos upload directly to Cloudinary (§3/§11.6); `Attendance.checkIn.photoUrl` /
`checkOut.photoUrl` store the returned secure URL, not the binary.

**Admin manual correction, added later (frontend Attendance module task) — `PATCH
/attendance/:id` and `POST /attendance/manual`, both `requireAdmin`-gated** (no
`attendance.*` permission-registry tier exists for editing, only viewing — same precedent
`POST /payroll/run` already set for a genuinely admin-only, no-tier action). The `PATCH`
recomputes `workingHours` via the same `computeWorkingHours` helper the real checkout flow
uses, over the record's existing `connectivityGaps`; the `POST` 409s if a record already
exists for that employee+date. Both set the new `isManuallyAdjusted`/`adjustedBy` fields
(§6.5) unconditionally — see that section for the full audit-trail reasoning. 13 new tests
(6 + 7). Frontend originally surfaced this via a photo-viewer modal, a calendar-grid view,
summary stats, and an admin-only correction form. **Frontend correction UI removed 2026-07-31
(§7.18's dated write-up) — these two endpoints are now dormant, not deleted**, same treatment
as the Credentials Vault's backend layer: still fully functional, just not reachable from any
UI right now.

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

**Updated (Phase 8, §7.11) — `GET /attendance/report`:** `attendance.controller.js` calls the
`report.service.js#generateReport` dispatcher (`module: "attendance"`) internally —
`generateAttendanceReport` itself is completely unchanged, still the function that actually
fetches and renders the data. Through Phase 8 the dispatcher uploaded the result to Cloudinary
and this endpoint returned `{ downloadUrl }`; as of 2026-08-04 that upload step was removed
(§7.11's write-up has the full reasoning) and the endpoint streams the buffer directly again,
same as it did before Phase 8 — `attendance.test.js`'s report tests assert against the real
streamed response body/headers and explicitly confirm no Cloudinary function is called.

### 7.4c Attendance corrections/additions — Break In/Out, admin exemption, photo cleanup cron, granular manager permissions, notifications (2026-07-31)

✅ **Built** — five separate additions to §7.4/§6.5's Attendance module, done together:

1. **Admin exemption, server-side, not just frontend-hidden (the safer of two options this task
   raised, confirmed).** `POST /attendance/check-in` rejects (403) when the requesting user's
   role is `admin`. `checkIn`'s signature changed from `(employeeId, coords, photo)` to
   `(requestingUser, coords, photo)` to make the check possible — `checkOut`/`breakIn`/`breakOut`
   take the same shape too, both for consistency and because they need the full user for
   notifications (below). Check-out/break-in/break-out need no separate admin check — an admin
   can never reach an open-shift state at all, so they're transitively blocked.

2. **Break In/Out — a single break per shift (confirmed decision), not an array.** New
   `breakIn: { time, coords }` / `breakOut: { time, coords }` on `Attendance` — no `photoUrl` on
   either (confirmed: no photo required for a break), but `coords` IS required, same as check-in.
   `POST /attendance/break-in` (409 if no open shift, already on break, or the one break is
   already used) / `POST /attendance/break-out` (409 if not currently on break). **Checkout while
   on break: rejects with a clear message, doesn't auto-close (the safer of two options this task
   raised, confirmed)** — silently ending a forgotten break would hide a real state transition;
   `"You're still on break — end your break before checking out."` `workingHours` now also
   subtracts break duration (`computeWorkingHours`'s new 4th param, `breakMs = 0`, defaulting to
   0 so `createManualAttendance` is unaffected); `adjustAttendance`'s recompute call updated too,
   so an admin correction stays consistent with every other `workingHours` derivation.

3. **45-day Cloudinary photo cleanup cron — `src/cron/attendancePhotoCleanupCron.js`, mirroring
   `payrollCron.js` exactly.** Daily at 00:15. Finds records older than 45 days (by `date`) with
   a `photoUrl` still set, deletes the Cloudinary asset, clears `photoUrl`+the new
   `photoPublicId` to `null` — nothing else touched. Survives a single record's failure (logged,
   counted, batch continues) — same "never block on a single failure" principle as
   `applyGeofenceCheck`. **New field needed to make deletion possible, checked not assumed:**
   `public_id` was never stored anywhere before this — `uploadAttendancePhoto`'s return shape
   changed from a bare URL string to `{ secureUrl, publicId }` (both its callers updated).
   `checkIn.photoPublicId`/`checkOut.photoPublicId` are schema `select: false` (never meant to
   leak into a normal API response — the same treatment `User.passwordHash` already gets
   elsewhere), so the cron explicitly re-selects them.
   - **CHECKED EXPLICITLY, as this task asked, rather than assumed: do payroll/lead-reminder
     crons actually run in production today? No — a pre-existing, already-documented gap
     (`backend/README.md`'s Deployment section, `server.js`'s own comment), reconfirmed here by
     reading `api/index.js` directly: it never calls any `register*Cron()` function at all.**
     `server.js` only registers crons when `process.env.VERCEL !== '1'`, and node-cron needs a
     long-lived process a Vercel serverless function isn't. This new cron is registered the same
     way (consistency with the existing pattern, as this task asked), but that means **three**
     scheduled jobs now silently never fire in production, not two — surfaced loudly here rather
     than quietly compounded. Real fix (Vercel Cron hitting a dedicated endpoint, or leaving
     serverless) still outstanding — see `docs/project-status.md`.

4. **Granular manager permissions — `attendance.view_photos`/`view_location`.** Two new
   `PERMISSION_REGISTRY.attendance` actions, independent of `view_team`/`view_all` — seeing the
   team's records doesn't mean seeing the sensitive photo/coords fields inside them. Default OFF
   for manager (no template entry added — absence already means not-granted); grantable via the
   *existing* Individual User Overrides page, no new UI. `getTeamAttendance` strips
   `photoUrl`/`coords` per-viewer based on `can(requestingUser, "attendance",
   "view_photos"/"view_location")` (admin bypasses both automatically, via `can()`'s own admin
   short-circuit). **`getMyAttendance` — hard rule, no override possible:** always strips both,
   unconditionally, regardless of the viewer's own grants (even a manager/admin viewing their OWN
   history gets the stripped shape). **Also applied to the check-in/check-out/break-in/break-out
   response itself** — a deliberate reading of this task's own repeated, blanket wording ("NEVER
   ... regardless of any permission"), not just the two GET endpoints; the frontend already has
   both values locally at that point anyway. Existing tests that checked the pre-existing
   response-echoes-photo/coords behavior were updated to assert against the persisted document
   instead, matching this suite's own established "verify the real data, not just the response
   shape" precedent.

5. **Notifications — check-in/break-in/break-out/check-out, reusing `createNotification`, same
   pattern as Leads/Leave.** Notifies the employee (confirmation), their manager if set, and every
   admin — deduplicated via a `Set`. Four new `NOTIFICATION_TYPES`: `attendance_check_in`,
   `attendance_break_in`, `attendance_break_out`, `attendance_check_out`.

**Testing:** 65 tests in `attendance.test.js` (up from 31) + 6 new in
`attendancePhotoCleanupCron.test.js` (mirroring `payrollCron.test.js`'s structure). Full backend
suite: 642/642 passing, no regressions. See `backend/README.md`'s own Attendance section for the
complete write-up.

**Frontend half, built same day:** `PersonalAttendanceView.jsx` hides `CheckInOutWidget` entirely
for admin (backend already rejects, this just avoids showing a prompt that would fail).
`CheckInOutWidget.jsx`'s state machine extended for Break In/Out — no camera step, a single click
captures geolocation (new standalone `requestGeolocationOnce()`, `useGeolocation.js`) and submits
immediately; Check Out disabled with a tooltip while on break; "On Break since {time}" tag.
`AttendancePhotoModal.jsx` gained `showPhotos`/`showLocation` props — `TeamAttendanceView.jsx`
computes them via `usePermission("attendance", "view_photos"/"view_location")` (admin bypasses
both); `PersonalAttendanceView.jsx` passes both `false` unconditionally (hard rule, not
permission-based — matches the backend's own no-override-for-self rule). Missing grant omits the
section entirely rather than showing an empty placeholder, which would conflate "no permission"
with "no photo exists." **Deliberately NOT gated: the Timeline/Calendar list views' own
"Location" column** — that renders `GeofenceViolationBar` (a derived violation-timeline summary),
not the raw coords `view_location` actually governs; the backend itself never strips
`geofenceViolations` for any viewer, only `photoUrl`/`coords`, so gating this column would be
inconsistent with what's actually protected server-side. New Status filter on
`TeamAttendanceView.jsx` (`ATTENDANCE_LIFECYCLE_FILTER_OPTIONS`/`deriveAttendanceLifecycleState`,
`attendance.constants.js`) — a derived shift-lifecycle state (present/on-break/checked-out/
absent) computed client-side, distinct from the raw `status` enum. Notification bell needed no
type-specific rendering changes at all (it already displays any type generically via `message`) —
just a small `MODULE_ROUTES.attendance` addition so clicking one actually navigates somewhere.
10 new frontend tests (7 in `CheckInOutWidget.test.jsx`, 3 in `AttendancePhotoModal.test.jsx`).
Live-verified end-to-end against isolated dev server instances (temp manager+employee accounts,
cleaned up after) — admin-hidden widget, full break state-machine transitions, permission-gated
photo/location shown/hidden correctly before and after a live grant, Status filter, self-view
hard rule, and all four notification types. See `frontend/README.md`'s own §7.4c section for the
complete write-up.

### 7.4b Live Location Tracking

✅ **Built and verified 2026-07-13** (26 tests — 20 original + 6 new for geofencing, `npm test`,
see `backend/README.md` → Testing). Backend only at the time this section was written — **the
frontend map UI is now built too, see §7.18**. The API shape below (an ordered `{coords,
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
- **Geofencing (added later) — every ping is also checked against the shift's Attendance
  record.** `POST /location/pings` calls directly into `attendance.service.js#applyGeofenceCheck`
  (this module already imports the `Attendance` model for its own open-shift check, so a direct
  call into the sibling module rather than a duplicated implementation) — see §6.5's `Attendance`
  entry above for the full design (check-in-point geofence center, `GEOFENCE_RADIUS_METERS`,
  the live open/close violation-window shape, and why a plain Haversine formula is used instead
  of the Google Maps API). Never blocks or fails the ping itself.

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
manager can now also approve/decline/mark-unapproved-absence for their own team, scoped the same
way (**reversed 2026-07-31, §7.5c** — originally only Admin could call `/approve`,
`/decline`, or `/mark-unapproved-absence`; see below). Requesting your own leave needs no `leave.*`
grant at all (a self-service action, same reasoning as Attendance check-in/out) — except an admin
is now blocked from requesting for themselves (§7.5c); viewing leave data — even your own — does
need a grant, mirroring `location`'s three-tier permission shape (`view`/`view_team`/`view_all`)
rather than the unconditional self-access pattern `attendance`/`users` use, since §7.5 gives the
caller an explicit `?scope=own|team|all` choice to check against, not an implicit union of
whatever's held.
**Endpoints:**
```
POST   /leave/request                                                                 ✅ built
GET    /leave?scope=own|team|all                                                      ✅ built
GET    /leave/balance?employeeId=          (own always; team/all reuse view tiers)    ✅ built
PATCH  /leave/:id/approve         (admin org-wide, or manager own-team, §7.5c)        ✅ built
PATCH  /leave/:id/decline         (admin org-wide, or manager own-team, §7.5c;
                                    reason?, sets status: "rejected")                  ✅ built
PATCH  /leave/:id/mark-unapproved-absence   (admin org-wide, or manager own-team,
                                              §7.5c; sets isDoubleDeduction=true)      ✅ built
DELETE /leave/:id                (admin org-wide, or manager own-team, §7.5d;
                                    hard delete)                                       ✅ built
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

**Five additions (added later, frontend Leave module task) — half-day support, a balance
endpoint, a decline action, notifications, and a frontend team calendar view:**

- **Half-day leave (`isHalfDay: Boolean`, default `false`, added to the `Leave` model).** A
  half-day request counts as **0.5 days** against the monthly paid-leave quota and Payroll's
  leave-day math, rather than a full day. Every place that used to count inclusive calendar days
  — the quota check, the new balance endpoint below, and `payroll.service.js`'s own leave-day
  calculation — now goes through one shared, exported function, `leave.service.js#computeLeaveDays`,
  so "does half-day count as 0.5?" is answered in exactly one place, not re-derived per caller.
  Validation enforces `startDate === endDate` whenever `isHalfDay: true` (a half day only ever
  describes a single day), compared via the UTC calendar-date key rather than local date
  components — the same local-timezone day-boundary bug class already fixed for Attendance/
  Reports in earlier tasks this session.
- **`GET /leave/balance`** — reuses the exact quota-checking calculation the approval flow
  already has (a new shared `getApprovedPaidLeaveDaysForMonth` helper, called by both
  `ensureWithinMonthlyPaidLeaveQuota` and this endpoint) rather than a second implementation.
  Returns `{ paidLeaveUsed, paidLeaveLimit: 1, paidLeaveRemaining }` for the calendar month
  containing today. Own balance needs no permission grant (same "own data" precedent as
  `GET /attendance/me`); `?employeeId=` for someone else reuses the exact `leave.view_team`/
  `view_all` tiers `GET /leave?scope=` already checks, with a manager's `view_team` further
  scoped to their own direct reports.
- **`PATCH /leave/:id/decline` — a schema decision, not a new enum value.** `LEAVE_STATUSES`
  already declared `"rejected"` (present since the original build, but never actually set by any
  endpoint) — `declineLeave` sets that existing value rather than adding a redundant `"declined"`
  meaning the same thing; this is the first endpoint to ever use it. A new `declineReason` field
  was added, kept separate from the existing `reason` field (the requester's own reason for
  taking leave) so declining never overwrites that original context. `approvedBy` is reused to
  record which admin made the decline decision, the same treatment `mark-unapproved-absence`
  already gives that field despite its own outcome not literally being "approved" either.
- **Notifications** — reuses the existing Notification module's `createNotification`, no new
  infrastructure. Three new types: `leave_requested` (the requester's manager, if set, and every
  admin — the first "notify all admins" recipient shape in this codebase, a plain
  `User.find({ role: "admin" })`, rather than one specific already-known recipient, on
  `POST /leave/request`), `leave_approved`/`leave_declined` (the requester only, on the matching
  decision endpoint). Every path skips self-notification the same way Leads' assignment
  notification already does. Deliberately **not** wired into `mark-unapproved-absence` — that's a
  distinct, retroactive admin action the task didn't ask to notify on.
- **Frontend team leave calendar** — one row per team member, one column per day of the selected
  month (a client-side month filter over already-loaded records, no new endpoint), chosen over a
  single combined day-grid (Attendance's own calendar-view shape) because a leave request spans a
  date *range* and several employees can be on leave the same day; a per-day cell would either
  only show one employee or need to stack entries. See `frontend/README.md`'s "Half-day, balance,
  decline, calendar & notifications" section for the full frontend write-up, including the
  `GET /leave/balance`-per-row-column design for viewing an employee's balance from the Team/All
  scope table, and the Notification bell's `MODULE_ROUTES` gap that was found and fixed while
  confirming the bell actually surfaces the new `leave_*` types (it only knew `leads`/`tickets`
  before this task).

41 tests total (18 original + 23 new), all passing.

**Manager parity, admin exemption from requesting, and a required `reason` field (2026-07-31,
§7.5c) — reverses the earlier admin-only restriction on all three decision actions.** Reasoning:
managers already hold real team-scoped authority elsewhere (`leave.view_team`,
`attendance.view_team`, `users.view_team`); requiring an admin for every single leave decision on
a manager's own team didn't match that pattern and was an unnecessary bottleneck.

- `PERMISSION_REGISTRY`'s `leave` module gained `approve`/`decline`/`mark_unapproved_absence`;
  manager's default template now grants all three. The three routes moved from `requireAdmin` to
  `authorize("leave", ...)` — admin keeps working automatically via `can()`'s bypass. A new
  `leave.service.js#ensureCanActOnLeave(leave, requestingUser)` helper does the record-specific
  team check (admin short-circuits; otherwise 403s unless the leave's `employeeId.managerId`
  matches the requesting manager) — the same "route confirms a grant, service resolves the
  record's team scope" split `getLeaveBalance`/`getTeamAttendance` already use.
- Admin is now blocked from requesting leave for themselves (mirrors the same exemption added to
  Attendance) — but only when acting on their own behalf; the admin-on-behalf-of mechanism
  (`payload.employeeId`) is untouched, since `mark-unapproved-absence` depends on it entirely to
  have a record to act on for an employee who never self-requested.
- `Leave.reason` (already existed, previously optional) is now `required: true`, enforced
  additionally at the validation layer. Kept separate from `declineReason` — conflating the two
  would let a decline overwrite the requester's own original context.

15 new tests (manager own-team success and outside-team rejection for all three actions, a
no-grant role blocked, admin unaffected, admin blocked from self-requesting, `reason` required and
correctly stored/returned) — **56 tests total for the Leave module.** Full backend suite re-run:
654/654 passing across 21 test files, no regressions.

**Manager `view` grant + `DELETE /leave/:id` (§7.5d, 2026-07-31, same day) — discovered while
building the frontend's role-based Leave tabs (§7.18).** A manager had `view_team` but never
`view` — no way to see their OWN past leave requests, since `GET /leave` (scope=own) requires
`leave.view` specifically. `DEFAULT_ROLE_TEMPLATES.manager.leave` now includes `view: true`. New
`DELETE /leave/:id` reuses the exact same `ensureCanActOnLeave` team-scoping as
approve/decline/mark-unapproved-absence (admin org-wide, manager own-team); `PERMISSION_REGISTRY`
gained `delete`, manager's template grants it by default. **Same stale-template finding as §7.5c,
hit again:** this dev database's "manager" `RolePermissionTemplate` row was already re-seeded once
that same day for §7.5c and needed a second live `PATCH /permissions/templates/manager` for this
addition — confirmed zero manager accounts exist, so no user-level reset was needed; same shared
database backs production, so already live there too. 6 new tests (manager scope=own now works;
delete org-wide for admin; delete own-team for manager; blocked outside team; blocked for a
no-grant role; 404 for a nonexistent id) — **62 tests total for the Leave module.** Full backend
suite: 660/660 passing across 21 test files, no regressions.

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

**Updated (Phase 8, §7.11) — `GET /travel-logs/report`:** same migration as Attendance's report
endpoint above — `travelLog.controller.js` calls `report.service.js#generateReport`
(`module: "transport"`) internally, `generateTravelLogReport` itself is unchanged. As of
2026-08-04's Cloudinary removal (§7.11) the response streams the buffer directly again instead
of returning `{ downloadUrl }` — `travelLog.test.js`'s report tests were rewritten the same way
Attendance's were.

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

⏸️ **FRONTEND DEFERRED 2026-08-07 — hidden, NOT removed.** The nav item, both `/tickets` routes
and the two placeholder pages are gone from the UI; **the backend module, routes, model and data
are completely untouched and every test below still passes.** This is a scope deferral on a
module that remains core to this plan and still carries the Customer Portal dependency in §7.0 —
not a removal, and not a change of intent. What deliberately stayed: the `tickets.*` permission
tiers (the backend enforces them and the Permissions matrix still manages them), the frontend
`ticketApi` module, and the Dashboard's `TicketsOpenWidget`, which keeps reporting real counts
from the live endpoint. Ticket notifications are still created by the backend; their deep link
was removed from the shared notification route table rather than left pointing at a dead route.
See `frontend/README.md` → "Tickets deferred from the UI" for the restore steps.

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

**Edit/delete audit trail (extended 2026-07-30):** confirmed with the user before building,
since these are financial records —
```
PATCH  /payments/:id             {amount?, date?, notes?, collectedBy?, reason}   ✅ built
DELETE /payments/:id             {reason}                                        ✅ built
GET    /payments/:id/audit-log                                                   ✅ built
```
- **Soft delete, not hard** — `Payment` gained `isDeleted`/`deletedAt`/`deletedBy`/
  `deletionReason`. `listPayments`'s filter is `isDeleted: { $ne: true }`, not `isDeleted:
  false` — every payment recorded before this change has no `isDeleted` field at all, and a
  strict `false` match would have silently excluded all of them.
- **A separate `PaymentAuditLog` collection, not an embedded array** — matches this codebase's
  established pattern (e.g. `LeadCall` for `Lead`) for an unbounded, independently-queryable
  history. Stores `paymentId` (not a full snapshot — safe since deletion is soft, so the
  pointed-at document always still exists), `action`, `changedBy`, `reason` (required),
  `previousValues` (the payment's fields immediately before this action).
- `reason` is required on both PATCH and DELETE (400 if missing/blank), sent in the request
  body on both (not a query param for DELETE) for a consistent shape front-to-back.
- `customerId`/`manualClientName`/`invoiceId` are **not** editable via `PATCH` — a payment's
  reconciliation identity doesn't change through this path, since re-pointing it at a different
  customer/invoice has invoice-balance knock-on effects out of scope here.
- The audit-log endpoint deliberately ignores `isDeleted` — a deleted payment's history stays
  inspectable, which is the entire point of an audit trail.
- `PERMISSION_REGISTRY`'s `payments` entry: `["view", "create"]` → `["view", "create", "edit",
  "delete"]`.
- 23 new tests. Full backend suite: 553 tests, all passing.

**Frontend (§7.22 extended):** an Actions column (History/Edit/Delete icons) on `PaymentsTable`
drives `EditPaymentModal` (amount/date/notes/collectedBy + required "Reason for edit" —
customerId/manualClientName/invoiceId read-only, matching the backend), `DeletePaymentModal` (a
small dedicated modal, not a bare `Popconfirm`, since a delete needs a typed reason), and
`PaymentAuditLogModal` ("View History," read-only). No per-row "has history" badge on the main
table — noted as a reasonable future addition, not built now (would need either an N+1 request
per row or a backend list-shape change). 20 tests total (`PaymentsListPage.test.jsx`).

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

✅ **Built (Phase 8)**, Cloudinary removed 2026-08-04 — 24 tests (`report.test.js`), no
application bugs found. Module folder is `src/modules/report/`.

Shared report-generation service consumed by attendance, leave, payroll, transport, leads,
and customers rather than one-off generators — single `POST /reports/generate` with
`{module, filters, format}` dispatching to per-module data-fetchers behind one PDF/Excel
renderer. The generated file is streamed directly as the HTTP response
(`Content-Type`/`Content-Disposition: attachment`) — see the 2026-08-04 write-up below for why
this replaced the original Cloudinary-upload design.

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

`GET /attendance/report` and `GET /travel-logs/report` internally call this same dispatcher
instead of duplicating report generation, rather than being left as a special case.

**Cloudinary removed from the whole dispatcher (2026-08-04) — architecture change, superseding
the original Phase 8 design above and the "BREAKING CHANGE" note it originally carried.**
Through Phase 8, the dispatcher uploaded every generated report to Cloudinary and all three
callers (`POST /reports/generate`, `GET /attendance/report`, `GET /travel-logs/report`) returned
`{ downloadUrl }` instead of streaming the file. In practice this meant every report download —
regardless of module — depended on an external service being reachable and fast, for no real
benefit: the file is generated on this server and requested by an already-authenticated caller
of this same API, so it never actually needed to leave the server at all. `generateReport` now
returns the raw buffer directly; each of the three controllers sets
`Content-Type`/`Content-Disposition: attachment` and streams it with `res.send(buffer)` — the
same direct-stream shape `GET /leads/export` and `GET /payroll/:id/payslip` already used (see
below for why those two were never part of the Cloudinary-upload design to begin with).
`uploadReportFile` (the Cloudinary wrapper this dispatcher used) was deleted from
`cloudinary.service.js` as dead code rather than left unused. Every test across
`report.test.js`/`attendance.test.js`/`travelLog.test.js` was rewritten to assert against the
real streamed response body/headers (the "PK"/"%PDF-" magic-number checks still hold, now
directly on the response) and to explicitly confirm no Cloudinary function is ever called during
report generation — not just that the response no longer contains a `downloadUrl`. Frontend:
`reportApi.js#generateReport` now requests `responseType: "blob"`, and
`ReportDownloadButton.jsx`/`ExportForm.jsx` trigger the download via a new
`triggerBlobDownload` (object-URL → hidden `<a download>` click → revoke) instead of the old
`triggerFileDownload` (which opened an already-hosted Cloudinary URL) — see
`frontend/README.md`'s Reports section for the full write-up.

**Explicitly out of scope, both before and after the 2026-08-04 change:** `GET
/payroll/:id/payslip` was **not** migrated onto the dispatcher and stays exactly as it was (a
direct PDF stream, never routed through Cloudinary at any point) — it's a single-document
artifact, not a filtered-list report, so it doesn't fit the dispatcher pattern (§7.7's own
stated PDF-only, no-xlsx-option design is unrelated to and unaffected by this task). A dedicated
regression test in `payroll.test.js` proves this endpoint still streams `application/pdf`
directly. Leads' `GET /leads/export` also stays exactly as-is — a deliberately separate,
pre-existing CSV/Excel export (also always a direct stream, never Cloudinary); the `leads`
module report inside the dispatcher is additive (reuses `listLeads`, not `exportLeadsToExcel`),
not a replacement.

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
consistent bar across all six modules: every module's success-path test asserts the real
magic-number file signature ("PK" for xlsx / "%PDF-" for pdf) directly on the streamed response
body (2026-08-04 — no more mocked `uploadReportFile` buffer to inspect, per the Cloudinary
removal above), not just the ones (`attendance`/`transport`/`customers`) that already did.

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

**`tasks` removed 2026-07-29.** The `tasks` registry entry and its `manager`/`employee` template
grants shown above were removed alongside the rest of Task functionality — see §6.4/§7.3. This
snapshot is left otherwise unchanged as the historical record of the 2026-07-13 permission build.

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

### 7.12b RolePermissionTemplate drift reconciliation (2026-08-03)

**The bug this prevents, found twice in one session.** A role's `RolePermissionTemplate` is
lazily seeded from `INITIAL_TEMPLATE_DEFAULTS` **once** — read verbatim from the database forever
after. Editing that constant in code has zero effect on a template that already existed before the
edit shipped. The §7.5c and §7.5d Leave manager-parity changes each added a new permission action
to `manager`'s code default and it silently never reached the already-seeded live template —
caught only by live-verifying each feature immediately after shipping it, fixed by hand both times
via a one-off `PATCH /permissions/templates/manager`. A follow-up audit also found `employee`'s
template still carrying an orphaned `tasks` key from before Task functionality was fully removed
(2026-07-29) — never touched since its original 2026-07-17 seeding. Nothing in the test suite can
ever catch this class of bug (tests always start from a freshly-seeded database, in sync with code
by construction), so it's exactly the kind of drift that accumulates silently in a real, long-lived
deployment.

**Mechanism (`permission.service.js#reconcileRoleTemplate`/`reconcileAllRoleTemplates`).** For
each of the 4 non-admin roles (`RECONCILABLE_ROLES` — `admin`'s template is always `{}`, reconciling
it is meaningless):
- A code-default module/action key **missing outright** from the stored template gets added with
  the code's default value (the §7.5c/§7.5d bug, generalized).
- A stored module/action key **no longer valid anywhere** in `PERMISSION_REGISTRY` gets removed
  (the `employee.tasks` orphan, generalized) — a module emptied out by this is dropped entirely
  rather than left as a dangling `{}`.
- **Never touches a key that already exists**, regardless of its value — this only fills a
  structural gap or removes structural dead weight, never inspects or overwrites an existing
  value. An admin's deliberate customization (a role template edit, or a per-user override) is
  therefore safe from this running, unconditionally and automatically, forever.

**Boot-time over the whole role set, not lazy-per-fetch — a deliberate choice.** Reconciling on
every `GET /permissions/templates/:role` was considered and rejected: a read endpoint silently
becoming a write is a bad shape, and it would only ever reconcile whichever single role happened
to be requested, leaving the other three drifted indefinitely if nobody views them through the
admin UI. A boot-time pass checks all 4 at once, with one clear log line per process start instead
of an invisible side effect buried in a GET handler.

**Wired into both real entry points — `server.js` and `api/index.js` (the actual Vercel serverless
entry point; `server.js` never runs there at all, the same pre-existing gap already documented for
cron jobs, §7.4).** `reconcileRoleTemplatesOnBoot()` caches its own promise exactly the way
`database/connection.js#connectDatabase` does, for the same reason: on serverless, every request
can be a cold start, so without caching this would re-hit the database on every single request in
production. Whichever entry point actually boots a process does the real work once; every
subsequent call in that same warm process (server or serverless container) just awaits the already-
settled promise. Failures are caught and logged, never thrown — a hygiene pass must never be able
to crash the server or block a request.

**Immediate cleanup, same task:** the live `employee.tasks` orphan is gone, confirmed via a real
server boot against the shared database (same `MONGODB_URI` as production — already live there
too).

9 new tests. Full backend suite: 667/667 passing, no regressions.

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

**Result step's duplicate breakdown** (added after the initial build, alongside the backend's
duplicate-detection rule above) — the summary alert reports `importedCount` plus a
`duplicateCount`/`failedCount` split rather than one flat skipped total, and the per-row table
gets a new "Outcome" column tagging each skipped row `Duplicate` (orange) or `Invalid` (red) so
an admin can tell "this row already exists" apart from "this row is malformed" at a glance —
the `reason` text itself (already existing per-row, generic string rendering, no UI change
needed there) names which field matched and, for a duplicate against an already-saved lead,
that lead's name/id.

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
unbuilt backend piece was Phase 9's backend half. Phase 9's frontend half is now also built —
the Dashboard, §7.20/§7.21 — leaving only PWA service worker wiring for push receipt/display.

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
  notification telling you what you just did. **Extended 2026-07-31 (§7.29):** a new
  `lead_created` type, distinct from `lead_assigned` — a broadcast to every admin plus the lead's
  owner (deduplicated), fired on creation regardless of who created it or whether they assigned
  it to themselves. See §7.29 below for the full write-up and the reason it's a separate type
  rather than folded into `lead_assigned`.
- **Tickets** (`ticket.service.js#assignTicket`) — **a deliberate small addition beyond §7.8's
  literal scope**, stated here explicitly as an addition rather than a silent scope expansion.
  Made because the Notification infrastructure is fully generic and Ticket already has an
  `assign` action ready to hang a notification off of. Skipped when an admin/manager assigns a
  ticket to themselves, the same self-notify guard as Leads.

**`GET /notifications`/`PATCH /notifications/read-all` both gained an optional `type` filter
(comma-separated, 2026-07-31, §7.29)** — see §7.29 for the full write-up; this is what lets the
Leads/Leave sidebar badges (§7.26) reuse this exact module instead of their own tracking system.

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
two), rendering `CustomerHeaderSection`/`CustomerBillingCard`/`CustomerSiteDetailsCard`/
`CustomerContractsSection`/`CustomerContactsSection`/`CustomerInvoicePlaceholder`/
`CustomerActivityLog` from one `useCustomerDetail` hook. (Originally also rendered a
`CustomerCredentialsSection` here — removed 2026-07-29, see below.)

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

**Updated (2026-07-29) — Credentials Vault UI removed from Customer Detail entirely,
deliberately, not an unfinished feature.** `CustomerCredentialsSection.jsx`/
`CredentialFormModal.jsx` deleted, the `PermissionGate`-wrapped section pulled out of
`CustomerDetailContent.jsx` (no longer takes a `credentials` prop), and `useCustomerDetail.js`
no longer fetches `listCredentials` at all. **Frontend-only** — the backend `Credential`
model, its AES-256-GCM encryption, the `/customers/:id/credentials*` endpoints (§7.2), and any
already-stored encrypted data are completely untouched; `customerApi.js`'s credential
functions are left in place unused (easy to re-wire a UI onto later). No UI anywhere in the app
reaches this data today. See `frontend/README.md`'s "Credentials Vault removal" section for
the full list of what was removed vs. deliberately kept.

**Permission gating** (UI convenience only, real enforcement stays server-side, per §4.1
applied to the frontend, same as Leads) — every mutating action gated to the exact backend
`customers` `PERMISSION_REGISTRY` action its endpoint requires: Add Customer →
`customers.create`; Edit/bulk actions/contract/contact CRUD → `customers.edit`. (Credentials
Vault's own `credentials.view` gate no longer applies to anything on this page — see the
removal note above.)

**Testing:** `CustomersListPage.test.jsx`/`CustomerDetailPage.test.jsx`, all passing, no real
network calls (every `customerApi`/`userDirectoryApi` call mocked at the module boundary).
Coverage includes: default active-only fetch + search + "Show Inactive" toggle + column sort +
bulk-action-calls-the-right-endpoint-with-the-right-ids (List View); the full wizard
walk-through asserting both the created contract's payload **and** the automation-feedback
toast text (Add Customer wizard); a role with no `customers.create` grant never sees the Add
Customer button (permission gating); every detail section rendering real fetched data, and a
contract removal showing the completes-project warning before calling delete. The
Credentials-Vault-specific tests (masked-until-revealed, reveal-confirm-flow,
`credentials.view` permission-gating pair) were deleted alongside the 2026-07-29 removal above,
not left skipped.

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
- **Google Maps — superseded 2026-08-04, see §11.11.** Originally the JS SDK loaded via a
  plain `<script>` tag (`useGoogleMapsScript.js`), talking to `window.google.maps` directly
  (`GoogleMapView.jsx`) rather than through a wrapper library (e.g.
  `@react-google-maps/api`) — §7.4b's own stated scope for this view was deliberately basic
  (markers + a polyline, no clustering/info windows/autocomplete), so a wrapper's abstraction
  wouldn't have earned its dependency weight either way. Migrated wholesale to
  `react-leaflet` + OpenStreetMap tiles (§11.11) since this Google Maps integration was never
  actually functional in production — no billing/API key was ever configured. Both
  `useGoogleMapsScript.js` and `GoogleMapView.jsx` were deleted outright, and
  `VITE_GOOGLE_MAPS_API_KEY` was removed from `frontend/.env.example` — see §11.11 for the
  full migration write-up.

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

**Report downloads (all six §7.11 modules)** — a shared `frontend/src/components/
ReportDownloadButton.jsx` + `src/services/reportApi.js`, used by every module with a report
(directly, and/or via `ExportForm.jsx` on the `/reports` page) rather than duplicating the
"pick a format, call `POST /reports/generate`, trigger a real download" flow per module. As of
2026-08-04 (§7.11's Cloudinary removal) the dispatcher streams the file directly instead of
returning `{ downloadUrl }`, so `generateReport` now requests `responseType: "blob"` and
`triggerBlobDownload` replaced the old `triggerFileDownload` — object-URL → hidden
`<a download>` click → `revokeObjectURL`, the same blob-download pattern Leads' export already
used, rather than the old "open an already-hosted Cloudinary URL" approach.

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
text actually appearing before the API call fires; the report button's streamed blob response
triggering a real download call; both map views rendering real markers/a real
polyline from mocked live/history data; and (the same-phase follow-up) the heartbeat/ping
loop starting on fresh check-in, resuming identically on an already-checked-in mount,
stopping on check-out, cleaning up on unmount with no leaked intervals, and a failed
heartbeat/ping call never throwing — all via fake timers (`vi.useFakeTimers()` +
`vi.advanceTimersByTimeAsync()`, needed because the loop resolves a real `Promise` before
its first interval exists, which plain synchronous timer advancement doesn't flush).

**Manager parity, admin exemption, Reason field & Admin filters (2026-07-31, §7.5c) — reverses
the "admin-only, manager can view but not approve" restriction on Approve/Decline/Mark Unapproved
Absence.** Each action button now gates on its own `usePermission("leave", "approve"/"decline"/
"mark_unapproved_absence")` check rather than a blanket `isAdmin` flag; the Request Leave button
is hidden for admin (mirrors the backend's own exemption); the Reason field (already existed) is
now required and displayed via an expandable Admin-table row plus a line on the dashboard's
`LeavePendingRequestsWidget`; that widget also needed its own fix, since a hard-coded
`listLeave("all")` would have 403'd for a manager who now holds `approve` without `view_all` —
its scope is now picked from whichever view-tier grant is actually held. New Employee/Team/Status/
Date-range filters on the Admin table (`scope=all`, list view only). **A real finding while
verifying live, not assumed:** this dev database's "manager" `RolePermissionTemplate` document
predated the backend's §7.5c code change and had not picked it up (templates are lazily seeded
once, then read verbatim — a code default change has no effect on an already-seeded row) —
fixed with a live `PATCH /permissions/templates/manager`; confirmed zero manager accounts
currently exist, so no existing manager needed an additional permissions reset, and this same
database backs the deployed production API (no separate staging DB), so the fix is already live
there too. Full write-up: `frontend/README.md`'s dated §7.5c Leave section.

**Attendance corrections — read-only UI, Admin's redefined `/attendance`, 5 filters (2026-07-31)
— reverses the earlier admin manual-correction UI feature.** `AttendanceCorrectionModal.jsx`
deleted outright (matching the Credentials Vault removal precedent); every entry point into it
stripped too — the toolbar "Add Record" button, the per-row Edit action, the photo modal's "Edit
Record" footer button, and the calendar's "click an empty day to create" handler. Attendance is
UI-read-only for every role now, including admin — the backend's `PATCH /attendance/:id`/
`POST /attendance/manual` endpoints are untouched, just dormant (§7.4's own write-up, above).

Admin has no personal attendance at all (exempt from checking in, §7.4c), so routing every role
through `PersonalAttendanceView` always rendered an empty table for admin. `AttendancePage.jsx`
now branches: admin gets a new `AdminAttendanceView` (org-wide, reusing `GET /attendance/team`,
which already resolves to every record for a caller holding `attendance.view_all` — the same
"route confirms a grant, the service resolves the actual scope" split `TeamAttendanceView` already
relies on for a manager's narrower `view_team`); Manager/Employee/Sales Associate keep the
existing `PersonalAttendanceView` completely unchanged. Five filters on this admin view — Employee
and Status mirror `TeamAttendanceView`'s own pattern; Team is built against the real `Team` entity
(`useTeams()`, not a manager-list stand-in — a full `GET /users` roster fetch supplies each
employee's `managerId`, since the lightweight `useUserDirectory()` dropdown doesn't return it); a
Month `DatePicker` (existing pattern) plus a separate Custom Date Range `RangePicker` for an
arbitrary span, composed from the same per-month endpoint (fetches every calendar month the range
touches and merges) rather than adding a new backend range endpoint. Photo/location viewing and
the live-location map are completely unaffected — confirmed live against a real check-in record.

19 new/updated tests (`AdminAttendanceView.test.jsx`/`AttendancePage.test.jsx` new;
`AttendanceCalendar`/`AttendanceTimeline`/`AttendancePhotoModal`/`AttendanceRecordsSection` tests
updated to assert the removed actions are gone; `AttendanceCorrectionModal.test.jsx` deleted).
Full frontend suite passes, no regressions; `npm run build` succeeds. Full write-up:
`frontend/README.md`'s dated 2026-07-31 Attendance section.

**Leave restructure (tabs/columns/filters/delete) & Attendance calendar removal (2026-07-31,
§7.5e).** Two changes built together. **Leave:** the List/Calendar toggle and
`TeamLeaveCalendar.jsx` deleted outright — list/table-only, no "All" tab ever again. Tabs are
role-shaped, not purely permission-derived like §7.5c: admin is branched explicitly (no tabs, a
single always-filterable unified view — the same "structurally different view" precedent
`AdminAttendanceView` set); everyone else gets tabs from whichever of `leave.view`/`view_team`
they hold (never `view_all`), with no tab UI at all if only one is held. Columns widened with
`scroll={{ x: "max-content" }}` (same pattern as `LeadsTable`/`CustomersTable`). **The Admin Team
filter's real bug, found and fixed:** it was built from `teamDirectory.filter(role === "manager")`
— a manager-list stand-in that silently excluded any team headed by an admin (a real team in this
dataset has exactly that shape), which is why "the one existing team" never appeared. Rebuilt
against the real `Team` entity (`useTeams()`). **New Delete action** (`DELETE /leave/:id`, §7.5d)
— a `DeleteOutlined` icon in the same Actions column, gated on `usePermission("leave", "delete")`,
`Popconfirm`-confirmed, no extra per-row team check needed (same reasoning as the other three
actions). **Attendance:** `AttendanceCalendar.jsx` deleted outright too — confirmed, not assumed,
that neither the manually-adjusted-record marker nor the geofence-violation marker was ever
calendar-only (`AttendanceTimeline` already showed both independently), so nothing needed
migrating. **A real backend gap, found while building the tab restructure:** manager had
`view_team` but never `view` — no way to see their own past leave requests — fixed backend-side
(§7.5d, `DEFAULT_ROLE_TEMPLATES.manager.leave.view: true`, plus the same stale-seeded-template fix
§7.5c needed, hit again). 21 new/updated tests across `LeaveListPage.test.jsx`,
`AttendanceRecordsSection.test.jsx`; `TeamLeaveCalendar.test.jsx`/`AttendanceCalendar.test.jsx`
deleted outright. Full frontend suite passes, no regressions; `npm run build` succeeds.
Live-verified via Playwright (admin/manager/employee views, the real Team filter, Delete
role-scoping). Full write-up: `frontend/README.md`'s dated §7.5e section.

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
actions, the new admin password-reset action, a link to the Permissions module (was a
placeholder screen at the time — `PermissionSettingsPage` — since built 2026-07-30, see §7.27),
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

### 7.20 Dashboard (Leads + Customers widgets)

✅ **Built** — the last major placeholder page, and the final piece of Phase 9's frontend half
(§7.13's principle). Built under `frontend/src/modules/dashboard/`, replacing the shared
`PlaceholderPage` `/dashboard` had rendered since Frontend Phase 0.

**Declarative widget catalog, not a runtime plugin/registry** — deliberately, since nothing
else in this codebase registers behavior at runtime (`PERMISSION_REGISTRY` is a static
constants object, not a registration mechanism) and a full registry would be real complexity
for 2 modules' worth of widgets. Three pieces: (1) `widgets/*.jsx` — small, self-contained
components, each fetching its own data and handling its own loading/error/empty state via a
shared `WidgetCard` presentational shell, so one widget's fetch failing never breaks any other
widget on the page; (2) `dashboardConfig.js` — a single `role → ordered widget list` map,
`DASHBOARD_WIDGETS_BY_ROLE`; (3) `DashboardPage.jsx` — reads the current user's role from
`sessionStore`, looks up their candidate list, renders it in a responsive `Row`/`Col` grid.

**Permission-gating is real defense in depth, not just the config:** the config only decides
candidates per role. Every widget additionally calls `usePermission(module, action)` itself and
renders nothing if it fails — a per-user permission override away from the role's template
default (§7.12) must still hide the widget, not just the role-level config, mirroring
`PermissionGate`/`MainLayout`'s own nav-filtering precedent.

**Scoping reused, never reinvented:** every widget calls the exact same scoped fetch function
its module's own list page already calls (`listLeads()`, `listCustomers()`) — `lead.service.js`/
`customer.service.js` scope server-side by the caller's role, so a `sales_associate`'s widgets
automatically reflect only their own data with zero new client-side scoping logic.

**Widgets built (Leads + Customers only, per this task's scope):** `LeadsPipelineWidget`
(count per status), `LeadsFollowUpWidget` (today/overdue counts + short linked list),
`LeadsHotWidget` (currently-flagged-hot leads — `GET /leads` has no server-side `isHot` filter,
so this filters client-side over the same scoped list, the same precedent
`TeamAttendanceView`'s employee selector already set for a filter the backend doesn't expose),
`CustomersOverviewWidget` (active count + contract-type counts, derived by fetching every
visible customer's contracts in parallel — no aggregation endpoint exists, mirroring
`useCustomers.js`'s own precedent), `CustomersRecentWidget` (last few customers created,
already sorted server-side by `createdAt` descending).

**Role composition:** admin/manager/sales_associate get all 5 widgets as candidates (Sales
Associates hold full "own" CRUD on both Leads and Customers by default per §5, so their
dashboard is meaningful too, automatically own-scoped); `employee`/`customer` get an empty
candidate list for now (neither role holds a `leads`/`customers` grant by default) — **explicitly
a future incremental addition, not a gap**: an own-scoped widget for Employee (e.g. "my hours
this month") follows the exact same pattern (write the widget, add one line to
`dashboardConfig.js`) whenever that's prioritized.

**Testing:** 21 tests (`vitest` + React Testing Library) — one test file per widget (mocked-data
rendering, empty state, an inline error instead of a crash on a rejected mock) plus
`DashboardPage.test.jsx` covering the composition layer: the right widget set per mocked
session role, the "no widgets for this role" message for an empty candidate list, permission-
gating hiding every widget for a mocked user with an empty `permissions` object even though
their role's config includes all of them, and one widget's mocked API rejection not affecting
any other widget rendered on the same page.

**Known deviations:** none from this task's own stated scope. Attendance/Payroll/Leave/Tickets/
AMC/Payments widgets were explicitly out of scope here — **built next, see §7.21.**

---

### 7.21 Dashboard — Operational Widgets (Attendance/Leave/Tickets/AMC/Payments/Payroll)

✅ **Built** — 6 more glance-only widgets added to the same catalog §7.20 established, for 6
modules that each have a real, tested backend API but no frontend page of their own yet
(still routing-skeleton placeholders). These widgets are deliberately glance-only summaries,
not a substitute for each module's eventual full CRUD page — each "view all" link (where
included) points at the existing placeholder route.

**Widgets:**
- `AttendancePresentTodayWidget` — count of employees `present`/`half_day` **today**.
  Admin/manager only, not shown to employee/sales_associate (a manager/admin-level glance
  metric by design). `GET /attendance/team` takes a `month`, not a single day, so this fetches
  the current month via `getTeamAttendance` (the exact call `TeamAttendanceView` already makes)
  and filters client-side to today's date — the same precedent `LeadsHotWidget` already set for
  a filter the backend doesn't expose.
- `LeavePendingRequestsWidget` — count of leave requests awaiting approval, **admin-only**
  (§5: "manager can view but not approve," §7.5). There is no `leave.approve` action in
  `PERMISSION_REGISTRY` at all — approval is a structural `requireAdmin` route check, not a
  per-user grant — so `usePermission("leave", "approve")` gates this purely via the frontend
  `can()` helper's admin bypass (which returns `true` regardless of the module/action pair);
  since no non-admin's `permissions` object can ever contain an `approve` key that isn't a real
  registry action, this reads as "admin only" exactly as intended, without a hardcoded role
  check. Reuses `listLeave("all")` and the shared `useUserDirectory` hook (the same one Leads'
  owner filter already uses) to resolve each pending request's employee name.
- `TicketsOpenWidget` — total open tickets + open-and-unassigned, admin/manager per
  `tickets.view_all`. Reuses `listTickets("all")`, deriving both counts client-side (`GET
  /tickets` has no status/assignment aggregation of its own).
- `AmcRenewalsDueWidget` — count of AMC records renewing within 30 days. Reuses `listAmc()`
  (no filter params — `amc.service.js#listAMC` already scopes server-side by the caller,
  admin all/manager "own team"/sales_associate "own," exactly per §5's `amc.view` pattern); the
  30-day window is derived client-side. **Deliberately not a candidate for sales_associate**
  even though they hold `amc.view` "own" by default — grouped with the other 5 admin/
  manager-only operational widgets by explicit design choice, not by what the data scoping
  alone would permit.
- `PaymentsThisMonthWidget` — sum of payment amounts recorded this calendar month,
  **admin-only** (§5: `payments.view`/`create` are "–" for every other role, no ownership
  scoping exists at all for this module, §7.9). Reuses `listPayments()` (no params) and sums
  client-side over the current month.
- `PayrollStatusWidget` — whether payroll has run this month, and if so how many employees
  were processed, **admin-only** (Payroll has no `team` tier at all, §7.7 — Manager gets no
  grant whatsoever, unlike every other workforce module). Reuses
  `listPayroll({ scope: "all", month })`; both facts derive from that response's length, not a
  new backend endpoint.

**No new backend endpoints added** — every widget was checked against what
`ticket`/`amc`/`payment`/`payroll`'s existing services already expose before writing any
client-side aggregation, per this task's own explicit instruction to flag rather than silently
add one if a widget genuinely couldn't be built without it. None were needed.

**New minimal `api/*Api.js` files** for the four modules with no frontend module folder at all
yet (`ticket`, `amc`, `payment`, `payroll`) — just the one `list*` function each widget needs,
matching the established one-function-per-endpoint convention (`leadApi.js`/`customerApi.js`);
more functions belong there once each module's own real frontend task is built.
`attendance`/`leave` already had `api/` files from their existing frontend modules, reused
as-is with no changes.

**Role composition:** admin gets all 6 as candidates. Manager gets the 3 that match their
narrower default grants — `AttendancePresentTodayWidget`/`TicketsOpenWidget`/
`AmcRenewalsDueWidget` — NOT `LeavePendingRequestsWidget`/`PaymentsThisMonthWidget`/
`PayrollStatusWidget`, which are admin-only by explicit design (matches §5: only admin approves
leave, and Payments/Payroll have no manager tier at all). sales_associate/employee get none of
the 6 — all six are admin/manager-level operational metrics by nature, not owner-scoped glance
data those roles would find meaningful the way their Leads/Customers widgets are.

### 7.22 Payments Frontend Module

✅ **Built** — the first real UI for `payment`, previously backend-only (§7.9) with only the
glance-only `PaymentsThisMonthWidget` (§7.21) consuming it. `frontend/src/modules/payment/`.

**`GET /payments` gained real `from`/`to`/`page`/`limit` support for this** — verified first
that neither existed (it didn't; the endpoint took no params at all and returned every payment
ever, unpaginated). This is the first genuine server-side pagination in this backend — every
other list endpoint (Leads, Customers, Attendance, TravelLog) returns its full result set and
lets the frontend's AntD `Table` paginate client-side; Payments needed real pagination since
payment history only grows. `from`/`to` reuses the exact convention Attendance/TravelLog's
report generators already established (`$gte`/`$lt`-plus-one-day, inclusive both ends), not a
new one. Response shape changed from a bare array to `{ items, total, page, limit }`; omitting
`limit` returns everything unpaginated (`limit: null`), which is what the one pre-existing
caller, `PaymentsThisMonthWidget`, relies on after a one-line update (`response.data.data` →
`response.data.data.items`) — its own test's mock shape updated to match.

**`PaymentsListPage`** (`/payments`, admin-only per §5 — gated by `usePermission("payments",
"view")` + a 403 `Result`, the same pattern `AttendanceTeamPage` already uses, since a single
module+action pair needs no OR-of-grants here):
- A `Segmented` date-range filter — Today/Yesterday/This Month/Financial Year/All Time,
  computed client-side and sent as `from`/`to`. **Financial Year (April 1–March 31) has no
  existing utility anywhere else in this codebase** (checked before writing one) — this is the
  first place it's computed, in `paymentDateFilters.js`.
- `PaymentsTable` — Date/Customer/Amount/Notes/Recorded By, server-paginated via AntD `Table`'s
  controlled `current`/`pageSize`/`total`/`onChange` (also a first for this codebase — every
  other table uses a static `pagination={{ pageSize: 20 }}`, since every other list is fetched
  in full). `customerId`/`recordedBy` are resolved to display names via the same Map-lookup
  convention `CustomersTable`'s Owner column already uses (`useCustomerDirectory` — deliberately
  NOT the Customers module's own `useCustomers` hook, which also fetches every customer's
  contracts for a type-badge column this page has no use for; mirrors `useUserDirectory`'s
  minimal shape instead), not a backend join.
- **"Record Payment" modal** (`RecordPaymentModal`, separately gated behind `payments.create`
  via `PermissionGate`) — Customer/Amount/Date/Notes, `POST /payments` on save, closes and
  refetches the table on success. The Customer field is a genuinely **debounced search-as-you-
  type** `Select` against the existing `GET /customers?search=` endpoint — no new backend
  endpoint. This is deliberately different from every other searchable picker in this app
  (`LeadFormModal`'s Owner, `ConvertToCustomerModal`'s Project Manager), which filter a fully-
  fetched-once list client-side (`showSearch`/`optionFilterProp="label"`) — that pattern doesn't
  fit here since the whole point is not fetching every Customer up front.
- **Scope note, explicit and deliberate:** system customers only (`customerId`) for this first
  version. The backend also supports `manualClientName` (non-system/cash entries) and
  invoice-linking (partial reconciliation against an outstanding Invoice, §11.3) — both flagged
  as easy future additions, neither built now, per this task's own instruction not to add either
  speculatively.

10 tests (`PaymentsListPage.test.jsx`), all passing, no real network calls — covering table
rendering + pagination, each filter's computed date range being sent correctly, the debounced
customer search, save-payload correctness, post-save refetch, and permission gating for both
`payments.view` and `payments.create` independently.

**Testing:** 20 new tests (one file per widget: mocked-data rendering, an inline error instead
of a crash on a rejected mock, permission-gating hiding the widget for a mocked user lacking
the specific grant even when their role's config would normally include it), plus
`DashboardPage.test.jsx` extended with a manager-scoped composition test (their narrower 3-of-6
set) and an additional cross-widget isolation test (a failing Tickets widget doesn't affect the
AMC widget rendered on the same page). Full frontend suite: 136 tests (2 pre-existing flaky
failures — `LeadDetailPage`/`CustomersListPage` — unchanged from every prior run).

**Known deviations:** none from this task's own stated scope.

---

**App shell UI/UX pass (2026-07-21)** — a visual/UX polish pass over `MainLayout.jsx` and the
Dashboard widgets, not new architectural scope: `<Sider>` restructured into three fixed
regions (pinned logo/scrollable nav/pinned footer — see `frontend/README.md`'s "App shell
UI/UX pass" section for the AntD `Sider`-wrapper flex gotcha this surfaced and how it was
fixed and actually verified via a real short-viewport scroll test, not just visual
inspection), sidebar recolored to brand-navy with a brand-green active/hover nav state,
`User Management`/`Permission Settings` regrouped under a collapsible `Settings` submenu,
the top bar shortened with a live clock, self-service profile editing added (`EditProfileModal`
reusing the existing `PATCH /users/:id`, no new backend work), and all 11 Dashboard widget
cards visually tightened (`WidgetCard` size/typography/empty-state). `BrandLogo` gained a
`layout` prop (`stacked`/`horizontal`) for the sidebar's new wide-format logo — see
`frontend/README.md` for the generated-white-asset detail. No new modules, permissions, or
backend endpoints.

---

### 7.23 Reports & Analytics

✅ **Built** — the app's first real analytics feature, distinct from the pre-existing raw
export dispatcher (`POST /reports/generate`, §7.11, unchanged), which now has a proper UI home
on this same `/reports` page instead of a `PlaceholderPage`.

**Backend — 11 new `GET /reports/analytics/*` endpoints**, in a new sibling
`backend/src/modules/report/analytics.service.js`/`analytics.controller.js` (kept separate from
the existing 271-line `report.service.js` — that file is a cross-module file-generation
dispatcher; growing it further for a conceptually different feature, chart aggregation, seemed
like the wrong tradeoff, but the routes still register inside the existing `report.routes.js`,
so `/reports/*` stays one routing entry point). **These are the first MongoDB aggregation
pipelines (`$group`/`$match`) anywhere in this backend** — confirmed via a full grep before
writing any before this task; every existing "report" was a `.find()`-scoped list rendered to
PDF/Excel in JS. Endpoints, response shapes, and their scoping (all reused directly from each
target module's own existing scoping logic, not re-derived):

| Endpoint | Response | Scoping (reused from) |
|---|---|---|
| `GET /leads-pipeline` | `[{status, count}]` | `lead.service.js#resolveOwnershipFilter` (now exported) |
| `GET /leads-conversion?from=&to=` | `[{month, totalLeads, wonLeads, conversionRate}]` | same |
| `GET /leads-by-source` | `[{source, count}]` | same |
| `GET /leads-by-client-type` | `[{clientType, count}]` | same |
| `GET /customers-growth?from=&to=` | `[{month, newCustomers}]` | `customer.service.js#resolveOwnershipFilter` (now exported) |
| `GET /customers-status-split` | `{active, inactive}` | same |
| `GET /customers-contract-value` | `[{type, totalValue, count}]` | `customer.service.js#getVisibleCustomerIds` (Contract has no `ownerId`, same reasoning AMC's own scoping already established) |
| `GET /payments-trend?from=&to=` | `[{month, totalAmount}]` | none — admin-only, matches Payments' own no-team/no-own-tier grant (§5) |
| `GET /amc-renewals-upcoming?days=30` | `{count, renewals: [{customerId, customerName, renewalDate, amount}]}` | `customer.service.js#getVisibleCustomerIds`, matching `amc.service.js#resolveAMCFilter`'s own pattern |
| `GET /attendance-trend?from=&to=` | `[{month, attendanceRate}]` | `attendance.service.js#resolveDirectReportIds` (now exported) + `can(user, "attendance", "view_all")`, mirroring `getTeamAttendance`'s own branch exactly |
| `GET /payroll-cost-trend?from=&to=` | `[{month, totalCost}]` | none — `requireAdmin` at the route, mirroring `POST /payroll/run`'s existing gate (Payroll has no team tier at all, §5) |

`from`/`to` are `YYYY-MM-DD` throughout, the same `$gte`/`$lt`-plus-one-day convention
Attendance/TravelLog/Payments already established — not a new date-range shape. Payroll stores
`month`/`year` as separate Numbers (not a Date), so its `from`/`to` are converted to a single
comparable "month index" (`year*12 + zero-based month`) for the `$match`'s `$expr`, rather than
inventing a second date-range convention. Three previously-private scoping helpers
(`lead.service.js#resolveOwnershipFilter`, `customer.service.js#resolveOwnershipFilter`,
`attendance.service.js#resolveDirectReportIds`) were exported (additive only, no behavior
change) specifically so `analytics.service.js` could reuse them rather than re-deriving the same
admin/manager/owner rules a second time — this codebase's strongest existing convention
(`report.service.js`'s own dispatcher already calls straight into each module's `list*`
function) applied to a case where the reusable logic wasn't already exported.

**Testing:** 40 new tests (`analytics.test.js`) — correct aggregation against seeded fixtures per
endpoint, scoping enforcement (admin vs. manager vs. a narrower role, reusing each module's own
established multi-agent fixture pattern — an unaffiliated `sales3` deliberately left off the
manager's team), date-range filtering, and empty-data returning a sensible empty result
(`[]`, `{active:0, inactive:0}`, or `{count:0, renewals:[]}`) rather than an error. One fixture
bug found and fixed during this task, not a bug in the endpoints themselves: `$dateToString`
formats in UTC by default, so test dates constructed as local midnight (`new Date(2026, 6, 1)`)
on a host timezone ahead of UTC silently shifted into the previous UTC day/month — fixed by
constructing month-boundary-sensitive test fixtures via `Date.UTC(...)` explicitly; production
is unaffected (the server clock is UTC). Full backend suite: 470 tests, no regressions.

**Frontend — `frontend/src/modules/reports/`**, plus a new `@ant-design/charts` dependency
(chosen specifically because it renders through the app's existing AntD `ConfigProvider`/brand
theme automatically — verified: the navy `colorPrimary` seed applies to its charts with no
extra wiring — unlike a theme-agnostic charting library). This is the app's first chart/data-
visualization library and first chart of any kind.

- **`DateRangeFilter`/`useAnalyticsDateRange`** — one shared date-range control (This
  Month/Last 3 Months/This Financial Year/Custom Range) driving every trend-based chart (Leads
  Conversion, Customer Growth, Payments Trend, Attendance Trend, Payroll Cost Trend). "This
  Financial Year" reuses the same April 1–March 31 computation `payment/utils/
  paymentDateFilters.js` already established (§7.22) — a second small copy in its own file
  rather than generalizing that one, since the two preset lists genuinely differ and there was
  no third caller yet to justify a shared abstraction.
- **Chart-per-section mapping** (`@ant-design/charts`): Leads — pipeline (`Column`, not
  `Funnel` — Lead status isn't a strictly narrowing pipeline, a lead can sit in any status
  independent of how many came before it), conversion trend (`Line`), by source (`Pie`), by
  client type (`Column`, so as not to sit two identical-looking Pies side by side). Customers —
  growth (`Area`), status split (`Pie` with `innerRadius` as a donut), contract value by type
  (`Column`). Financial — payments trend (`Line`), upcoming AMC renewals (`AmcRenewalsUpcomingList`
  — a plain `List`, not a chart, with a day-window `Select` defaulting to 30). Workforce —
  attendance rate trend (`Line`), payroll cost trend (`Column`).
- **Permission-gating** via the existing `PermissionGate` component (evaluated against
  `dashboardConfig.js`'s role→widget-catalog pattern first and rejected — that pattern fits many
  independent pluggable dashboard widgets, not per-section gating within one page) — Leads/
  Customers sections are each wrapped in one `PermissionGate` (`leads.view`/`customers.view`,
  since all of that section's charts share the same grant); Financial/Workforce instead check
  each card's own permission independently (`payments.view` vs. `amc.view`; `attendance.view_team`
  `||` `view_all` vs. `payroll.run`) and only render the section heading at all if at least one
  card would be visible — those two group two genuinely different permissions that don't always
  travel together for a given role.
- **`ExportForm`** — the proper UI home for the pre-existing `POST /reports/generate` dispatcher:
  module + filters + format(pdf/xlsx) picker, reusing the existing `ReportDownloadButton`
  component for the actual download rather than re-implementing that flow. The module list is
  filtered to whichever modules the current user actually holds view access to (mirroring
  `report.service.js`'s own per-module `canAccess` checks exactly), so it never offers an option
  guaranteed to 403 on click.
- **Isolation:** every chart/list section fetches independently via its own `useAnalyticsQuery`
  call (matching `usePayments`'s shape) and renders through a shared `ChartSectionCard` (the
  same loading/error/empty contract as the Dashboard's `WidgetCard`) — one section's fetch
  failing never affects any other section on the page.

**Testing:** jsdom has no `HTMLCanvasElement.getContext`/`ResizeObserver` support (verified —
`@ant-design/charts` throws rendering for real in a test environment), so `@ant-design/charts`
is mocked to a plain stub in `analyticsCharts.test.jsx` (16 tests covering all 11 real chart/list
components — data fetch, transform, empty/loading/error states); a separate
`ReportsPageContent.test.jsx` (5 tests) mocks each section component itself instead, to test
permission-gating and the shared date-range filter propagating identically to every trend
section, isolated from chart-rendering concerns; `ExportForm.test.jsx` (6 tests) covers the
module-list permission filtering, dispatcher call correctness, and (updated 2026-08-04) the
blob response → `triggerBlobDownload` handoff. Full frontend suite: 232 tests (the same 2 pre-existing flaky failures —
`LeadDetailPage`/`CustomersListPage`, confirmed unrelated and passing in isolation — unchanged
from every prior run); `npm run build` succeeds.

**Known deviations:** none from this task's own stated scope. Live-browser verification (CDP
screenshots, the technique used for prior frontend tasks this session) was not available in this
environment — verification here rests on the test suites and a successful production build.

---

### 7.24 Team Management (2026-07-30)

✅ **Built** — a new `team` module giving admins a named org-structure layer (e.g. "North Sales
Team") over the roster, plus this task closed out a verification gap on the pre-existing Create
User flow (see below).

**Part 0 — Create User verification:** confirmed already fully working end-to-end (backend
`POST /auth/register` + the User Management "New User" form, §7.0b/§7.19) — no rebuild needed.
Role dropdown correctly lists Manager/Sales Associate/Employee; there is no "Executive"
relabeling anywhere in the frontend, matching §11.1's existing resolution that "Employee" and
"Executive" are one role for v1.

**Backend — `backend/src/modules/team/`:**
- **`Team` model** — `name` (required), `type` (originally free text, converted to an
  admin-managed list validated against `TeamType` on 2026-07-31 — see §7.30), `headManagerId`
  (ObjectId → User,
  required, must resolve to a `manager` or `admin` — enforced via the now-exported
  `user.service.js#ensureValidManagerId`, reused rather than duplicated), `isActive` (default
  `true`). **Deliberately no stored `memberIds` array** — see §11.9's reversal note for why.
- **`team.service.js`** — CRUD; `getTeamMembers(teamId)` is always a live
  `User.find({managerId: team.headManagerId})`, never a cached/stored list;
  `addMemberToTeam(teamId, userId)` calls the existing `user.service.js#assignManager(userId,
  team.headManagerId)` rather than writing `managerId` directly a second way;
  `removeMemberFromTeam(teamId, userId)` calls the same `assignManager(userId, null)`. A user
  moving to a second team is therefore not a special case to guard against — setting `managerId`
  to the new team's head is definitionally also leaving whatever team/manager they had before,
  since `managerId` is one field.
- **Endpoints** (all `authorize("teams", "manage")`, admin-only — matching the Permissions
  module's own single-tier access pattern, not `requireAdmin`): `GET/POST /teams`, `GET/PATCH/
  DELETE /teams/:id`, `GET/POST /teams/:id/members`, `DELETE /teams/:id/members/:userId`.
- **`PERMISSION_REGISTRY`** gained `teams: ["manage"]` — one combined tier, no separate view/
  create/edit/delete, mirroring `permissions: ["manage"]`'s own shape exactly. No
  `INITIAL_TEMPLATE_DEFAULTS` entry for manager/sales_associate/employee, matching how
  `permissions.manage` itself is never granted to non-admins by default.
- **Testing:** 17 new tests (`team.test.js`) — access control (403 non-admin), CRUD (create,
  reject-invalid-head, list-with-derived-memberCount, update, delete-without-touching-members),
  membership (add sets `managerId`, member list correctly reflects it, moving to a second team
  clears the first automatically, remove clears `managerId`). Confirmed the pre-existing
  Leads/Customers/Attendance "own team" scoping tests are unaffected — proving `Team` is a clean
  addition on top of the existing scoping, not a parallel mechanism.

**Frontend — `frontend/src/modules/team/`, new `/settings/teams` tab** (same tab pattern as
User Management/Permissions on `SettingsPage`, admin-only via `PermissionGate`/`can(user,
"teams", "manage")`):
- **List** — name, type, head's name (resolved from `useUserDirectory`), derived member count,
  status.
- **`TeamFormModal`** — create/edit; head picker filtered to `role === "manager" || "admin"`
  from the same lightweight `useUserDirectory` lookup every other "assign to" picker in this app
  already uses.
- **`TeamMembersModal`** — member list always re-fetched fresh (never cached client-side, for
  the same reason the backend never stores it); add-picker filtered to `employee`/
  `sales_associate`. Does **not** cross-reference every other team's membership to grey out a
  user already on a different team — `GET /users/dropdown` doesn't carry `managerId` and
  fetching every team's membership just to grey out one dropdown option wasn't judged worth the
  extra requests for an admin-only, low-frequency action. Instead a `Popconfirm` names the real
  consequence ("this moves them here, not adds them to both") before every add.
- All new icon-only action buttons (Manage members/Edit team/Delete team/Remove member) carry an
  explicit `title`/`aria-label`, matching this app's established icon-button pattern — a
  `Tooltip` alone only contributes `aria-describedby`, not an accessible name.
- **Verification:** every flow (create, edit/rename, add member, remove member, delete team)
  driven live end-to-end via a real login + browser session, not just unit tests — including
  creating a throwaway test employee first, since this dev database had no
  employee/sales_associate users to add to a team until then.
- **Testing:** `TeamManagementPage.test.jsx` (5 tests) — list rendering, create-modal open,
  edit-modal pre-fill, delete, and the add-member flow through `TeamMembersModal`.

**Known deviations:** none from this task's own stated scope.

---

### 7.25 Website Lead-Intake Webhook (2026-07-30)

✅ **Built** — `POST /leads/website-intake`, a new public, unauthenticated endpoint so a
WordPress "Get a Quote" form (via Forminator's webhook add-on) can post submissions directly
into Leads, instead of a human re-keying every website inquiry by hand.

**Design decisions (confirmed with the user before building, since this is a public,
security-sensitive endpoint):**
- **Payload shape:** the raw Forminator payload, mapped server-side — not a simplified flat
  shape requiring WordPress-side reconfiguration. Forminator auto-generates field ids
  (`name-1`, `email-1`, `textarea-1`, ...) per form/site, so there's no fixed, knowable id set
  to hardcode against.
- **Auth:** a shared secret via a custom `X-Webhook-Token` header (not a query-string token) —
  simplest for a server-to-server webhook call.
- **Abuse protection:** token check only for v1, no added rate-limiting — matches this
  codebase's existing convention of no rate-limiting middleware anywhere else; revisit only if
  actually abused.

**Implementation** (`backend/src/modules/lead/`): see `backend/README.md`'s Leads section for
the full endpoint writeup (auth-fail-closed behavior, field-mapping keyword-matching strategy,
the three payload shapes handled, and the `ownerId`/`clientType`/`source` rules for a submission
with no `requestingUser`). New `WEBSITE_LEAD_INTAKE_TOKEN` env var — optional at boot (like the
other optional integrations, e.g. geofencing radius), since this is an add-on marketing-site
integration, not core app functionality; the route itself fails closed (503) if it's unset
rather than the app refusing to start.

**`clientType` is confirmed left genuinely unset for a submission with no recognizable
client-type signal** (corrected 2026-07-31 — the original build here actually defaulted it to
`"residential"`, which directly contradicted this decision; a test had even locked in that wrong
behavior as "correct," which is why it went uncaught until reported). Fixed by also removing
`Lead.clientType`'s `required: true` at the schema level — that constraint was the actual reason
the incorrect default existed, since `Lead.create` would otherwise throw for a website-intake
submission with no client-type signal at all. `POST /leads` (manual creation) still requires it,
enforced instead at the HTTP-validation layer, not the schema.

**Testing:** grew from 7 to 9 tests (`lead.test.js`) with the 2026-07-31 correction above — the
original 7 (missing/wrong token, successful creation from both the flat-object and Forminator
`fields`-array payload shapes, admin assignment + the existing `lead_assigned` notification
firing, and two 400 cases: no name/contact at all found, a name with neither phone nor email)
plus 2 new: an explicit valid `clientType` still saves correctly, and an unrecognized value also
leaves it unset rather than defaulting. The existing "creates a lead from a flat payload" test's
own `clientType` assertion was corrected from asserting `"residential"` to asserting the field is
genuinely absent, checked on the real persisted document.

**Known deviations:** none from this task's own stated scope — the exact field-id keyword list
is a best-effort mapping given no access to the real WordPress form's configuration; if a real
submission's fields aren't recognized, the full raw payload is still preserved (never silently
dropped) in the created lead's `notes`, so nothing is lost even in that case.

---

### 7.26 Sidebar Count Badges (2026-07-30)

✅ **Built** — small `Badge` counts next to the Leads and Leave sidebar nav items
(`MainLayout.jsx`), the first badges on any sidebar item, establishing the pattern for a future
Tickets/AMC badge. New lightweight `GET /leads/count` and `GET /leave/pending-count` endpoints
(`countDocuments`, not a full list fetch) — Leads reuses the exact same ownership scoping as
`GET /leads` itself via a shared `buildLeadFilter` helper; Leave's badge is admin-only via a
hard `requireAdmin` role gate, not a `leave.view_all` permission grant, and is never even
fetched (not just hidden) for a non-admin. Both poll every 60 seconds via a shared
`useSidebarBadgeCounts` hook, matching the notification bell's own polling cadence. See
`frontend/README.md`'s "Sidebar count badges" section for the full write-up (this task's
STANDING RULE only called for a frontend/README.md update, not this file — added here now as
part of §7.27's own doc pass for consistent numbering). 6 new backend tests + 10 new frontend
tests (`useSidebarBadgeCounts.test.js` + `MainLayout.test.jsx`).

**Superseded 2026-07-31 (§7.29) — reworked to be notification-driven, not replaced with a second
system alongside it.** The `GET /leads/count`/`GET /leave/pending-count` endpoints described
above are still live and tested, but the sidebar badges no longer call them — see §7.29 for the
reworked design (unread-notification-count-by-type, reusing the existing Notification module
entirely) and the reasoning for retiring the admin-only gate on the Leave badge specifically.

### 7.27 Permissions Management Frontend (2026-07-30)

✅ **Built** — the first real frontend for the `permission` module (§7.12), replacing the
long-standing `PlaceholderPage` at `/settings/permissions`. See `frontend/README.md`'s
"Permissions Management module" section for the full write-up: a shared `PermissionMatrix`
component (rows = `PERMISSION_REGISTRY` modules, columns = the union of every valid action,
blank — not disabled — cells for an invalid module+action pair), a Role Defaults tab
(`GET/PATCH /permissions/templates/:role`, with a warning that edits are non-retroactive and a
"last updated by/on" line), and a User Overrides tab (`GET/PATCH /users/:id/permissions` plus a
confirm-gated "Reset to Role Default" via `POST /users/:id/permissions/reset`). No new backend
endpoints — every endpoint this consumes already existed and was already tested (§7.12's 20
backend tests, unchanged). 5 new frontend tests (`PermissionManagementPage.test.jsx`); non-admin
access is already covered by the existing `SettingsPage.test.jsx` tab-visibility tests, since
`permissions.manage` already gates the tab itself — no separate internal gate needed.

**Known deviations:** none from this task's own stated scope.

---

### 7.28 User/Team Management Filters and Delete-Guards (2026-07-30)

✅ **Built** — extends both the User Management (§7.0b/§7.19) and Team Management (§7.24)
modules; neither was rebuilt.

**Backend:**
- **Deactivation team-head guard** (`user.service.js#setUserActiveStatus`) — deactivating a
  user who currently leads one or more active Teams (`Team.headManagerId === targetId &&
  isActive: true`) is rejected (400), naming the team(s) in the message. Reactivate has no
  equivalent guard. Not silently deactivating a team's head matters because every "own team"
  scope (§11.9) is derived from that same `headManagerId` — a login-disabled head would leave
  the whole team's scoping silently pointing at a dead account.
- **`GET /users` gained `teamId`** — resolves to that Team's `headManagerId` and filters by
  `managerId` matching it, the same derived-membership mechanism every other "own team" query
  already uses, combined (`$and`) with the pre-existing `role`/`isActive`/`managerId` filters,
  not a replacement of them. A nonexistent `teamId` matches nothing rather than erroring.
- **`GET /teams` gained `type`/`isActive`** — plain equality filters, combined with the existing
  full-listing query.
- **No new `GET /teams/:id/delete-preview` endpoint** — `GET /teams/:id` already returns the
  full derived `members` array; its `.length` is the member count the frontend needs to show
  before a delete is confirmed, so a separate endpoint would only have duplicated that.
- 11 new backend tests (8 in `user.test.js`, 3 in `team.test.js`). Full backend suite: 570
  tests, all passing.

**Frontend:**
- `UserManagementPage.jsx`: Role/Department/Active `Select` filters wired to `useUsers(filters)`
  (already supported arbitrary query params — no hook change needed); `handleDeactivate` now
  catches and surfaces the backend's team-head rejection message verbatim via `message.error`,
  the same pattern already established for Add Customer's own unhandled-rejection fix.
- `TeamManagementPage.jsx`: Type/Active `Select` filters; `useTeams(filters)` gained an optional
  param (every existing unfiltered caller — the Department pickers elsewhere — keeps working by
  simply omitting it); the Type filter's own option list is deliberately derived from a second,
  always-unfiltered `useTeams()` call so selecting a type doesn't make the other types disappear
  from that same dropdown's options; the delete `Popconfirm`'s description now shows the live
  `memberCount` already present on every `GET /teams` row.
- 9 new frontend tests (4 in `UserManagementPage.test.jsx`, 5 in `TeamManagementPage.test.jsx`).
  Verified live: a real team headed by an existing manager, confirmed the deactivate attempt was
  rejected (400 network response, row stayed Active) and the delete confirmation showed the
  correct member count.

**Known deviations:** none from this task's own stated scope.

---

### 7.29 Notification-Driven Leads/Leave Sidebar Badges (2026-07-31)

✅ **Built** — reworks the §7.26 sidebar badges to reuse the existing Notification module (§7.16)
entirely, rather than the parallel `GET /leads/count`/`GET /leave/pending-count` tracking system
that task built. Neither the Notification module nor `MainLayout.jsx` was rebuilt from scratch.

**Backend:**
- **New `lead_created` notification type** (`lead.service.js`), distinct from the existing
  `lead_assigned`. `notifyLeadCreation(lead)` broadcasts to every admin plus the lead's owner
  (deduplicated via a `Set`), fired on every lead creation regardless of who created it — a
  deliberate difference from `notifyLeadAssignment`'s self-notify skip, since "a new lead entered
  the pipeline" is useful to every admin including the one who happened to create it, unlike a
  personal "you were assigned this" ping. Wired into both `createLead` (manual add) and
  `createLeadFromWebsiteIntake` (§7.25) — the two don't share an implementation, so both call it
  independently; the website-intake path's existing `lead_assigned` notification to its
  owner-admin is untouched, `lead_created` is purely additive on top of it.
- **`GET /notifications`/`PATCH /notifications/read-all` both gained an optional, comma-separated
  `type` query param** — `notification.service.js#listNotifications`/`markAllRead` now accept a
  `types` array, `notification.controller.js` parses `?type=a,b,c` into that array. Deliberately
  reuses these two existing endpoints rather than adding a dedicated count endpoint or a
  dedicated type-scoped mark-read endpoint — the sidebar badge is just this same list, filtered,
  with the caller taking `.length`.
- **Test coverage:** 4 new tests in `lead.test.js` (every admin notified on creation, the owner
  also notified when not already an admin, no double-notify when an admin is also the owner,
  still fires for an admin creating their own lead) + 1 for the website-intake path (broadcasts
  to all admins without disturbing the existing `lead_assigned` notification). 6 new tests in
  `notification.test.js` (single-type filter, comma-separated multi-type filter, combined with
  `unreadOnly`, no-type-param behaves as before, type-scoped mark-read leaves other types/other
  users untouched).

**Frontend:**
- **`useSidebarBadgeCounts`** (`src/hooks/`) rewritten to wrap `listNotificationsByType`/
  `markNotificationsReadByType` (`modules/notification/api/notificationApi.js`) instead of the
  old `getLeadCount`/`getPendingLeaveCount` calls. Exports `LEADS_NOTIFICATION_TYPES` (`
  lead_created`, `lead_assigned`) and `LEAVE_NOTIFICATION_TYPES` (`leave_requested`,
  `leave_approved`, `leave_declined`) so the hook's own mark-read calls and `MainLayout.jsx`'s nav
  items always agree on exactly which types each badge means.
- **Leave badge is no longer admin-only** — a deliberate reversal of §7.26's explicit admin-only
  gate, made because the badge is now naturally self-scoped by the Notification module itself:
  `leave_requested` only ever notifies admins, `leave_approved`/`leave_declined` only ever notify
  the employee whose request was decided, so the same badge is already correct for both roles
  without a role gate.
- **Mark-as-read on nav click** — clicking the Leads or Leave nav item (`onNavigate` on the
  `<Link>` in `MainLayout.jsx`) fires the type-scoped mark-read and zeroes that badge's count
  locally, immediately rather than waiting for the next 60-second poll.
- **5px horizontal badge margin** (`mx-1.25`) applied consistently to all three badge instances
  (bell icon, Leads, Leave) for even spacing, previously inconsistent.
- **Test coverage:** `useSidebarBadgeCounts.test.js` rewritten (8 tests) and `MainLayout.test.jsx`'s
  badge describe block rewritten (7 tests) — see `frontend/README.md`'s "Sidebar count badges"
  section for the full list.

**Explicitly deferred, not built:** an Attendance badge. This task's pattern would extend to one
cleanly, but nothing in Attendance currently creates a notification at all — that's new backend
scope this task didn't ask for.

**Known deviations:** none from this task's own stated scope, beyond the two deliberate design
calls stated above (which types count toward each badge; removing the Leave badge's admin-only
gate) — both called out explicitly rather than silently decided.

---

### 7.30 Team Type — Admin-Managed List (2026-07-31)

✅ **Built** — converts `Team.type` from free text (§7.24) to an admin-managed list, a direct
structural mirror of `LeadSource` (§6.2/§7.1) with real CRUD and validation LeadSource itself
doesn't actually have.

**Before building, read LeadSource's actual implementation rather than assuming it matched the
task's own framing — it didn't, and this was surfaced to the user before proceeding rather than
guessed:** LeadSource has no admin CRUD endpoints at all (`GET /lead-sources` only, lazily
seeded), and `Lead.source` is never validated against it — a plain, unvalidated String, just a
shared convention for dropdown labels. The task's own concrete requirements (admin-managed CRUD
endpoints, `Team.type` validated against the active list) directly conflicted with "mirror
LeadSource exactly, don't diverge." **Asked the user which to build; confirmed: full admin CRUD
+ real validation**, deliberately diverging from LeadSource's literal shape where the two
conflicted, while still mirroring its storage/seeding pattern where they didn't.

**Backend:**
- **New `TeamType` model** (`teamType.model.js`) — same shape as `LeadSource` (`name` unique,
  `isActive`).
- **`team.service.js#listTeamTypes()`** — lazy-seeds `["Sales", "Installation", "Technical"]` on
  first call, the same on-demand pattern as `listLeadSources`. Self-seeding: called internally by
  `ensureValidTeamType` too, not just the read endpoint, so the defaults exist regardless of
  which entry point runs first (a team creation is just as valid a "first caller" as `GET
  /team-types` itself).
- **`ensureValidTeamType(type)`** — the one place `Team.type` is validated against the active
  `TeamType` list, called from both `createTeam` and `updateTeam`. A no-op for an empty/undefined
  type, keeping the field optional exactly as before.
- **New endpoints:** `GET /team-types` (any authenticated user, matching LeadSource's own
  low-sensitivity read access), `POST`/`PATCH /team-types` (`teams.manage`, admin-gated like the
  rest of the Team module) — neither exists for LeadSource, the deliberate divergence above.
- **`Team.type` stays a plain String on the schema** — storing `TeamType.name` directly, the same
  storage shape `Lead.source` uses for `LeadSource.name`, not an ObjectId. An existing Team whose
  type is later deactivated keeps displaying its type string normally; only a **new** create/
  update is blocked from selecting it.
- **15 new backend tests** (`team.test.js`), 2 existing tests rewritten (not just patched) since
  their premise directly changed: `"accepts free-text type, not a fixed enum"` → `"rejects a type
  that doesn't match an existing, active team type"`; the update test's made-up type strings
  (`"Old Type"`/`"New Type"`) replaced with real seeded names, since arbitrary strings are now
  correctly rejected.

**Frontend:**
- **`TeamFormModal.jsx`'s `type` field** — free-text `Input` → `Select` populated from the new
  `useTeamTypes` hook (a structural mirror of `useLeadSources`), filtered to `isActive`. An
  existing team's own (possibly since-deactivated) type value stays selectable/visible in the
  edit form, labeled `"(inactive)"`, rather than silently blanking out the moment the form opens.
- **No Team Types admin management screen built** — per the task's own explicit instruction not
  to build more UI for Team Types than the equivalent LeadSource feature has, and LeadSource has
  none. The backend CRUD exists and is tested; nothing in the frontend calls
  `POST`/`PATCH /team-types` yet.
- **4 new tests** in `TeamManagementPage.test.jsx` (17 total in that file).

**Known deviations:** the two deliberate divergences from LeadSource stated above (admin CRUD,
real validation) — both confirmed with the user before building, not assumed.

### 7.32 Single User/Employee Detail Page (2026-07-31)

✅ **Built** — the first dedicated detail view for Users, consolidating data currently scattered
across Attendance, Leave, Teams, Leads, Payroll, and Permissions onto one page, reusing every
underlying endpoint/hook rather than duplicating logic.

**Route:** `/settings/users/:id` (`ROUTE_PATHS.USER_DETAIL`), a real standalone route (not a
`SettingsPage` tab). Clicking a user row in User Management's table navigates here (`onRow`/
`onCell` click-through pattern copied from `LeadsTable.jsx`, stopping propagation on the Actions
column). **Both paths kept, not one replacing the other:** the list's own quick Edit modal still
works exactly as before; the detail page is an additional, fuller view, and its own Edit button
opens the identical `UserFormModal`.

**Shared lifecycle extraction (eliminates duplication, not just button markup):**
- **`useUserLifecycleActions({ refetch, onDeleted })`** (new hook, no JSX) — encapsulates every
  create/edit/reset-password/guarded-deactivate-with-reassignment/reactivate/guarded-hard-delete
  handler and its modal-open state. `onDeleted` (optional) is called instead of `refetch()` after
  a delete — the detail page uses it to navigate back to the list, since there's nothing left on
  this page to refetch.
- **`<UserLifecycleModals actions={actions} userDirectory={userDirectory} />`** (new component) —
  renders the four modals (`UserFormModal`, `AdminResetPasswordModal`, `DeleteUserModal`,
  `DeactivationReassignModal`) wired to that hook's state.
- **`UserManagementPage.jsx` itself was refactored to use both**, replacing what had been its own
  copy of this logic — the list page and the detail page now share one implementation instead of
  carrying two copies that could drift.
- **`UserActionButtons.jsx`** (new, extracted from the list's previously-inline Actions column) —
  the exact same Edit/Reset Password/Deactivate/Reactivate/Delete icon+Tooltip buttons, same
  `aria-label`s, used by both the list's Actions column and the detail page's header.

**Sections built, each in its own `WidgetCard`-based card (§7.x Dashboard-widget isolation
pattern reused directly, cross-module import — not a second shell built) so one section's fetch
failing never blanks the rest of the page:**

| Card | Reuses |
|---|---|
| Header | `UserActionButtons`, role/status labels already used by the list table |
| Basic Info | `getUser` (new thin wrapper over an endpoint that already existed); baseSalary intentionally omitted — see below |
| Attendance Summary | `getMyAttendance`/`getTeamAttendance` + `AttendanceSummaryStats`'s own summary calc, scoped client-side to one employee (self-view uses `getMyAttendance` directly; viewing someone else fetches team-wide and filters, since `GET /attendance/team` has no `employeeId` filter) |
| Leave | `useLeaveBalance(user._id)` → `GET /leave/balance?employeeId=` |
| Team | `useTeams()` (fetched once at the page level, passed down — an infrequently-changing reference list, same treatment `UserManagementPage` already gives it), derives led-team vs. member-of-team client-side |
| Owned Leads (sales_associate/manager only) | `listLeads({ owner: user._id })`, filtered client-side to exclude `["won", "lost"]` — `GET /leads/count` only supports one exact status match, not a `$nin` |
| Permissions | `getPermissionRegistry` + `getUserPermissions` + `getRoleTemplate` in parallel, diffed client-side to a compact override summary (not the full matrix); "Manage overrides" links to the new `?userId=` deep link below |
| Payroll History (admin-only) | `listPayroll({ scope: "all" })` (no month, unlike `PayrollStatusWidget`'s single-month fetch), filtered client-side by `employeeId` — `GET /payroll` has no `employeeId` filter at all |

**Permissions page deep link (small addition, as scoped):** `PermissionManagementPage.jsx` now
reads `?userId=` via `useSearchParams()`, defaults `activeKey` to the "User Overrides" tab when
present, and passes it to `UserOverridesTab` as `initialUserId` (a `useState` initializer, not
`useEffect`-synced, so a later prop change never yanks the picker away from a manually-selected
user). Adding `useSearchParams()` broke `PermissionManagementPage.test.jsx` in its entirety (all 8
tests — that file had never needed a `<MemoryRouter>` wrapper before); fixed by wrapping every
render call in a `renderPage()` helper.

**baseSalary asked, not assumed:** `User.baseSalary`'s `select: false` schema default means no
existing endpoint anywhere in the app actually returns a real user's stored salary — the Basic
Info card can't show a real figure without a small backend change. Asked the user; **confirmed:
frontend only, omit the real salary for now**, since the deploy instruction only covered frontend.

**Two real, pre-existing bugs found and fixed along the way, neither part of the original ask:**
- **dayjs object vs. formatted-string API param mismatch** — the Attendance card initially passed
  a raw `dayjs()` object straight to `getMyAttendance`/`getTeamAttendance`, which axios serializes
  to a full ISO string the backend's month parser rejects with 400 (found via a live smoke test,
  not the unit suite, since the mocked API doesn't care what shape its argument is). Fixed by
  keeping both a `CURRENT_MONTH` (dayjs object, for `AttendanceSummaryStats`'s real dayjs-method
  calls) and `CURRENT_MONTH_STRING = CURRENT_MONTH.format("YYYY-MM")` (string, for the two API
  calls) — matching `CheckInOutWidget.jsx`'s own established convention.
- **`useLeaveBalance` had no `.catch()` at all** — unlike its sibling attendance hooks, a real
  failure left `balance` stuck at `null` with no way to distinguish "still loading" from "failed,"
  and produced a genuine unhandled-rejection warning. Fixed by adding `error` state + `.catch()`;
  the hook now returns `{ balance, isLoading, error }`. `LeaveBalanceCard.jsx` (the one other
  consumer) is unaffected — it only destructures `{ balance, isLoading }`.

**Testing:** 12 new tests in `UserDetailPage.test.jsx` (independent section-failure isolation,
permission-gating per section, deep-link href, the guarded-deactivate/delete flows via the shared
hook); 2 new tests in `UserManagementPage.test.jsx` (row-click navigation, action-button clicks
inside a row don't also navigate — both scoped via `tr[data-row-key="…"]` to disambiguate
duplicate visible text across rows); 2 new tests in `PermissionManagementPage.test.jsx` (deep-link
pre-selects the tab/user). Full frontend suite re-run: no new regressions, only the
already-established baseline of pre-existing flaky AntD-Select-heavy tests in untouched files.
`npm run build` succeeds. Live-verified end-to-end in a real browser: deep link, full guarded
deactivate→reactivate cycle (a real `modal.confirm()` needs an actual follow-up click on the
rendered dialog, unlike the mocked version in unit tests), self-view section omissions.

---

## 8. Frontend Route Map (indicative)

```
/                        → redirect by role
/login
/forgot-password          (§7.19, added 2026-07-17 — not in the original route map)
/reset-password           (§7.19, added 2026-07-17 — not in the original route map)
/leads                   (table)      /leads/board
/leads/:id
/customers               /customers/:id
/projects/:id
                          (/tasks — employee "my tasks" — deliberately removed 2026-07-29, §6.4/§7.3)
/attendance               (self)      /attendance/team (manager)
/leave
/payroll                  /payroll/:id/payslip
/travel-logs
/tickets                  /tickets/:id
/payments                 (admin)
/amc
/reports
/settings/permissions      (admin)
/settings/users            (admin/manager, §7.19, added 2026-07-17 — not in the original route map)
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
| 3 | ✅ **Fully built and verified 2026-07-13:** Attendance (camera+geo capture, photos to Cloudinary, connectivity-gap detection, workingHours, team/org reports — §7.4, `attendance` module, 32 tests) + Leave (request/approve/mark-unapproved-absence, one-paid-leave-per-month quota resolved in §11.7 and confirmed enforced at approval time not request time — §7.5, `leave` module, 18 tests). ✅ **Live Location Tracking built and verified 2026-07-13** (§7.4b — `location` module, 19+1 tests), ahead of the rest of this phase. Attendance started as a minimal check-in/check-out slice built the same day as Location (13 tests) and was extended to the full spec in this task, reusing rather than replacing the placeholder model. New: `POST /attendance/heartbeat` (not in the original endpoint list — added because connectivity-gap detection needs a distinct "still alive" signal, deliberately not coupled to Location's GPS ping), new shared `src/services/cloudinary.service.js` and `src/services/report.service.js`, `pdfkit` dependency added for `GET /attendance/report?format=pdf`. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are now **required** env vars. **Follow-up fix the same day:** the photo requirement on check-in/check-out was moved from client-side-only to server-side-enforced (400 if missing) — `location.test.js`'s end-to-end test updated to supply one. Full suite: **208 tests, all passing.** ✅ **Frontend built — see §7.18**: Attendance/Leave/Location built together as three module folders sharing the same check-in/checkout state — check-in/out widget (native camera+geolocation, no new dependency), personal/team timeline with connectivity gaps as red bar segments, Leave request/scope-tabbed-list/admin-only-approve, and a new `/location` live-map + history-trail view (originally the native Google Maps JS SDK, migrated 2026-08-04 to `react-leaflet` + OpenStreetMap tiles, §11.11 — Google Maps was never actually functional in production). **Same-phase follow-up:** `useCheckedInHeartbeatLoop` closed the loop gap flagged above — heartbeat every 3 minutes, location pings on whatever `GET /location/config` currently says, both starting on fresh check-in AND resuming identically on an already-checked-in mount, pausing on a hidden tab, and never throwing on a failed call. 32 tests total (25 + 7). | Phase 0 (independent of 1–2) |
| 4 | ✅ **Built and verified 2026-07-13:** Payroll (§7.7, `payroll` module, 19 tests + 6 for `src/cron/payrollCron.test.js` = 25) — gross/net computed from Attendance + Leave + approved-only TravelLog mileage, `POST /payroll/run` (single-employee or bulk), `GET /payroll?scope=own\|all`, `GET /payroll/:id/payslip?format=pdf`, a monthly `node-cron` job (`src/cron/payrollCron.js`, new top-level directory). Two prerequisites closed first, in the same task: `User.baseSalary` (§6.1) and TravelLog's `pending`/`approved`/`rejected` approval workflow (§6.5/§7.6, resolving §11.4). `MILEAGE_RATE_PER_KM` is a new, optional env var (defaults to 10, a stated placeholder). **§11.5 resolved: record-keeping only for v1, no disbursement/payment-gateway integration.** **Correction (2026-07-13, follow-up):** `sales_associate`'s default `payroll` grant was fixed — §5 marks it "–" (no access), same as Manager, not "own payslip only" like Employee; an earlier build misread that "–" as blank and granted `sales_associate` the Employee default, now corrected in `permission.service.js`. Full suite: **263 tests, all passing** (verified via a real `npm test` run; the previously reported total also required correcting a miscount in the Transport/Travel approve/reject test count, 7 not 6). | Phase 3 |
| 5 | ✅ **Built and verified:** Support/Tickets + Customer Portal (§7.0/§7.8, `ticket` module, 35 tests + 6 in `auth.test.js` for Customer Portal self-signup). Customer Portal accounts authenticate through the exact same auth system (`role: "customer"`) and are self-signed-up (not admin-created), verified by an email-domain match against `Contact`/`Customer` records rather than an admin grant. `Ticket` raise (internal admin/manager, or customer portal self-raise)/list (`scope=all\|assigned\|own`)/assign/status-change/comments/attachments (Cloudinary, reusing `uploadAttendancePhoto`'s shared client) all built per §7.8. New `tickets` `PERMISSION_REGISTRY` entry and a `customer` `RolePermissionTemplate`. §11.2 (category/status split) resolved as part of this build. Full suite: **304 tests, all passing** (verified via a real `npm test` run — a follow-up added 2 more tests: manager's `scope=all` checked explicitly alongside admin's, and history-ordering across a mixed comment/status-change sequence). | Phase 2 (needs Customer) |
| 6 | ✅ **Built and verified 2026-07-13:** Transport/Travel (Google Maps Distance Matrix integration — §7.6, `transport` module, 28 tests). Auto-generates a `TravelLog` from Attendance checkout coords (direct call into `attendance.service.js#checkOut`, never fails checkout); manual entry with coords or a direct `distanceKm` override; `GET /travel-logs?scope=own\|team\|all` (mirrors Leave's shape) + `PATCH /travel-logs/:id/approve\|reject` (added 2026-07-13, resolves §11.4) + `GET /travel-logs/report` (reuses `src/services/report.service.js`). `GOOGLE_MAPS_API_KEY` is now a required env var. §11.4 (feeds payroll?) resolved 2026-07-13 — only `status: "approved"` entries feed Payroll mileage reimbursement. | Phase 3 |
| 7 | ✅ **Built and verified:** Payments + AMC (§7.9/§7.10, `payment`/`amc` modules, 16 + 20 tests). `Payment` (admin-only, no ownership scoping at all per §5) can optionally attach to a real `Invoice` via a new `invoiceId` field — applying it reduces `Invoice.balance` and updates `Invoice.status` (`paid` at 0, the newly-added `partially_paid` otherwise) — **§11.3 resolved: partial reconciliation, not a standalone log and not full invoicing**. `AMC`'s two-flow creation (`new_customer` reuses `customer.service.js#createCustomer` directly; `existing_customer` requires an in-scope `customerId`) matches smartrays.md's "ask which create client or convert client"; `view`/`edit` scoping ("own team"/"own") is resolved via the underlying Customer's ownership (new `customer.service.js#getVisibleCustomerIds` export), since AMC has no `ownerId` field of its own — Manager's "own team" tier is the "PM" role smartrays.md describes elsewhere. No automation on renewal for v1 (stated simplification). Full suite: **340 tests, all passing.** ✅ **Payments frontend built — see §7.22**: `/payments` (date-range filter tabs, server-paginated table, a Record Payment modal with a genuinely debounced customer search) — the first server-side pagination/date-filtering added to this backend for it, everything else still paginates client-side. AMC's own frontend remains a placeholder — not part of this task. | Phase 2 |
| 8 | ✅ **Built and verified:** Reports (§7.11, `report` module, 24 tests). Single `POST /reports/generate` `{module, filters, format}` dispatching to `attendance`/`leave`/`payroll`/`transport`/`leads`/`customers` — each via that module's own existing, already-scoped data-fetcher (`generateAttendanceReport`/`generateTravelLogReport` reused unmodified; `listLeaves`/`listPayroll`/`listLeads`/`listCustomers` reused with new column/row rendering added in `report.service.js` itself). No new `reports.generate` permission — gated per-module by reusing `can()` against that module's own actions. Per-module `filters` shape validated by reusing each target module's own existing query validator (`validateReportQuery`/`validateScopeQuery`/`validateListQuery`) rather than duplicating checks; `leads`/`customers` fall back to their model's own status enum since neither has a dedicated query validator to reuse. `GET /attendance/report`/`GET /travel-logs/report` internally call this dispatcher rather than duplicating report generation. **Cloudinary removed 2026-08-04:** all three callers (`POST /reports/generate` and both of the above) briefly uploaded every report to Cloudinary and returned `{ downloadUrl }` (Phase 8) before streaming the buffer directly again as of 2026-08-04, matching `GET /leads/export`/`GET /payroll/:id/payslip`'s pre-existing direct-stream shape — existing tests rewritten to assert against the real streamed response and to confirm no Cloudinary function is called. `GET /leads/export` and `GET /payroll/:id/payslip` were both deliberately excluded from the dispatcher itself (pre-existing separate export; single-document artifact, respectively; neither was ever routed through Cloudinary) — the payslip exclusion has a dedicated regression test proving it still streams directly. Full suite: **365 tests, all passing.** | All prior phases have data to report on |
| 9 | ✅ **Backend half built 2026-07-16 — see §7.16:** Notification module (§6.7), Web Push (VAPID) delivery, lead follow-up reminder cron — wired into Leads (assignment + reminders) and Ticket assignment. **This closes out every backend phase.** ✅ **Frontend half — Dashboard — built, see §7.20/§7.21:** the `/dashboard` shell composing Leads + Customers widgets (§7.20) plus 6 operational glance widgets — Attendance/Leave/Tickets/AMC/Payments/Payroll (§7.21) — by role via a declarative catalog (`dashboardConfig.js`), permission-gated per-widget on top of the role-level config. An Employee-facing own-scoped widget is a future incremental addition using the same pattern, not a gap. ✅ **Push receipt/display built 2026-08-07 (§6.7)** — service worker, subscription module, Settings → Account toggle; a real push was signed by the backend, accepted by FCM and displayed by the worker. **Phase 9 is now complete on both sides.** Production still needs `VITE_VAPID_PUBLIC_KEY` set on the frontend Vercel project (the *production* backend's public key) — until then the toggle correctly renders nothing. | All |
| — | ✅ **Built 2026-07-17 — see §7.19:** password reset (self-service email flow + admin override) and the User Management frontend screen (`/settings/users`, closing a gap that existed since Phase 0 — the backend `user` module had endpoints with no frontend consumer). Bundled login page visual redesign in the same task. Not a numbered roadmap phase — a cross-cutting fix/gap-closure task, not new module scope. **Also: first production deployment, to Vercel — see the Deployment section below.** | Phase 0 (`user` module) |

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
11. **Frontend map provider (Location/Attendance)** — ✅ **Resolved 2026-08-04, superseding the
    original §7.18 choice:** `react-leaflet` + free OpenStreetMap tiles, not the Google Maps JS
    SDK. The original choice was reasonable at the time, but the Google Maps integration was
    never actually functional in production — no billing account or real API key was ever
    configured (`VITE_GOOGLE_MAPS_API_KEY` sat blank/commented-out the whole time) — so every
    map view (`LiveMapView`, `HistoryMapView`, and the Attendance §7.4d map integration built
    the same day, hours earlier, on the now-removed Google Maps stack) was silently broken in
    production. Leaflet + OSM's standard tile server needs neither a key nor billing, so this
    migration is what actually made the feature work, not just a like-for-like library swap.
    `GoogleMapView.jsx`/`useGoogleMapsScript.js` deleted outright (not left as dead code);
    `LeafletMapView.jsx` is the new generic marker(s)/polyline renderer, using inline SVG
    `L.divIcon` pins (no external icon-asset URL, unlike Google's `maps.google.com`-hosted
    colored-pin icons) for the same per-marker `color` distinction the Attendance integration
    needs. The backend's own, unrelated `GOOGLE_MAPS_API_KEY` (Transport's Distance Matrix
    calculation, §7.6) is untouched — a different Google API for a different purpose. See
    `frontend/README.md`'s "Maps & camera dependency decisions" for the full write-up.

---

## §7.33 — Attendance & Leave pass (2026-08-05)

**Map tiles.** Superseding §11's Leaflet resolution only in styling, not stack: the tile source
moved from OpenStreetMap's default raster to **CARTO Positron** (`light_all`). Still free, still
key-less, still `react-leaflet` — the change is purely that OSM's road/landuse coloring competed
with this app's own semantic marker colors (red = connectivity issue, orange = geofence issue).
One `TileLayer` in `LeafletMapView.jsx` serves every map in the app, so this was a one-component
change. Attribution credits both OpenStreetMap (data) and CARTO (styling), as CARTO's terms require.

**`teams.view_team` — a second, read-only Team tier.** Every Team endpoint was gated on the single
admin-only `teams.manage` grant, so a manager could not see their own team's roster anywhere in the
UI. The new `view_team` action (granted to `manager` by default) opens `GET /teams`, `GET /teams/:id`
and `GET /teams/:id/members`, each scoped to the team(s) the caller personally heads. Every write —
create, update, delete, reassigning the head, adding/removing members — stays `teams.manage`.

Membership editing was deliberately **not** granted to managers. Adding a member is implemented as
"set that user's `managerId` to this team's head", so a manager with that power could pull any user
in the org onto their own team and thereby inherit every `view_team`-scoped grant over that person's
data. Org structure stays admin-controlled; a manager reads it. Asking for someone else's team
returns **404**, not 403 — a manager has no legitimate way to learn that id exists.

**`POST /attendance/mark-status` — gap-filling, explicitly not a reversal of §7.4's read-only
decision.** Marks a day with **no** attendance record as `absent`/`half_day`. Admin: any employee.
Manager: own direct reports only. Rejects (409) any date that already has a record, so a day with
real check-in evidence — photo, coordinates, timestamps — is never touched through this path;
`PATCH /attendance/:id` remains the only writer for an existing record, still admin-only and still
unexposed in the UI. The deliberate middle ground: **create where nothing exists, never modify what
does.** `present` and `on_leave` are excluded from the markable set (`present` is the one claim this
module exists to require evidence for; `on_leave` belongs to Leave's approval flow). No
photo/geolocation required or accepted — nothing is being asserted that would need evidence.

Frontend: the Attendance table only ever rendered real records, so missing days had no row to hang
an action off. Synthetic "no record" rows are now generated — but only when a single employee is
selected, since gaps are a per-person question — carrying the two mark actions. They never enter
the summary statistics, which count real outcomes only.

**Also in this pass:** Attendance Own/Team tabs for managers (`TeamAttendanceView` existed and
worked but nothing routed to it); a Team/Department column on the Admin Attendance and Admin Leave
tables, derived from the same sources as their existing Team filters; and a compact Check-In
button + live elapsed-time badge in the fixed top bar (hidden for admin), which reuses the existing
camera/geolocation flow via a new extracted `AttendanceCaptureFlow` shared with `CheckInOutWidget`.

**Four bugs fixed, all four with a root cause different from the one reported** — see
`backend/README.md` and `frontend/README.md` for each: a deactivated team type made its own team
permanently unsavable (400, not the reported 403 from a wrong endpoint); the Attendance Employee
filter dropped the whole Employee column rather than mismatching a response shape; and both Leave
"nothing happens" bugs traced to four action handlers having no error handling at all, plus action
buttons rendering from a blanket permission check with no per-row scope test.

---

## §7.34 — Customer Detail restructure + Lead panel width (2026-08-05, frontend-only)

**Invoice History is removed from the product surface.** Invoicing stays descoped: `Invoice`
remains a placeholder model with no service or controller, and `GET /customers/:id/invoices`
/`/ledger` were never built. The "Coming soon" placeholder section that held its place in the
layout is now deleted outright rather than hidden — with no path to real data, an empty section
on every customer's page was cost without benefit. The backend model is untouched.

**Customer Detail section order diverges from `leads-customer-functional-spec.md`.** Site &
Installation Details now leads, above Billing — for a solar install it is the identifying
"what is this job" information. Contacts and Contracts render side by side from `lg` upward
(stacked below it), reclaiming the vertical space two short list sections were each spending a
full page-width row on.

**Activity Log attribution needed no backend change.** `CustomerActivity.performedBy` was
already stored on every entry (required, `ref: "User"`) — it had simply never been rendered.
The read endpoint returns it unpopulated, so the actor's name is resolved client-side from the
existing `GET /users/dropdown` directory. Consequence: entries by a since-deactivated or
deleted user render "—", since that endpoint lists active users only. A one-line
`.populate("performedBy", "name")` on the backend read would close that gap; deliberately not
added, as this task was scoped frontend-only.

**Lead detail panel widened 640 -> `min(920px, 100vw)`.** Site Details was the cramped section,
but the panel was widened rather than that section's columns, so every section in the slide-over
gains the same room and none ends up visually out of step. Still exactly viewport-width on
mobile.

---

## §7.35 — AMC relocated into Customer Detail (2026-08-05)

**The standalone `/amc` page is retired.** AMC is inherently per-customer, so it now lives as a
section on the Customer Detail page; the route, its nav item and `AmcPage.jsx` are gone. The
`amcApi` module survives the removal because the Dashboard AMC widget and Reports still consume
it.

**Renewal is now modelled as a chain, not an edit.** `POST /amc/:id/renew` creates a NEW record
(`previousAmcId` pointing at its predecessor) and sets only `status: "expired"` on the old one —
the old record's amount and dates are never touched. This is the deliberate choice: an AMC's
history is a sequence of terms, each with its own price and coverage window, and editing dates
forward in place would destroy exactly the record a renewal is supposed to create. Defaults
(start where the previous term ended, run one calendar year, carry the amount) are all
overridable per renewal.

**Near-expiry is derived server-side.** `isExpiringSoon` — active and renewing within 30 days —
is computed in `decorateAMC` and returned on every AMC response, so the threshold has a single
definition rather than one on each side of the API drifting apart.

**`GET /amc?customerId=`** narrows within the caller's existing role scope, never widens it —
the filter is applied on top of the ownership-derived scope, so asking for another team's
customer returns an empty list rather than leaking.

---

## §7.36 — Attendance absorbs Leave (2026-08-05, frontend-only)

**The `/leave` route is retired.** Attendance and leave answer the same question — was this person
at work, and if not why — so they now share one page with role-shaped tabs: Employee gets
My Attendance / Apply Leave / My Leave, Manager gets My Attendance / Team Attendance / Leave
(their Own/Team split becoming a sub-filter inside that tab, not two more top-level tabs), Admin
gets Attendance / Leave Requests / Leave History.

**No permission or endpoint changed.** Every `leave.*` gate, the backend's own
`ensureCanActOnLeave` scoping, and manager approve/decline/mark-absence/delete parity are exactly
as built in §7.5c/§7.5d. `LeaveListPage` became the reusable `LeaveSection` with a `view` prop.

**Pending leave renders as decision cards, decided leave as a table** — the old table hid the
reason behind an ellipsis, which is the one field an approval decision actually turns on.

**Date filtering is one preset dropdown** (Today / Yesterday / This Month / Custom); month-wise
filtering is removed. The attendance LIST endpoints accept only `?month=`, so rather than widen a
permission-scoped endpoint, a range fetches the months it touches and narrows client-side — the
pattern `AdminAttendanceView` already used. A new `utils/date.utils.js` centralises local-date
formatting specifically so nothing calls `toISOString()` on a local-midnight value again (that
lands a day early east of UTC — the bug shipped in the previous batch).

---

## §7.37 — App shell: user controls in the top strip, full attendance control (2026-08-05)

**The left sidebar's footer block is retired.** Notification bell, settings gear, name and Sign
out now live right-aligned in the fixed top strip; the nav list runs to the bottom of the
sidebar. Below `sm` the name and Sign out collapse into an avatar dropdown so the strip never
overflows a 390px viewport. The bell is relocated, not rebuilt, so its polling behaviour is
unchanged.

**The header check-in button became the full shift state machine** — play (check in / resume),
pause (break in), stop (check out), plus the live elapsed timer. It reuses the existing endpoints
and the existing camera/geolocation capture modal; no backend changed. Two server rules are
mirrored as disabled-with-tooltip controls rather than buttons that would fail: check-out is
blocked during a break, and there is one break per shift. Admin renders none of it (exempt from
attendance), while keeping the user-controls block.

Built under `layouts/` rather than in the attendance module, which a concurrent session owned at
the time — it consumes that module's hooks/API/components without modifying them. The older
`HeaderCheckInButton` is left in place but is now unreferenced.

---

## §6.5 addendum — Attendance data retention (2026-08-05)

Attendance records and their Cloudinary photos are now deleted after
`ATTENDANCE_RETENTION_DAYS` (default 45) by a daily **Vercel Cron** entry hitting a shared-secret
`POST`/`GET /attendance/cleanup`. Not node-cron: that needs a long-lived process this serverless
backend doesn't have, which is why the three existing `src/cron/*` jobs never fire in production.

Three properties define the design:

1. **A payroll guard runs first.** Attendance for a month with no `Payroll` document yet is never
   deleted — attendance is the input payroll is computed from, and deleting it first would
   destroy the evidence behind an uncalculated figure.
2. **Cloudinary before the database row.** The `publicId` needed to locate an asset lives only on
   that row, so deleting the row first would orphan the asset permanently. A failed asset
   deletion leaves the record in place for the next run; the job is idempotent and batched
   (default 200/invocation) to fit the serverless execution limit.
3. **Every run is audited.** One `AttendanceRetentionLog` summary per run — counts, cutoff and the
   date window — holding no personal data. Written directly in response to the earlier
   leave-record incident, where a hard delete with no trace was both unrecoverable and
   uninvestigable.

---

## §7.35 addendum — AMC leads the Customer Detail page (2026-08-05)

AMC moved above Site & Installation Details. Rationale: an AMC nearing renewal is the only
time-sensitive item on the page, and burying it under the static install specification meant
scrolling past everything permanent to reach the one thing that needs action. Order is now
AMC → Site & Installation → Billing → Contacts | Contracts → Activity Log.

---

## §7.36 addendum — Attendance/Leave tab fixes (2026-08-05)

Stat cards now sit ABOVE the filters on every attendance tab (they had been reported as moved but
were still rendering inside the records section, below the filter row). The Employee filter no
longer prints raw ObjectIds for deactivated/deleted staff. The admin Leave tab drops the viewer's
personal leave-balance card in favour of four queue metrics — pending, on leave today (named),
upcoming this week, unapproved absences this month — and gains the same date preset dropdown as
Attendance, reusing `date.utils.js`.

The separate Leave History tab is removed; a Status filter (including a derived "Unapproved
Absence" option) covers it on one tab. A request now renders as either an approval card or a table
row, never both — the previous split rendered every pending request twice for admins.

---

## §7.4b addendum — Live Map folded into Attendance (2026-08-05)

The standalone `/location` page is retired; live tracking is now a tab on `/attendance`, gated on
`attendance.view_location`. `locationApi` survives the page's removal (the heartbeat loop imports
it).

Two design notes worth recording, because the obvious assumptions are wrong:

- **Geofence violations are not per-ping.** `LocationPing` carries no flag; violations are time
  intervals on the Attendance record. Per-ping violation status is derived by intersecting a
  ping's `capturedAt` with those windows.
- **`LeafletMapView` gained an additive `paths` prop** so several employees' trails can share one
  map. `HistoryMapView` renders a single employee and could not be reused directly; extending the
  shared map was preferred over a second map component, keeping one `TileLayer` in the app.

Staleness is explicit: a position older than 10 minutes is rendered red and labelled, because
browser geolocation stops when a tab is backgrounded or a phone locks, and a frozen marker that
reads as live is worse than no marker.

---

## §7.39 — Employee self-service pages (2026-08-05)

Employees get dedicated routes (`/attendance` attendance-only, `/leave`, `/team`, `/profile`,
`/settings`) and a narrower nav. Admin and manager keep the combined tabbed Attendance page.

Three server-side rules define this feature, none of them enforced in the UI:

1. **`PATCH /users/me` rejects rather than ignores.** photo always; name/phone only with
   `canEditOwnProfile`; email/role/permissions/managerId/isActive/teamId never. A request carrying
   a forbidden field is refused whole. `password` routes through `/auth/change-password`, which
   requires the current password.
2. **`showContactsToMembers` omits contact fields from the query**, so they never reach a browser
   that shouldn't have them. Defaults false; only the team's head or an admin toggles it.
3. **`GET /users/me/permissions` and `GET /teams/mine` are SELF endpoints**, added rather than
   relaxing the admin-only equivalents. `/teams/mine` exists because an employee holds no
   `teams.*` grant at all.

---

## §7.40 — Remember this device (2026-08-05)

An opt-in checkbox on the 2FA step lets a browser skip the **second factor** for 30 days. The
password is always required — the device token is consulted only after the password has already
been verified, so it can never become a standalone credential.

Design decisions worth keeping:

1. **The cookie reuses `getAuthCookieOptions()` verbatim**, not a parallel set of options. That
   config (httpOnly, `SameSite=Lax`, same-origin via the Vercel rewrite proxy) is load-bearing
   and was arrived at the hard way; only `maxAge` and the cookie name differ.
2. **Tokens are bcrypt-hashed at rest** on `user.trustedDevices` (`select: false`) and matched
   starting from the authenticated user's own document, so one user's token cannot be replayed
   against another account. Expired entries are pruned on read and write; the list caps at 10.
3. **Every trusted device is revoked** on password change, 2FA re-enrolment, 2FA reset (own or
   admin-performed), and recovery-code redemption. A redeemed recovery code means a lost
   authenticator, so ticking the box on a recovery-code sign-in deliberately mints nothing.
4. **Logout does not clear the cookie** — surviving sign-out is the point of the feature. It goes
   away on revocation, password change, or expiry.

## §7.41 — Permissions matrix redesign (2026-08-06)

One row per module: level (None/View/Edit/Full) + scope (Own/Team/All) + capability chips,
replacing the horizontally-scrolling checkbox grid. Frontend only — the registry, the endpoints
and `validatePermissionsBody` are unchanged and remain the source of truth.

The pre-build audit of all 46 keys across 15 modules is what shaped this:

1. **The CRUD ladder is per-module, not universal.** `leave` has view+delete but no create/edit;
   `amc` has view+edit but no create/delete; `tickets` has no plain `view`. A universal ladder
   would emit unregistered keys and make those rows unsaveable (400).
2. **Scope is not a permission key for Leads/Customers/Payments/AMC** — it is resolved from the
   role and record ownership in the service layer. Those rows render scope inert, with the reason.
3. **Tickets' tiers are own/assigned/all**, where the middle one is not "team", so all five of its
   keys render as chips rather than being coerced into the scope control.
4. **No stored grant is unrepresentable**, but three existing ones sit off a clean rung
   (`manager.leave` has delete with no edit; `manager.tickets` and `customer.tickets` have create
   with no view). They round-trip byte-for-byte because the selection carries the real key sets
   and only re-expands on an explicit user choice — never on load.
5. **Live template drift exists**: 2 of 3 users diverge from their role template today, including
   `teams.view_team` granted to the manager template on 2026-08-05 that never reached the existing
   manager user. `reconcileRoleTemplate` repairs templates only, never users — which is exactly
   why divergence is now marked on the override screen.

## §7.42 — AMC renewals surfaced above the Customers table (2026-08-06)

`GET /amc?expiringSoon=true` + `ExpiringAmcPanel` above the Customers list, so renewals are
visible without opening each customer.

1. **The filter is wider than the badge.** `expiringSoonCondition` returns active records renewing
   within 30 days OR already overdue; `decorateAMC`'s `isExpiringSoon` flag deliberately excludes
   overdue ones because it drives an amber badge. Two concepts, kept separate rather than one
   bent to serve both.
2. **Scoping unchanged.** The filter is `$and`-ed on top of `resolveAMCFilter`'s ownership scope,
   so it narrows within what the caller can see and never widens it.
3. **One query, not N+1.** `populate("customerId", "companyName")` with the name lifted onto
   `customerName`; `customerId` is flattened back to a plain id so existing callers are
   unaffected. Asserted by counting collection operations, not by checking the names came back.
4. **The panel is a worklist, not the card grid.** `CustomerAmcSection`'s four-across cards answer
   "what is this customer's contract"; this answers "whose renewals need action". Same data,
   different question, deliberately different shape — the Timeline/Location lesson applied before
   the fact rather than after.
5. **Hidden when empty**, count in the header when collapsed, overdue visually distinct from
   expiring-soon, renew reusing the single existing `POST /amc/:id/renew` path and the existing
   `amc.edit` gate.

*Supersedes the raw module list in `.context/smartrays.md` for scope/data-model/API detail.
`.context/smartrays.md` remains authoritative for tech stack, coding standards, and folder
structure (unchanged here). `.context/leads-customer-functional-spec.md` was used only as a
UX/data-model reference for Leads & Customers — its actual tech stack (Next.js/Supabase) is
not part of this project.*
