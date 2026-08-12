# Smartrays Solutions CMS — Backend

Internal CRM + Operations platform API. Node.js + Express (ES Modules) + MongoDB/Mongoose.

See `.context/final-plan.md` (repo root) for the full data model, permission matrix, and
phased roadmap this backend is built against. `.context/smartrays.md` is the source of the
coding standards referenced below.

---

## Setup

```bash
cd backend
npm install
cp .env.example .env
cp .env.example .env.local   # optional, for personal machine overrides
```

Fill in `.env`:
- `MONGODB_URI` — a running MongoDB instance (local install, Docker, or Atlas)
- `JWT_SECRET` — any long random string for local dev
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — used once by the admin seed script below
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`,
  `GOOGLE_MAPS_API_KEY`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — all required at boot now (every
  phase through Phase 9 is built); see the Environment Variables section below for what each is for
  and how to generate it.

### Bootstrapping the first admin

This is an internal tool — there is no public self-registration, and `POST /auth/register`
requires an already-authenticated admin. That means the very first admin account can't be
created through the API. Run this once against a fresh database:

```bash
npm run seed:admin
```

It reads `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` and inserts
one admin user directly. After that, the admin can create every other account through
`POST /auth/register`.

Optionally, also run:

```bash
npm run seed:permission-templates
```

Ensures all 5 role permission templates exist (§7.12), seeded with the defaults from
`.context/final-plan.md` §5. Not required — `GET /permissions/templates` lazily seeds the same
way on first fetch — but useful to run explicitly as part of a deploy/setup step. Safe to
re-run; only creates templates that don't exist yet, never overwrites a customized one.

### Running

```bash
npm run dev     # nodemon, auto-restarts on file changes
npm start       # plain node, for production
```

Health check: `GET /health` → `{ "success": true, "message": "Server is healthy" }`

---

## Architecture & Patterns

Every module under `src/modules/<feature>/` follows the same 5-file shape (skip files a
module genuinely doesn't need — e.g. `auth` has no model of its own, it uses the `User` model):

```
<feature>.model.js       Mongoose schema — DB operations only, no business logic
<feature>.service.js     Business logic — the only place that touches models directly
<feature>.controller.js  Thin HTTP layer — calls a service function, wraps result in ApiResponse
<feature>.routes.js      Express Router — wires middleware + validation + controller together
<feature>.validation.js  Request-shape checks that run before the controller
```

**Shared building blocks (`src/utils`, `src/middlewares`, `src/helpers`):**

| File | Purpose |
|---|---|
| `src/utils/ApiError.js` | Throw this anywhere (service, validation, middleware) for any error. Carries `statusCode`, `message`, `errors[]`. |
| `src/utils/ApiResponse.js` | Success response shape: `{ statusCode, success, message, data }`. Controllers do `res.status(x).json(new ApiResponse(x, data, message))`. |
| `src/utils/asyncWrapper.js` | Wrap every **async** controller/middleware with this so rejected promises reach the error handler. Synchronous `throw` inside a plain (non-async) middleware does not need it — Express catches those natively. |
| `src/middlewares/errorHandler.middleware.js` | Registered last in `app.js`. Converts any thrown error into `{ success: false, message, errors }`. Adds `stack` outside production. |
| `src/middlewares/authenticate.middleware.js` | Reads the JWT from the auth cookie, loads the user, sets `req.user`. Required before `authorize`/`requireAdmin` or reading `req.user`. **Also the only place that emits `SESSION_EXPIRED`** — see "Two kinds of 401" below. |
| `src/middlewares/authorize.middleware.js` | `authorize(module, action)` — generic permission gate for single-tier modules, backed by `can()`. `authorizeAny(module, actions[])` — passes if the user holds *any* of the given actions, for modules with more than one viewing tier (currently just `location`: `view`/`view_team`/`view_all`). `requireAdmin` — plain role check for admin-only actions that aren't part of the module/action permission matrix (e.g. creating accounts). |
| `src/helpers/permission.helper.js` | `can(user, module, action)` — admins always pass; everyone else needs `user.permissions[module][action] === true`. Role-based defaults used to live here (`getDefaultPermissionsForRole`) but were removed once the real `permission` module (below) replaced them with an admin-editable, database-backed template system — `can()` itself has always stayed role-unaware and still does. |
| `src/constants/permissionRegistry.constants.js` | `PERMISSION_REGISTRY` — hardcoded structural list of every module + its valid actions. Not admin-editable; only grows when a developer builds a new module. See the Permissions section below. |
| `src/config/env.js` | Loads `.env` then `.env.local` (which wins on conflicts), fails fast (`process.exit(1)`) if a required variable is missing. |
| `src/database/connection.js` | `connectDatabase()` — connects Mongoose to `MONGODB_URI`, exits on failure. |

**Response contract** (per `.context/smartrays.md`): every endpoint returns
`{ success, message, data }` on success or `{ success: false, message, errors }` on failure.

**Auth model**: JWT is signed and stored **only** in an httpOnly cookie
(`COOKIE_NAME`, default `smartrays_token`) — `secure` in production, `sameSite: strict` in
production / `lax` in dev. The token is never present in any response body.

---

## Modules

| Module | Status |
|---|---|
| `auth` | ✅ Built — register (admin-gated), login, logout, `/me` |
| `lead` | ✅ Built — full CRUD, board/table filters, calls, hot flag, import/export, lead sources. `Convert to Customer` is now a real implementation (see below) — no longer a 501 stub. |
| `location` | ✅ Built — Live Location Tracking (see below). Backend only — map UI is a frontend follow-up. |
| `permission` | ✅ Built — role permission templates + per-user overrides (see below). |
| `user` | ✅ Built — roster CRUD, team scoping, self/admin field rules, manager assignment (see below). Model still shared by `auth`, `lead`, `location`, `permission`. |
| `attendance` | ✅ **Fully built** — check-in/check-out with photo capture, connectivity-gap detection, `workingHours`, own/team/org history, PDF/Excel reports (see below). |
| `customer` | ✅ Built (Phase 2) — Customer/Contact/Contract/Credential CRUD, contract→Project+Invoice automation, deactivation cascade, encrypted credentials vault, activity log (see below). `Invoice` is a minimal placeholder model only — no invoice service/controller/routes yet. |
| `project` | ✅ Built (Phase 2) — Project + team assignment (see below). No `POST /projects` — projects are only ever created via the customer module's contract automation. Task functionality (model, endpoints, one-`in_progress`-task-per-employee constraint) was deliberately removed 2026-07-29 — not never built, actually removed. |
| `leave` | ✅ Built (Phase 3) — request/approve/mark-unapproved-absence, one-paid-leave-per-month quota (see below). |
| `transport` | ✅ Built (Phase 6) — `TravelLog` auto-generated from Attendance checkout + manual entry, own/team/org history, PDF/Excel reports. **Retrofitted 2026-07-13** with a `pending`/`approved`/`rejected` approval workflow (see below). |
| `payroll` | ✅ Built (Phase 4, 2026-07-13) — monthly gross/net computation from Attendance + Leave + approved TravelLog data, mileage reimbursement, PDF payslips, a monthly `node-cron` job (see below). |
| `ticket` | ✅ Built (Phase 5) — raise/list/assign/status/comments/attachments, Customer Portal-scoped access (see below). Customer Portal self-signup is a companion piece built the same task — see the Auth section below. |
| `payment` | ✅ Built (Phase 7) — admin-only manual payment log, with optional partial reconciliation against an existing `Invoice` (see below). |
| `amc` | ✅ Built (Phase 7) — two-flow creation (new-or-existing customer), "own team"/"own" scoped via the underlying Customer's ownership (see below). |
| `report` | ✅ Built (Phase 8) — unified `POST /reports/generate` dispatcher (attendance/leave/payroll/transport/leads/customers), no new permission, uploads to Cloudinary and returns a download URL (see below). **`GET /attendance/report`/`GET /travel-logs/report` now internally reuse this dispatcher — breaking response-shape change, see those sections.** **§7.23 added 11 `GET /reports/analytics/*` aggregation endpoints** (the first MongoDB aggregation pipelines in this backend) in a new sibling `analytics.service.js`/`analytics.controller.js` (see below). |
| `notification` | ✅ Built (Phase 9, 2026-07-16) — `Notification` + `PushSubscription` models, Web Push (VAPID) delivery via `web-push`, self-scoped subscribe/unsubscribe/list/mark-read endpoints (see below). Wired into Leads (assignment + a follow-up-reminder cron) and, as a deliberate small addition beyond the Leads-only spec, Ticket assignment. |

### Auth (`/api/v1/auth`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Authenticated admin only | Creates a **staff** account (`admin`/`manager`/`sales_associate`/`employee`, or a `customer` account manually as an admin fallback). No public self-registration for staff. `permissions` is always seeded from the new user's role's current template — see the Permissions section below. |
| POST | `/customer/signup` | Public | **Customer Portal self-signup** (Phase 5, §7.8) — see below. |
| POST | `/login` | Public | Sets the auth cookie on success. Unchanged for Customer Portal accounts — same login as everyone else. |
| POST | `/logout` | Authenticated | Clears the auth cookie. |
| GET | `/me` | Authenticated | Returns the current user (from `req.user`, no extra DB call). |

`User.role` is one of `admin`, `manager`, `sales_associate`, `employee`, `customer` — see
`.context/final-plan.md` §11.1 for why there's no separate `executive` role.

**Customer Portal self-signup (`POST /auth/customer/signup`, Phase 5) — resolved decisions:**
- Customer Portal users authenticate through the **exact same** auth system as every other
  role — `role: "customer"`, the same JWT/cookie flow, the same `POST /auth/login`. No separate
  auth mechanism.
- Accounts are **self-signed-up**, never admin-created via `POST /auth/register` (though
  `createUser` still accepts an optional `customerId` too, as an admin manual-fixup path).
- Verification is an **email-domain match**, not an admin grant:
  `user.service.js#createCustomerSelfSignupUser` calls
  `customer.service.js#resolveCustomerIdByEmailDomain(email)`, which checks `Contact.email`
  first (a company realistically has several people's addresses on file — higher hit-rate) and
  falls back to `Customer.email` (a single company-level address) only if no `Contact` matches.
  On a match, a `User` is created with `role: "customer"` and `customerId` set; on no match,
  signup is rejected — **400** (this codebase has no 422 anywhere, so 400 keeps the error-code
  vocabulary consistent) with "No matching company found for this email domain — please contact
  your account manager."
- Permissions are seeded from the new `customer` `RolePermissionTemplate` (see the Permissions
  section below): `{ tickets: { create: true, view_own: true } }` and nothing else.
- Deliberately a **separate** endpoint from `POST /auth/register`, not overloaded onto it —
  public (no `authenticate`/`requireAdmin`), and its own validator
  (`validateCustomerSignupInput`, no `role` field at all).

6 new tests in `auth.test.js` (19 total for the module): succeeds via a `Contact`-email domain
match, succeeds via the `Customer.email` fallback when no `Contact` matches, rejects clearly
with no match at all, rejects a duplicate email, rejects an invalid email/short password, and
the newly signed-up account logs in afterward like any other.

**Resolved implementation note (was: added during the Leads build):** `POST /auth/register`
used to accept an optional `permissions` object as a stopgap, before the Permissions module
existed — without *some* way to grant module access at creation time, every non-admin account
would have been permanently locked out of everything. **That field has been removed** now that
the real Permissions module (below) exists; registration always seeds from the role's current
template, and per-user customization happens afterward via `PATCH /users/:id/permissions`.

**Resolved implementation note (added during the User Management build, §7.0b):** account
creation logic now lives entirely in `user.service.js#createUser` — `auth.controller.js`'s
`register` handler calls it directly instead of keeping its own copy. `auth.service.js` no
longer has a `registerUser` function at all (no thin pass-through wrapper either — that would
just be pointless indirection). `POST /auth/register` remains the **only** HTTP route that
creates a user; no separate `POST /users` was added, since the actual problem being resolved was
duplicated creation *logic*, not duplicated routes. `seedAdmin.js` was updated to call
`user.service.js#createUser` too, so there is exactly one code path that creates a `User` document
anywhere in the codebase.

**Self-service password reset (`POST /auth/forgot-password`, `POST /auth/reset-password`, §7.17):**

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/forgot-password` | Public | Body `{ email }`. **Always** returns the same generic 200 response regardless of whether the email matches an account, an active one, or nothing at all — deliberate, to prevent account enumeration. Only when a matching **active** account exists does it actually generate a token and send an email; `requestPasswordReset` in `auth.service.js` returns silently otherwise. |
| POST | `/auth/reset-password` | Public | Body `{ token, newPassword }`. `token` is the raw value from the emailed link; the DB only ever stores its SHA-256 hash (`User.passwordResetToken`), the same one-way-hash reasoning as `passwordHash` itself — a database leak alone can't be used to complete a reset. Rejects (400) an invalid, already-used, or expired (>1 hour) token. Clears the token fields on success so the same link can't be replayed. |

`User.passwordResetToken`/`passwordResetExpiresAt` are both `select: false`, same
defense-in-depth pattern as `passwordHash`/`baseSalary` — never returned by an ordinary
query. `src/services/email.service.js` wraps Nodemailer/SMTP for the actual send; mocked at
the module boundary in every test (`auth.test.js`) — no test sends a real email.

**Admin override (`PATCH /users/:id/reset-password`, §7.17)** — see the User Management
section below.

### Leads (`/api/v1/leads`, `/api/v1/lead-sources`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/leads` | `leads.view` | List with filters: `search`, `owner`, `followUp` (`today`\|`overdue`\|`this_week`\|`none`), `status`. |
| POST | `/leads` | `leads.create` | `sales_associate` accounts always get `ownerId` forced to themselves, regardless of what's sent. |
| GET | `/leads/export` | `leads.view` | Streams an `.xlsx` of the current filtered list directly (Cloudinary/reports pipeline isn't wired up until Phase 2/3/8). Registered before `/:id` so Express doesn't treat "export" as an id. |
| POST | `/leads/import` | `leads.create` | `multipart/form-data`, field name `file` (CSV or `.xlsx`). First row is headers; matched case-insensitively against `name/email/phone/companyName/source/status/budget`. Invalid rows are skipped and reported, not fatal to the batch. Imported leads are always owned by the importer. **Duplicate detection:** a row is skipped (not created, not updated) if its `email` OR `phone` (case/whitespace-normalized) matches an existing lead **anywhere in the system** (org-wide, not scoped to the importer) — deliberately NOT `companyName`, since multiple genuine distinct contacts can legitimately share one company. Also checked within the same file: if two rows share an email/phone, only the first is created. Each skipped row in the response's `skipped` array is tagged `type: "invalid"` (missing name / bad status) or `type: "duplicate"` (with `matchedField` and, when it matched an already-saved lead, `existingLeadId`/`existingLeadName`); the response also reports `importedCount`/`duplicateCount`/`failedCount` as three separate totals (`skippedCount` is their sum, kept for convenience). See `lead.service.js#importLeadsFromFile`. |
| GET | `/leads/:id` | `leads.view` | 404 (not 403) if the lead exists but is outside your scope — avoids confirming a lead's existence to someone who can't see it. |
| PATCH | `/leads/:id` | `leads.edit` | `sales_associate` cannot reassign `ownerId` through this endpoint (that's a manager/admin action). |
| DELETE | `/leads/:id` | `leads.delete` | |
| PATCH | `/leads/:id/status` | `leads.edit` | Requires `lostReason` in the body when `status` is `lost`. |
| PATCH | `/leads/:id/hot` | `leads.edit` | Toggles `isHot`. |
| POST | `/leads/:id/calls` | `leads.edit` | Logs a `LeadCall`. |
| GET | `/leads/:id/calls` | `leads.view` | Call history, newest first. |
| POST | `/leads/:id/convert` | `leads.edit` | **Real implementation (Phase 2).** Creates a `Customer` from the lead's data — `companyName`/`email`/`phone`/`source` pre-fill from the lead but are overridable in the request body; `projectManagerId` has no lead-derived fallback and is the one field the caller must always supply (400 if missing). Sets `Lead.convertedCustomerId` — the closest thing to "archiving" a lead, since there's no separate archived flag and this endpoint doesn't force a status change (the caller marks the lead `won` beforehand as its own explicit step). |
| GET | `/lead-sources` | Authenticated (any role) | Low-sensitivity config list. Lazily seeded with the 10 defaults from `.context/final-plan.md` §6.2 on first fetch if the collection is empty — no separate seed script. |

**Scoping** (`.context/final-plan.md` §5/§11.9), enforced in `lead.service.js`, not just at the
route layer:
- `admin` — sees/edits everything
- `manager` — sees/edits leads owned by themselves or anyone whose `User.managerId` equals
  their own `_id` (direct reports only, one level)
- `sales_associate` / everyone else — sees/edits only leads they own

Verified end-to-end with real HTTP requests across an admin, a manager, two sales associates
on that manager's team, and a third sales associate deliberately left off the team — see the
verification notes below.

**Website lead-intake webhook — `POST /leads/website-intake` (§7.25, added 2026-07-30):** the
one deliberately public, unauthenticated route on this router (registered before `/:id`, though
that ordering is moot for `POST` today since there's no colliding `POST /:id` route). Built for
a WordPress "Get a Quote" form (Forminator's webhook add-on) to post submissions directly into
Leads. Gated by a shared secret instead of `authenticate`/`authorize`:

- **Auth:** a shared secret matching `WEBSITE_LEAD_INTAKE_TOKEN` (see `.env.example`), accepted
  from **either** of two sources (both supported since 2026-07-31, §7.33): the `X-Webhook-Token`
  header (the original method, for any integration that can set custom headers), or a `?token=`
  query parameter — added because Forminator's built-in Webhook integration only accepts a plain
  URL, with no way to attach custom headers. Either one alone is sufficient; if both are present,
  the header takes precedence. If that env var is unset, the route refuses every request with
  `503` rather than accepting unauthenticated writes with no way to lock them down; a wrong token
  (from either source) is `401`, identical to a missing one — the response never reveals whether
  a token is even configured.
- **Payload:** the raw Forminator payload, whatever shape it arrives in. There is no fixed,
  knowable set of field ids for the real WordPress form (Forminator auto-generates ids like
  `name-1`/`email-1`/`textarea-1` per form, and they differ per site), so
  `lead.service.js#createLeadFromWebsiteIntake` does best-effort keyword matching over the
  payload's keys (`name`, `email`, `phone`/`mobile`/`whatsapp`, `company`/`business`,
  `message`/`textarea`/`comment`/`note`/`query`/`requirement`) rather than expecting exact ids.
  Handles three shapes transparently: a flat `{fieldKey: value}` object, one nested under
  `data`, or Forminator's own `fields: [{name, value}]` array export shape. A fixed list of
  known wrapper/meta keys (`form_id`, `form_name`, etc.) is excluded first so, e.g., `form_name`
  (the FORM's name) is never mistaken for the submitter's own name field.
- **Required:** a name, and at least a phone or an email — `400` if neither can be found in the
  payload at all.
- **`ownerId`:** since there's no `requestingUser` on this path (unlike every other lead-
  creation route), the lead is assigned to the longest-tenured admin account — the same "no
  explicit owner → assign to the highest-authority actor available" reasoning `POST /leads`
  already applies when a non-`sales_associate` creator omits `ownerId`, just with no creator at
  all to default to here. That admin also gets the existing `lead_assigned` notification, same
  as any other new-owner assignment.
- **`clientType`:** **left genuinely unset** if no recognizable value is present in the payload
  — a confirmed design decision (corrected 2026-07-31, §7.25 — an earlier version of this
  function defaulted it to `"residential"`, contradicting this decision; see below). Whoever
  qualifies the lead (admin/manager, via the normal Edit Lead flow) fills it in. Set directly if
  a recognizable, valid value IS present in the payload.
- **`source`:** always `"Website"` (already one of the seeded `LeadSource` defaults).
- **No data loss on unmapped fields:** the full raw payload is always JSON-serialized into
  `notes`, underneath whatever message/comment field was matched — nothing submitted is ever
  silently dropped even when a field isn't recognized by the keyword matcher.

**`Lead.clientType` is no longer `required: true` at the schema level (removed 2026-07-31,
§7.25)** — that constraint is what actually forced the "default to residential" workaround to
exist in the first place, since `Lead.create` would otherwise throw for a website-intake
submission with no client-type signal. `POST /leads` (manual creation) still requires it exactly
as before — enforced instead at the HTTP-validation layer (`lead.validation.js
#validateCreateLeadInput`), the same "required only for this one path" pattern `lostReason`
(required only when `status: "lost"`) already used in this same model. Editing a lead to fill in
a previously-unset `clientType` via `PATCH /leads/:id` already worked correctly before this fix
and needed no change — that validation only ever blocks *clearing* an existing value, not setting
one from empty.

9 new/updated tests (`lead.test.js`, "Website lead intake webhook" describe block) — missing/wrong
token, successful creation from both the flat and `fields`-array payload shapes, admin
assignment + notification, the two "can't identify a name/contact" 400 cases, `clientType`
genuinely unset (checked on the real persisted document, not just the response) when no
recognizable value is submitted (this test previously asserted the `"residential"` default as
correct, which is exactly why the defaulting bug went uncaught — it locked in the wrong behavior
instead of testing for the right one), a valid explicit `clientType` still saves correctly, and
an unrecognized `clientType` value also leaves it unset rather than defaulting.

**4 more tests added (§7.33, 2026-07-31)** for the `?token=` query-param auth alternative: a
request with only the query param (no header) succeeds; a request with the wrong query-param
value is rejected exactly like a wrong header (`401`); a valid header takes precedence over a
wrong query param present at the same time. The existing "no token at all" test already covers
the "neither source present" case unchanged.

### Live Location Tracking (`/api/v1/location`)

Ties into Attendance but lives in its own `location` module — see `.context/final-plan.md`
§7.4b for the full design writeup. Backend only; the map UI (live marker, path polyline) is a
frontend follow-up, and the API shape here was designed so that UI can be added later with no
API changes.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/pings` | Authenticated only, no module permission | Body `{ coords: {lat, lng}, capturedAt }`. `employeeId` always comes from the session, never the body — a client can't submit a ping on someone else's behalf. **409** if the employee has no open `Attendance` record (never checked in, or already checked out). |
| GET | `/live` | `authorizeAny("location", ["view","view_team","view_all"])` | Latest ping per employee, restricted to employees who are currently checked in. |
| GET | `/history?employeeId=&date=` | `authorizeAny("location", ["view","view_team","view_all"])` | One employee's full-day ping trail, oldest→newest. Both params optional (default self / today). Out-of-scope `employeeId` → **404**, matching the Leads precedent. |
| GET | `/config` | Authenticated only | Returns `{ pingIntervalMinutes }` so the client schedules its own ping loop instead of hardcoding it. |

**Permissions** — three tiers (`view`/`view_team`/`view_all`), the first module in this codebase
with more than one. `employee`/`sales_associate` get `location.view: true` by default at
registration; `manager` gets `location.view_team: true` by default. Admin always bypasses.
None of this required a new permission mechanism — `can()` is unchanged; see `authorizeAny`
below. (These role defaults used to be a hardcoded function; they're now generated from a
real, admin-editable template — see the Permissions section right below.)

**One small, generic addition made to support this (not location-specific):**
`authorizeAny(module, actions[])` in `authorize.middleware.js` — passes if the user holds *any*
of the given actions. `location.service.js` still resolves *which* tier(s) they hold to build
the actual visible-employee-id set (a union of every grant held, not just the widest — an
admin override granting a manager `view` on top of their `view_team` default must not be
silently dropped).

**Bug found and fixed during this build (in `User`, not `location`):** Mongoose's default
`minimize: true` was silently stripping the entire `permissions` field from `GET /auth/me`
whenever every module inside it ended up empty (e.g. an explicit `{}` override to revoke all
`location` grants) — an empty object and a missing field are not the same thing for a
permissions field. Fixed by setting `minimize: false` on the `User` schema. Caught by a test,
not by inspection — see `.context/final-plan.md` §6.1/§7.4b for the full writeup.

**Geofencing (added later, §6.5/§7.4) — `POST /pings` also checks the ping's distance from the
shift's check-in point.** `attendance.service.js#applyGeofenceCheck` is called directly from
`submitPing` here (this module already imports the `Attendance` model for its own open-shift
check, so calling straight into the sibling module's exported function is the same cross-module
direct-call precedent already used elsewhere, e.g. `attendance`→`transport`) — no gap-window
logic is duplicated in this module. See the Attendance section below for the full design
(the geofence center, the violation-window shape, the new `GEOFENCE_RADIUS_METERS` env var, and
why this uses a plain Haversine calculation rather than the Google Maps Distance Matrix API).
**Never blocks the ping** — `applyGeofenceCheck` wraps its entire body in try/catch and always
resolves, the same "never block the primary action" guarantee `generateAutoTravelLog` already
established for Attendance checkout; the ping document itself is created before this runs, so a
failure here can never undo it.

### Permissions (`/api/v1/permissions`, `/api/v1/users/:id/permissions`)

See `.context/final-plan.md` §7.12 for the full design writeup. Formalizes the pattern used ad
hoc for `location` above (role defaults + per-user admin override) into one real module,
replacing the hardcoded `getDefaultPermissionsForRole()` function and the register-time
`permissions` field workaround (§7.0) with a proper admin-editable system. Three distinct
pieces:

- **`PERMISSION_REGISTRY`** (`src/constants/permissionRegistry.constants.js`, hardcoded) — the
  structural list of every module + valid action, used to validate everything below. Grows only
  when a developer builds a new module.
- **`RolePermissionTemplate`** (DB, admin-editable) — what's granted **by default** to a role.
  Editing a template only affects users created *after* the edit — never retroactive.
- **`User.permissions`** (DB, per-user) — what's **actually granted** to one person. Seeded
  from their role's template at registration, independently editable per-user after that.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/permissions/registry` | `permissions.manage` | Returns `PERMISSION_REGISTRY` as-is. |
| GET | `/permissions/templates` | `permissions.manage` | All 5 role templates, lazily seeding any missing. |
| GET | `/permissions/templates/:role` | `permissions.manage` | One role's template. |
| PATCH | `/permissions/templates/:role` | `permissions.manage` | Edits a template. **Full replace, not a deep merge.** Does not touch existing users. |
| GET | `/users/:id/permissions` | `permissions.manage` | One user's actual permissions (a user's own are already visible via `GET /auth/me`). |
| PATCH | `/users/:id/permissions` | `permissions.manage` | Admin override for one user. **Full replace, not a deep merge.** |
| POST | `/users/:id/permissions/reset` | `permissions.manage` | Overwrites this user's permissions with their role's **current** template, discarding any customization. |

No `POST /permissions/templates` — roles are a fixed 5-value enum, never user-created, so
templates are only lazily seeded (GET) and edited (PATCH), same as `LeadSource` (§7.1).

**Initial template seed values** — generated from the §5 permission matrix (every ✅ becomes a
`true` grant), not carried over unchanged from the old hardcoded function. This is a
**deliberate broadening**: Manager/Sales Associate now get real default Leads access, which the
matrix always described but nothing previously enforced:
```
manager:          { leads: { view, create, edit, delete: true }, location: { view_team: true } }
sales_associate:  { leads: { view, create, edit, delete: true }, location: { view: true } }
employee:         { location: { view: true } }
admin/customer:   {}
```

Gated by `authorize("permissions", "manage")` rather than `requireAdmin` — even though only an
admin will ever hold that grant today, using the same `can()`-backed mechanism as every other
module keeps this module self-consistent instead of a special case.

No application bugs found while building or testing this module — 20 tests, all passing on the
first implementation.

### RolePermissionTemplate drift reconciliation (§7.12b, 2026-08-03)

**The bug this exists to prevent, found twice in one session.** A role's template is lazily
seeded from `INITIAL_TEMPLATE_DEFAULTS` **once**, the first time anyone reads that role, and read
verbatim from the database from then on (`getOrCreateTemplate`, above) — editing
`INITIAL_TEMPLATE_DEFAULTS` in code has **zero effect** on a template that already existed before
the edit shipped. Twice on 2026-07-31/08-03 (the §7.5c and §7.5d Leave manager-parity changes), a
real permission action was added to `manager`'s code default and silently never reached the
already-seeded live template — caught only by chance, because I happened to be live-verifying that
exact feature immediately after shipping it, and fixed by hand each time via a one-off
`PATCH /permissions/templates/manager` call. A follow-up audit also found a **stale, orphaned**
`employee.tasks` key still sitting in the database — Task functionality was fully removed from
`PERMISSION_REGISTRY`/`INITIAL_TEMPLATE_DEFAULTS` on 2026-07-29, but `employee`'s template, never
touched since its original 2026-07-17 seeding, never got the memo. Nothing in the test suite could
ever catch this class of bug — tests always start from a freshly-seeded, empty database, so a
template is always in sync with code there by construction.

**What it does (`permission.service.js#reconcileRoleTemplate`/`reconcileAllRoleTemplates`).** For
each of the 4 non-admin roles (`manager`/`sales_associate`/`employee`/`customer` —
`RECONCILABLE_ROLES`; `admin`'s template is always `{}` and reconciling it would be a meaningless
no-op):
- Any module/action key present in `INITIAL_TEMPLATE_DEFAULTS[role]` but **missing outright** from
  the stored template gets added, using the code's default value — the exact §7.5c/§7.5d bug,
  generalized and automated.
- Any module/action key stored in the template that **no longer exists anywhere** in
  `PERMISSION_REGISTRY` gets removed — genuinely dead data, the `employee.tasks` case generalized.
  If removing invalid actions empties a module out entirely, the module key itself is dropped too,
  rather than leaving a dangling `{}` behind.

**What it deliberately never touches: any key that already exists, regardless of its value.** This
only ever adds a key that's missing outright or removes one that's invalid outright — it never
inspects, compares, or overwrites the *value* of an existing key. A manager whose `leave.approve`
has been customized to `false` via the Permissions UI keeps exactly that, forever — reconciliation
has no opinion on it at all, because the key already exists. This is what makes it safe to run
automatically and unconditionally: it can only ever fill a structural gap or remove structural
dead weight, never revert an admin's actual decision.

**Boot-time, not per-request — a deliberate choice.** Lazy per-`GET /permissions/templates/:role`
reconciliation was considered and rejected: it would silently mutate data on every single template
fetch (a read endpoint quietly becoming a write), and would only ever reconcile whichever one role
happened to be requested, leaving the other three (including ones never viewed through the admin
UI at all) still drifted indefinitely. A boot-time pass over all 4 roles at once is more visible
(one clear log line per process start, not an invisible side effect buried in a GET handler) and
guarantees every role gets checked, not just whichever one an admin happens to click into.

**Wired into both entry points this app actually boots from** — `server.js` (local/traditional
persistent-process hosting) and `api/index.js` (the actual Vercel serverless entry point, where
`server.js` never runs at all; see this file's own Deployment section for that gap already existing
for cron jobs). `reconcileRoleTemplatesOnBoot()` caches its own promise across calls, the identical
pattern `database/connection.js#connectDatabase` already uses and for the identical reason: on
Vercel, every request can be a fresh cold start, so without caching this would re-run (and re-hit
the database 4 times) on every single request in production. Whichever entry point a given process
actually boots from does the real reconciliation once; every call after that in the same warm
process — including every other serverless invocation hitting the same warm container — just
awaits the same already-settled promise. A reconciliation failure is caught and logged, never
thrown — this is a hygiene pass, not something that should be able to crash the server or block a
request.

**Immediate cleanup, done as part of this same task.** The live `employee` template's orphaned
`tasks` key is gone — confirmed via a real server boot against the shared database (this dev
database and the deployed production API share the same `MONGODB_URI`, so the fix is already live
in production too, no separate step needed).

9 new tests (`permission.test.js`): a missing key gets added with the correct default; an orphaned
module gets removed entirely; an orphaned action within an otherwise-valid module is removed while
the module's other actions survive; a key customized away from its default is left completely
untouched; running it twice in a row is idempotent (second run reports `changed: false` for
everything); a never-drifted, freshly-seeded template is already a no-op;
`reconcileAllRoleTemplates` processes exactly the 4 reconcilable roles, never `admin`. Full backend
suite: 667/667 passing, no regressions.

### User Management (`/api/v1/users`)

See `.context/final-plan.md` §7.0b for the full design writeup. The roster CRUD/management layer
that was missing until now — `User` was previously a shared model only, imported by `auth`,
`lead`, `location`, and `permission` but with no dedicated endpoints of its own.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/users/dropdown` | Authenticated (any role) | Low-sensitivity `_id`/`name`/`role` picker list, active users only — for other modules' "assign to" dropdowns (Leads owner, etc.). Not gated by `users.*`, same reasoning as `GET /lead-sources`. Registered before `/:id` so Express doesn't treat "dropdown" as an id. |
| GET | `/users` | Authenticated (no route-level gate) | Full roster list, scoped in the service, not the route: `view_all` sees everyone; `view_team` sees direct reports + self; **no grant at all still returns 200 with a 1-item list containing just the caller** (`fallbackToSelf`, see below) rather than 403 — a plain "list my stuff" request always succeeds. Filters: `role`, `isActive`, `managerId`, and (added 2026-07-30, §7.28) `teamId`. |
| GET | `/users/:id` | Authenticated (self always allowed) | A user can always fetch their own record regardless of any grant, matching `GET /auth/me`. Looking up **someone else's** specific id with no `users.*` grant is still a 403 (deliberately not narrowed to self the way the list is — see below); **404** (not 403) if the target exists but is outside scope for a caller who does hold a grant, matching the Leads/Location precedent. |
| PATCH | `/users/:id` | Authenticated (self or admin) | Self can update `name`/`email`/`phone` only. Admin can additionally update `role`/`managerId`/`isActive`/**`baseSalary`** (added 2026-07-13, §7.7 Payroll prerequisite) on **anyone's** record, including their own. A non-admin sending a privileged field on their own record gets 403, not a silent drop. Enforced in **two layers**: `user.validation.js` rejects it before the controller even runs, and `user.service.js#updateUser` enforces the identical rule again — deliberate defense in depth, not accidental duplication. |
| GET | `/users/:id/deactivation-impact` | Admin only | **Added 2026-07-31 (§7.31).** Returns `{ teamsLed, ownedLeadsCount }` — what needs reassigning before this person can be deactivated. `teamsLed` is every active Team they head, each with `name` + a live `memberCount` (same derivation as `listTeams`'s own). `ownedLeadsCount` is their still-open Lead count (`status` not `won`/`lost` — a closed lead needs no new owner). Purely informational: the frontend calls this first to decide whether to show the reassignment modal, but nothing stops calling `PATCH /:id/deactivate` directly without it — that endpoint re-validates everything itself regardless. |
| PATCH | `/users/:id/deactivate` | Admin only | **Reworked 2026-07-31 (§7.31) — no longer hard-blocks a team head or lead owner (a genuine reversal of the 2026-07-30 guard, §7.28); guides a reassignment through instead.** Body accepts optional `{ reassignTeamsTo: { teamId: newHeadUserId, ... }, reassignLeadsTo: userId }`. With nothing to reassign, behaves exactly as before. Otherwise: every led team needs an entry in `reassignTeamsTo` and, if there's at least one open lead, `reassignLeadsTo` is required — anything missing is rejected (400) naming exactly what's unresolved (e.g. `"Cannot deactivate: this person leads the following team(s) needing a new head: Sales Team; and owns 3 active lead(s) needing a new owner. Provide reassignment info to continue."`). Once everything required is present, every new head is validated (`ensureValidManagerId`) and the new lead owner confirmed to exist — **all validation before any write** — then applied in order (team heads, then lead owners, then the deactivation itself). **Not wrapped in a Mongo transaction** — this app's dev/test database (`mongodb-memory-server`, standalone, no replica set) doesn't support multi-document transactions at all, only the production Atlas cluster does, so a transaction here would break the entire test suite while working fine in production; the validate-everything-before-writing-anything order is the accepted tradeoff instead. Reactivate has no guard of its own — always safe, unchanged. |
| PATCH | `/users/:id/reactivate` | Admin only | |
| PATCH | `/users/:id/manager` | Admin only | Sets or clears (`managerId: null`) a user's manager. A non-null `managerId` must belong to a `manager` or `admin` — same rule enforced at creation time (see below). |
| PATCH | `/users/:id/reset-password` | Admin only | Admin override for password reset (§7.17), separate from the token-based self-service flow above. Body `{ newPassword? }`. If `newPassword` is supplied, it's set directly and the response's `tempPassword` is `null`. If omitted, the backend **generates a random one-time temp password** and returns it in `data.tempPassword` — the only time it's ever visible in plaintext, nothing persists it anywhere else. Chosen as the default path (a single-click "reset this locked-out user's password" action from the User Management screen) over forcing the admin to invent one every time; an admin who wants an exact password can still supply one. |
| DELETE | `/users/:id` | Admin only | **Guarded, permanent hard-delete (added 2026-07-30, §7.28) — see the writeup below.** Body `{ reason }`. |

**Permissions** — deliberately **two** tiers (`view_team`, `view_all`), not three like `location`.
There's no plain `users.view` grant in `PERMISSION_REGISTRY` because a user's own record is
always reachable regardless — via `GET /auth/me`, the self-bypass in `getUserById`, and (new)
the `fallbackToSelf` behavior in `listUsers` — a separate "view own" permission grant would be
redundant when the self-floor is unconditional either way. `manager` gets `users.view_team: true`
in its default template (added to `RolePermissionTemplate`'s seed values alongside this build);
`sales_associate`/`employee` get none by default, so `GET /users` for them returns just
themselves and `GET /users/:id` for anyone else's id is a 403.

**`resolveVisibleUserFilter(requestingUser, { fallbackToSelf })`** in `user.service.js` is the one
function behind both `GET /users` and `GET /users/:id`'s scoping, but the two endpoints call it
differently on purpose: `listUsers` passes `fallbackToSelf: true` (a list request should never
hard-fail just because the caller can't see anyone else's records), while `getUserById` passes
the default `false` (deliberately fetching a specific *other* person's id with no grant is still
treated as a permission violation, not silently redirected to your own record).

**`baseSalary` (added 2026-07-13, §6.1/§7.7 Payroll prerequisite):** a resolved schema gap, not
a silent addition — nothing before Payroll tracked a salary figure at all. `select: false` on
the schema (same defense-in-depth pattern as `passwordHash`) — never returned by a plain
list/dropdown query, only by the update response itself or `payroll.service.js`'s explicit
`.select("+baseSalary")`. Treated as a privileged field exactly like `role`/`managerId`/
`isActive` — admin-only, not self-editable, for the obvious reason that letting anyone set
their own salary would defeat the field's purpose.

**`customerId` (added, §6.1/§7.8 Customer Portal prerequisite):** another resolved schema gap
— only ever set for `role: "customer"` accounts, linking a portal user to the `Customer`
company they belong to. Normally set automatically at self-signup (see the Auth section above),
though `createUser`/`PATCH /users/:id` both accept it too as an admin manual-fixup path. Also a
privileged field — admin-only, not self-editable, since letting a portal user relink themselves
to a different company would be a security hole, not a convenience.

**Shared manager-validation rule:** `ensureValidManagerId()` in `user.service.js` is the single
place that enforces "a manager must be a user with role `manager` or `admin`" — used by
`createUser` (registration), `updateUser` (admin editing `managerId` through the general update
endpoint), and `assignManager` (the dedicated endpoint above). One rule, one implementation, three
call sites.

**Bug found and fixed during this build:** `getUserById`'s original query built the Mongo filter
as `User.findOne({ _id: targetId, ...scopeFilter })`. For the `view_team` branch, `scopeFilter` is
itself `{ _id: { $in: [...] } }` — the object spread silently let that key clobber the explicit
`_id: targetId` constraint, so the query ignored which user was actually being requested and
matched *any* visible user instead. A test asserting a manager gets 404 for an unaffiliated sales
associate caught it (got 200 instead). Fixed with `$and: [{ _id: targetId }, scopeFilter]`. This
is a genuinely new class of bug specific to `user` — Leads' ownership scoping filters on a
separate `ownerId` field, so its filter and lookup key never collide the way `_id` does here.

33 tests, all passing; this bug was the only one found. (Grew to 45 with the 2026-07-30 §7.28
additions below — 8 new tests: the team-head deactivation guard and the `teamId` filter. Grew
again to 50 the same day with the hard-delete tests below. Grew to 62 on 2026-07-31 when §7.31
reworked the deactivation guard itself into guided reassignment — see below.)

**Guarded hard-delete (`DELETE /users/:id`, added 2026-07-30, §7.28) — a deliberate reversal of
the earlier "Users are never hard-deleted, only deactivated" decision.** See
`.context/final-plan.md` §6.1/§7.0 for the dated reasoning. Deactivate remains the default,
reversible lifecycle action for every other case; this exists only for an admin who explicitly
wants an already-deactivated account gone for good. `user.service.js#hardDeleteUser` runs three
guards **in this exact order**, each independently tested:

1. **Reject if the user is still `isActive: true`** (400) — hard-delete is only ever a step
   *after* deactivation, never a shortcut around it.
2. **Reject if the user is currently a Team's `headManagerId`** (400, naming the team(s), same
   message shape as the deactivate guard). In practice this should be unreachable —
   `setUserActiveStatus` already refuses to deactivate a team head, and guard #1 above means only
   an already-deactivated user ever reaches this point — but it's kept as cheap defense-in-depth
   against any future path that flips `isActive` without going through that guard.
3. **Require a non-empty `reason`** (400) — there is no undo after this, so a reason is mandatory,
   not optional context.

Only once all three pass is a full snapshot of the User document written to a new
`DeletedUserAuditLog` collection (`deletedUserAuditLog.model.js`) — the **only** place that data
survives afterward — and only then is the User document actually removed. This is a distinct
collection from `PaymentAuditLog` (payment module), not a reuse of it: `PaymentAuditLog.
previousValues` only needs the fields that changed, since the parent Payment survives a soft
delete, but here the parent User will not exist afterward, so `DeletedUserAuditLog.snapshot` must
be the full document.

**Deliberately does NOT cascade-delete or fix up this user's id anywhere else** (`Lead.ownerId`,
`Attendance`, `Payment.collectedBy`, etc.) — every one of those already resolves an unknown/
missing user id to `"—"` via the same Map-lookup-with-fallback pattern used throughout the
frontend, so those records keep displaying gracefully rather than crashing; there's nothing to
fix up. Verified directly in `user.test.js`: a Lead owned by a just-deleted user is still
fetchable via `GET /leads` with its `ownerId` unchanged, not stripped or erroring.

**Confirmed already correct (follow-up check):** `getUserById`'s self-shortcut
(`if (String(targetId) === String(requestingUser._id)) return requestingUser;`) runs before any
permission check at all, so a user with **no** `users.*` grant can always fetch their own `/:id`
— this was already true from the initial build, not a fix. Locked in with an explicit regression
pair in `user.test.js`: self-fetch with no grant succeeds (200), a *different* user's id with no
grant still 403s (proving the self-bypass wasn't accidentally broadened into `GET /users`' list-
level `fallbackToSelf` behavior above).

**Guided reassignment on deactivate (§7.31, 2026-07-31) — a genuine reversal of the 2026-07-30
hard-block guard (§7.28), not a variation on it.** The earlier guard simply refused to
deactivate a team head at all, forcing the admin to go reassign the team elsewhere first and
retry. Now `PATCH /users/:id/deactivate` does the reassignment itself, in the same call: no
longer just teams either — a lead owner's still-open Leads are in scope too (`CLOSED_LEAD_STATUSES
= ["won", "lost"]`, shared between `getDeactivationImpact` and `setUserActiveStatus` so the two
can never disagree on what counts as "still open"). See the `GET /users/:id/deactivation-impact`
and reworked `PATCH /users/:id/deactivate` rows in the table above for the full request/response
shape and guard behavior.

**Why no Mongo transaction, checked rather than assumed:** this app's local/CI database
(`tests/helpers/testDb.js` → `mongodb-memory-server`, a standalone instance, no `replSet`
option) does not support multi-document transactions at all — only the production Atlas cluster
does. Wrapping the reassignment + deactivation in `session.withTransaction()` would work in
production but break every test for this feature. Instead: validate everything (every new head
via `ensureValidManagerId`, the new lead owner's existence) **before writing anything**, then
apply in a fixed order — team heads, then lead owners, then the deactivation itself — so the
only way a write can fail partway is a genuine infrastructure error (not a validation one, since
that already happened), and even then the user is never left deactivated without their teams/
leads having actually been reassigned first.

**12 new tests (§7.31)** — `GET /users/:id/deactivation-impact`: admin-only, empty impact for
someone with nothing to reassign, correct `teamsLed` name/memberCount, `ownedLeadsCount`
correctly excludes won/lost, 404 for a nonexistent user. `PATCH /users/:id/deactivate`: works
unchanged with nothing to reassign; an inactive team's head still isn't counted; rejects with no
reassignment info naming the team(s); rejects when only some led teams are covered; succeeds
once every team has a valid new head; rejects an invalid new head (not manager/admin); rejects
with no `reassignLeadsTo` when active leads exist, stating the count; succeeds once provided,
moving every open lead's `ownerId`; won/lost leads are never touched and never block
deactivation; rejects a `reassignLeadsTo` that doesn't resolve to a real user; requires BOTH
team and lead reassignment when the person has both, naming both in the rejection. One
pre-existing hard-delete test needed updating (not just patching around) since its own lead
fixture would now block the deactivate step it depends on — changed that lead's status to
`"won"` before deactivating, which is also more realistic for what that test is actually
checking (a closed lead surviving its owner's deletion, not an open one silently reassigned).

### Employee self-service (§7.39, 2026-08-05)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/users/me/permissions` | any signed-in user | The caller's OWN role + permissions. There is no id parameter, so it cannot return anyone else's. |
| PATCH | `/users/me` | any signed-in user | Self-update behind a server-side field whitelist. |
| PATCH | `/users/:id/can-edit-own-profile` | that user's manager, or admin | Grants/revokes self-editing of name + phone. |
| PATCH | `/teams/:id/show-contacts` | that team's head, or admin | Opts the team into showing members' contact details. |

**The admin-only `/users/:id/permissions` gate is untouched** — `/users/me/permissions` is a
separate endpoint, not a relaxation of the existing one.

**`PATCH /users/me` rejects loudly; it never silently drops fields.** A silent drop returns 200
and looks like success, which conceals both an honest client bug and a deliberate escalation
attempt — and an employee PATCHing their own `role` or `managerId` is the obvious attack here.
Three tiers, enforced in the service layer:

- **Always allowed:** `photo`. A photo asserts nothing about who someone is in the org chart.
- **Allowed only when `canEditOwnProfile`:** `name`, `phone`. These identify a person to everyone
  else, so they are HR-controlled by default (`canEditOwnProfile` defaults to **false** — letting
  anyone rename themselves freely makes an org chart untrustworthy).
- **Never allowed:** `email`, `role`, `permissions`, `managerId`, `isActive`, `teamId`,
  `passwordHash`, `canEditOwnProfile`, `baseSalary`, `customerId` → **403**.

`password` is deliberately on the never-list: it changes through `POST /auth/change-password`,
which requires the CURRENT password. Routing it through here would let anyone with a live session
change a password without proving they knew the old one. A whole request containing a forbidden
field is refused — the legitimate fields in it are not partially applied.

`canEditOwnProfile` cannot be set by the user it applies to, only by their manager or an admin;
self-granting would make the flag meaningless.

**`showContactsToMembers` omits contact fields from the QUERY**, rather than stripping them after
the fact or hiding them client-side. A field that is never selected cannot later leak through a
serializer change, a debug log, or a client that ignores the flag. Defaults to **false**: a
teammate list is for knowing who you work with, and defaulting phone numbers and emails open
would have leaked everyone's details org-wide the moment the team page shipped. Only that team's
own head or an admin may toggle it — a manager of a different team has no business making that
disclosure decision.

23 tests in `selfService.test.js`.

### Today's roster: manual marking, designation, leave-driven attendance (§7.4g, 2026-08-09)

**`MARKABLE_STATUSES` is now `["absent", "half_day", "present"]`.** `present` was excluded on the
grounds that it is the one claim requiring real check-in evidence. The real objection was narrower:
nothing distinguished a mark made on someone's word from a device-captured one. `isManuallyAdjusted`
+ `adjustedBy` ARE that distinction, they are set on every record `mark-status` creates, and they are
permanent — so a manually-marked `present` can always be told apart from a photo-and-GPS check-in,
including in a payroll dispute months later. The roster exists for people who genuinely cannot check
in (no internet, dead phone, app not loading), and refusing to record that they worked does not make
the data more honest, only emptier.

**`on_leave` stays excluded, deliberately.** It is written solely by `leave.service.js` on approval.
Hand-setting it would assert a leave state with no leave record behind it. The roster displays it and
can never set it.

**`PATCH /attendance/:id/roster-status`** — corrections to a previous MANUAL mark (Half Day → Full
Day), since `mark-status` 409s once a record exists. Status only. **Admin-only**, unlike
`mark-status`: that endpoint takes an `employeeId` and scopes per-record in the service, whereas this
one takes a raw attendance id and `adjustAttendance` has no ownership check — opening it to managers
would let one correct any record by guessing an id. The service refuses any record whose
`checkIn.time` is non-null (409), so this path can only ever touch manual marks. **That guard is in
the service, not the UI**, so it holds if a future UI change forgets.

**Leave approval now writes attendance.** Full-day approval creates `on_leave`, half-day creates
`half_day`, both flagged `isManuallyAdjusted`/`adjustedBy`. One-way: nothing writes back to a leave
record. **Conflict:** a day that already has a record is left completely untouched and reported to
the caller as `attendanceConflicts` (with `hasRealCheckIn` per day). It never overwrites — a real
check-in carries data that cannot be reconstructed — and it never blocks the approval, because
approval is a leave decision and stranding it over an attendance clash the employee cannot resolve
would be worse. This is the same "create where nothing exists, never touch what does" rule
`markAttendanceStatus` already established.

**New `User.designation`** (optional string) — job title, shown on the roster. In `PRIVILEGED_FIELDS`,
so admin-only: it is an HR attribute appearing on a payroll-adjacent screen, and people should not be
able to retitle themselves. A self-update attempt is rejected 403.

### HR profile fields (§7.48, 2026-08-11)

`dateOfBirth`, `joiningDate`, `address`, `emergencyContactName`, `emergencyContactPhone` on `User`,
all optional — every existing account predates them and must keep loading and saving without one.

All five are in **`PRIVILEGED_FIELDS`**, so `PATCH /users/:id` rejects them (403) from a
self-update, for the same reason as `baseSalary`: a joining date and an emergency contact are HR
records about a person, not preferences that person sets.

Being *absent* from that list was the dangerous shape, not being rejected by it — before this,
sending `joiningDate` to a self-update returned **200** and silently ignored it, which reads as
accepted. The tests assert 403 AND that the value did not change.

**Part two, deliberately not here:** Aadhaar/PAN images and bank details. Those need authenticated
Cloudinary delivery and AES-256-GCM respectively — see the Cloudinary limitation above.

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

### Two kinds of 401, and why the client can now tell them apart (2026-08-08)

A 401 from this API means one of two completely different things:

- **Session expiry** — the credential identifying you is missing, malformed, expired, or belongs to
  a user who no longer exists. The client should sign you out and send you to `/login`.
- **Credential rejection** — your session is perfectly healthy; the secret you just *typed* was
  wrong. The client should show the message and let you try again.

The frontend could not distinguish them. Its axios interceptor redirected to `/login` on **every**
401 except a hard-coded `/auth/login` exemption, so a mistyped password on 2FA-disable,
change-password or admin re-authentication **signed the user out** — and the modal unmounted before
the server's message could render. It read as "the feature doesn't work", with no error at all.

**Session-expiry 401s now carry `errors: [{ code: "SESSION_EXPIRED" }]`** and the client redirects
only on that. Everything else propagates to the caller. The direction is deliberate: the redirect
is a positive assertion by the server rather than a growing exemption list on the client, and an
exemption list is exactly how this hid. A new credential-checking endpoint is safe by default; a
new session check has to opt in, next to the other seven.

All **8** session-expiry 401s are thrown from `authenticate.middleware.js`, through one
`sessionExpired()` helper, which is what makes a single marker sufficient:

| Marked `SESSION_EXPIRED` (client redirects) | Not marked (client shows the message) |
|---|---|
| no auth cookie · malformed/expired JWT · a pre-auth token used as a session · session user deleted | login: wrong email/password |
| pre-auth token missing · expired · wrong scope · its user deleted | change-password: wrong current password |
| | admin-reset re-auth: wrong password |
| | 2FA disable: wrong password, and wrong code |
| | enrolment confirm / verify: wrong code |

Two other 401s exist and are neither kind — `attendance.routes.js`'s cleanup-token check and
`lead.routes.js`'s webhook-token check. Both are machine-to-machine and never reached by the
browser app, so the interceptor never sees them.

`unauthorized.test.js` pins the contract in **both** directions, because either half failing is a
real bug: a marker that goes missing breaks sign-out, and a marker leaking onto a credential
rejection resurrects this one.

### Two-factor authentication (§7.38, 2026-08-05)

TOTP + recovery codes. **The email factor is deliberately NOT built** — production SMTP is set to
a placeholder host (`smtp.placeholder-not-configured.local`), so `/auth/forgot-password` returns
500 today and emailed codes would go nowhere. Shipping an email factor onto a dead sender would
be worse than not shipping one.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/2fa/verify` | pre-auth token | Accepts a TOTP **or** a recovery code. Issues the real session cookie on success. |
| POST | `/auth/2fa/enrol/start` | session **or** pre-auth | Returns the secret + `otpauth://` URI once. Does not enable 2FA. |
| POST | `/auth/2fa/enrol/confirm` | session **or** pre-auth | Proves possession, enables 2FA, returns the 10 recovery codes once. |
| POST | `/auth/2fa/recovery-codes` | session | Regenerates, invalidating the previous set. |
| POST | `/auth/2fa/admin-reset` | session + admin | Requires the ACTING admin's own password **and** own 2FA code. |
| POST | `/auth/change-password` | session | Requires the current password. |

**The login flow is the security-critical part.** When a second factor is outstanding, `login`
sets **no cookie at all** — the response carries only a 5-minute pre-auth token
(`scope: "pre_auth"`). `authenticate` and `authenticatePreAuth` accept **strictly disjoint**
scopes: a pre-auth token placed in the auth cookie is rejected, and a session token cannot be
used to skip enrolment. The pre-auth token travels as an `Authorization: Bearer` header, never a
cookie, so the browser cannot send it anywhere automatically.

**Secrets.** The TOTP secret is AES-256-GCM encrypted at rest via the EXISTING
`credentialEncryption.service.js` — not a second crypto path. Recovery codes are bcrypt-hashed
and consumed by *removing the hash*, so replay is impossible by construction rather than by a
flag. Every 2FA field is `select: false`.

**Enrolment is OPT-IN for every role (2026-08-08).** It used to be mandatory for `admin` and
`manager`, enforced on every authenticated request by a gate in `authenticate.middleware.js` that
403'd with `TWO_FACTOR_ENROLMENT_REQUIRED` until they enrolled. That gate, its exempt-path list,
the `constants/twoFactor.constants.js` module that defined the rule, the `mustEnrol`/
`requiresEnrolment` branch in login, and the `authenticateEither` middleware that let a pre-auth
token reach `/2fa/enrol/*` are **all removed** — not left behind disabled. Enrolment is now purely
a post-authentication action, so those routes take a full session like every other self-service
endpoint. **Nothing was auto-disabled:** users already enrolled keep their 2FA and are still held
at the second factor at login.

**`POST /2fa/disable` — turning your OWN 2FA off.** This is the part that carries the weight.

It requires the current password **AND** a live second factor (TOTP or recovery code) in the same
request. `authenticate` is necessary but deliberately **not sufficient**: the threat 2FA exists to
defeat is an attacker holding a session they shouldn't, so letting a bare session switch it off
would mean the protection could be removed by precisely the thing it protects against. A request
carrying nothing but a valid cookie is rejected at the validator, before it reaches the service.

Details worth keeping:

- **The password is checked first**, so a wrong password cannot burn a recovery code —
  `verifySecondFactor` consumes one on success and increments the lockout counter on failure, and
  neither should be reachable without the first factor.
- **Self-scoped.** The id comes from `req.user`; any `targetUserId`/`userId` in the body is
  ignored. There is no path here for one user to disable another's — the audited **admin reset**
  below remains the only cross-user route, unchanged.
- **On success it clears the secret and every recovery code, and revokes all trusted devices**
  (via the existing `clearTwoFactor`). A device trusted against a second factor must not outlive
  it.
- **Both enable and disable are audited** with actor and timestamp, to the same standard as the
  admin reset. Recording only one of them would tell half the story.

**Admin reset** demands the acting admin re-authenticate with password AND their own 2FA code in
the same request — a compromised session must not be able to strip another admin's second factor.
An admin without their own 2FA cannot perform it at all, since "re-enter your second factor"
would otherwise degrade to "re-enter your password", which a compromised session already has.
Every reset is logged with actor and target.

**otplib v13 note:** `verifySync` THROWS on anything that isn't 6 digits rather than returning
`{ valid: false }`. Recovery codes are 10 hex characters and arrive through the same field, so
the TOTP check is wrapped in a try/catch — without it the request 500s and the recovery-code
branch is never reached, i.e. recovery codes could never be redeemed.

`twoFactor.test.js` covers exactly the properties that matter, including asserting on the real
`Set-Cookie` header — that a correct password alone produces no session, that a pre-auth token
reaches nothing else, and (2026-08-08) that a valid session alone cannot disable 2FA, that
disabling revokes every trusted device and clears the secret and codes, that one user cannot
disable another's, and that re-enabling issues a fresh secret and a fresh set of codes.

### Leave: every decision now notifies the employee (§7.43, 2026-08-06)

`markUnapprovedAbsence` sent **no notification at all**. It was the only one of the three
decisions that also sets `isDoubleDeduction`, so the employee found out by noticing their balance.

It now writes a `leave_unapproved_absence` notification — a new type in the enum, deliberately not
reusing `leave_approved`. The handler sets `status: "approved"` internally for bookkeeping, and
telling someone their leave was "approved" when it was in fact recorded against them at double
rate would be worse than silence. Same self-skip as approve/decline: an admin marking their own
record notifies nobody.

**The request side was already correct** and is now pinned by regression tests rather than
changed: recipients are the employee's `managerId` (when set) **plus every admin**, collected in a
`Set` so a manager who *is* an admin gets exactly one notification — which is the live situation,
since the real team is headed by the admin account. An employee with no `managerId` still reaches
admins. `notifyLeaveRequested` is `await`ed, not fire-and-forget, and `createNotification` writes
the record before any push attempt, with push failures caught per-subscription. Verified against
production: a real employee submission wrote two rows (manager + admin), both unread, and the
admin's bell returned it.

### AMC: expiring-soon across all customers (§7.42, 2026-08-06)

`GET /amc?expiringSoon=true` returns every ACTIVE record renewing within 30 days **or already
overdue**, across every customer the caller can see. It backs the renewals panel above the
Customers table.

Deliberately WIDER than the `isExpiringSoon` flag `decorateAMC` already puts on each record: that
flag excludes already-past renewal dates because it drives an amber "expiring soon" badge, and an
overdue contract is a different, worse state. The panel wants both — a contract that lapsed last
week is the most urgent row on the list. The two live side by side (`expiringSoonCondition` vs
`decorateAMC`) rather than one being bent to do both jobs. A record already marked `expired`
(which is what renewing does to the old term) is excluded from both.

**Scoping is untouched.** The filter is pushed into the same `$and` array as `?customerId=`, on
top of `resolveAMCFilter`'s ownership scope — it narrows within what the caller can already see
and can never widen it. Tests cover a sales associate seeing only their own customers' records,
another associate seeing none of them, and a role with no `amc` grant still getting 403.

**One query, not N+1.** The list `populate`s `customerId` with `companyName` and `decorateAMC`
lifts it onto `customerName`, flattening `customerId` back to a plain id so existing callers (the
Customer Detail page compares it as a string) are unaffected. The Customers list already fires a
`/customers/:id/contracts` request per row; the panel above it must not add a second N+1. The test
asserts the actual count of `customers` collection operations via Mongoose's debug hook — five
AMCs, one join — rather than merely asserting the names came back, which would pass either way.

#### Trusted devices — "remember this device" (§7.40, 2026-08-05)

A browser the user has chosen to trust skips the **second** factor for 30 days. **It never skips
the password.** `loginUser` consults the device token only *after* `bcrypt.compare` on the
password has already succeeded, so a stolen device cookie on its own reaches nothing — it turns a
two-factor login into a one-factor login for that browser, which is the whole (accepted) trade,
and never into a zero-factor one. `trustedDevice.test.js` pins this directly: a wrong password
from a fully trusted device still 401s and sets no cookie.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/trusted-devices` | session | Label + dates only. The hash is never serialised. |
| DELETE | `/auth/trusted-devices/:id` | session | Scoped to the caller's own list. |
| DELETE | `/auth/trusted-devices` | session | Revoke all, and clear this browser's cookie. |

`POST /auth/2fa/verify` additionally accepts `rememberDevice: true` — opt-in, absent by default.

**The cookie deliberately reuses `getAuthCookieOptions()` verbatim** (httpOnly, `SameSite=Lax`,
`secure` in production) rather than defining its own options. That configuration is load-bearing:
the frontend proxies `/api/*` through a Vercel Rewrite so the request is same-origin, which is
why `Lax` works and why `None` was wrong. The only difference here is `maxAge` (30 days) and the
cookie name (`smartrays_trusted_device`, distinct from the session cookie).

**Storage.** Tokens are 32 random bytes, stored **bcrypt-hashed** on `user.trustedDevices`
(`select: false`, like every other secret on the model) — a database leak yields nothing
replayable. Matching starts from the authenticated user's own document, so a token cannot be
replayed against a different account. Expired entries are pruned on every read and write, and the
list is capped at 10 with oldest-first eviction.

**All trusted devices are revoked** on: password change, 2FA re-enrolment, 2FA reset (a user's own
or an admin's reset of someone else's), and **recovery-code redemption**. That last one matters —
a redeemed recovery code means the user lost their authenticator, so continuing to honour trusted
devices would hold a door open for whoever now has it. For the same reason, ticking the box while
signing in *with a recovery code* deliberately does **not** mint a device.

`logout` does **not** clear this cookie — surviving sign-out is the entire point of the feature.

24 tests in `trustedDevice.test.js`.

### Attendance data retention (§6.5, 2026-08-05)

Attendance records and their Cloudinary photos are deleted after
`ATTENDANCE_RETENTION_DAYS` (default **45**, documented in `.env.example` alongside
`GEOFENCE_RADIUS_METERS`/`ATTENDANCE_GAP_THRESHOLD_MINUTES`).

| Method | Path | Access | Notes |
|---|---|---|---|
| POST / GET | `/attendance/cleanup` | Shared secret — **NOT** normal user auth | Body `{ batchLimit? }` (default 200). Returns the run summary. |

**Machine-only by design.** This is not an action a human performs, and putting a bulk delete
behind session auth would mean one compromised admin session could wipe attendance history. It
uses the same `x-webhook-token` pattern as the website lead intake webhook, and accepts three
equivalent credentials: that header, `?token=`, or `Authorization: Bearer <CRON_SECRET>` (what
Vercel Cron itself sends). With **neither** secret configured it returns **503**, never running
unauthenticated — an unset secret must not mean "open to everyone" on a delete endpoint.

**Registered for both POST and GET, which is a platform constraint rather than a preference.**
POST is the real interface. But Vercel Cron only ever issues a **GET** and cannot attach custom
headers, so a POST-only endpoint could never be triggered by the `crons` entry in `vercel.json`.
The job is idempotent, which is what makes a mutating GET acceptable here.

**No node-cron.** node-cron needs a long-lived process, which this backend's Vercel serverless
function is not — the three existing `src/cron/*` jobs are registered but never actually fire in
production (see the Deployment section). Scheduling is a `crons` entry in `vercel.json`, running
daily at 02:30.

#### Ordering per record — this IS the design

1. **Payroll safety guard.** Skip any record whose month has no `Payroll` document yet.
   Attendance is the input payroll is computed *from*; deleting it first would destroy the
   evidence behind a figure nobody has calculated, with no way to reconstruct it. Payroll
   existence is resolved once per month, not per record.
2. **Cloudinary assets first.**
3. **The DB row last, and only if step 2 succeeded.**

Step 3's ordering is the important one. The `publicId` needed to find a Cloudinary asset again
lives **only** on the attendance row. Deleting the row first would orphan that asset permanently
— unreachable and unbillable-to-anyone. So a failed asset deletion deliberately **leaves the
record in place** for the next run; the job is idempotent, so retrying costs nothing. One
record's failure never aborts the rest of the batch.

A record with no `photoPublicId` (older data, or photos already stripped by the separate
`cleanupOldAttendancePhotos`) simply has nothing to delete and passes through — there is no
asset left to orphan.

**Relationship to `cleanupOldAttendancePhotos`.** That older job strips photos from old records
while keeping the row. This one deletes the row entirely, so at the same threshold it supersedes
it; no special-casing is needed either way.

**Batching.** Bounded to `batchLimit` records per invocation (default 200) because serverless
functions have an execution-time limit. Running it repeatedly is both safe and the intended way
to work through a backlog.

#### Retention audit log

Every run writes one `AttendanceRetentionLog` summary — cutoff, retention days, deleted count,
the date range actually deleted, count skipped by the payroll guard, count failed, count
examined, and the batch limit. A summary is written even when nothing was deleted, so every run
is accounted for.

This exists because a hard delete with no trace is not just unrecoverable, it's
**uninvestigable** — you cannot answer "where did that record go" afterwards. It deliberately
holds **no personal data**: no employee ids, names, photo URLs or per-record detail, only counts
and a date window. A retention mechanism that quietly accumulated a shadow copy of what it
deleted would defeat its own purpose; a test asserts no identifiers leak into it.

### AMC — per-customer filter, renewal chaining, derived near-expiry (2026-08-05)

AMC moved out of its own standalone page and into the Customer Detail page, which drove three
backend additions. Existing role scoping (`amc.view`/`amc.edit` resolved through the underlying
Customer's ownership via `getVisibleCustomerIds`) is unchanged throughout.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/amc?customerId=` | `amc.view` | Optional filter narrowing to one customer. Applied as an extra `$and` clause ON TOP of the role scope, never replacing it — a caller asking for a customer outside their scope gets an empty list, not a leak. |
| POST | `/amc/:id/renew` | `amc.edit` (same gate as `PATCH /amc/:id`) | Body `{ startDate?, renewalDate?, amount? }`, all optional. **201** with the newly created record. |

**`previousAmcId`** (ObjectId → AMC, nullable) records which term a record replaced. Deliberately
a BACKWARD link: a renewal always knows what it renewed, whereas a forward `nextAmcId` would need
a write to the OLD record on every renewal — exactly the mutation this design exists to avoid.

**Renewal never mutates the old record's money or dates.** `renewAMC` creates a brand-new record
and sets *only* `status: "expired"` on the previous one. Its `amount`, `startDate` and
`renewalDate` are left verbatim, because preserving what each historical term actually cost and
covered is the whole point of chaining rather than editing dates forward in place. Defaults for
the new term, each overridable in the body:

- `startDate` = the old record's `renewalDate`, so terms abut with no gap and no overlap.
- `renewalDate` = that start date + 1 calendar year (`setFullYear`, not `+365 days` — day
  counting drifts across leap years and a Feb-29 term should renew per the calendar).
- `amount` = carried over from the old record.
- `createdFromFlow` = inherited, since that field records how the AMC relationship first began
  and a renewal doesn't rewrite that history.

**`isExpiringSoon`** is computed server-side in `decorateAMC` and returned on every AMC response:
`status === "active"` AND `renewalDate` within the next 30 days. The threshold lives in exactly
one place — the frontend renders the flag rather than re-deriving "what counts as soon", so the
two can never disagree. An already-past renewal date is NOT "expiring soon" (it's expired, and
the UI treats those differently), and neither is anything already marked `expired`.

17 new tests in `amc.test.js` cover the filter (including that it still respects scoping), the
derived flag's four boundary cases, chained renewals, overrides, and — the defining assertion —
that the old record's amount and both dates are provably unchanged after a renew.

### Teams (`/api/v1/teams`) — added 2026-07-30

See `.context/final-plan.md` §7.24 for the full design writeup, and §11.9 for the design
decision this extends. An admin-only org-structure entity — name, free-text type, and a head
manager — layered on top of the pre-existing `managerId`-based "own team" scoping used
throughout the rest of the app (Leads/Customers/Attendance/AMC). It does **not** replace that
mechanism or introduce a second one.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/teams` | `teams.manage` OR `teams.view_team` | List, each row's `memberCount` computed live via `User.countDocuments({ managerId: team.headManagerId })`. A caller holding only `view_team` sees **just the team(s) they personally head** (scoped in `listTeams`); admin/`manage` is unscoped. |
| POST | `/teams` | `teams.manage` | `name` + `headManagerId` required; `headManagerId` must resolve to a `manager` or `admin` (`user.service.js#ensureValidManagerId`, exported for this reuse). |
| GET/PATCH/DELETE | `/teams/:id` | `teams.manage` | Delete does not touch any member's `managerId` — a team's members simply become "unassigned" (`managerId` unchanged, still pointing at the deleted team's former head) unless separately reassigned. |
| GET | `/teams/:id/members` | `teams.manage` OR `teams.view_team` | Always a live `User.find({ managerId: team.headManagerId })` — never a stored/cached list. A `view_team` caller asking for a team they do not head gets **404**, not 403 — they have no legitimate way to learn that team id exists, so "not found" is both the honest answer from their vantage point and avoids confirming the id is real. |
| POST | `/teams/:id/members` | `teams.manage` | Body `{ userId }`. Implemented as `assignManager(userId, team.headManagerId)` — the exact same function `PATCH /users/:id/manager` already uses, not a parallel write path. |
| DELETE | `/teams/:id/members/:userId` | `teams.manage` | Implemented as `assignManager(userId, null)`. |

**`teams.view_team` — a read-only tier for managers (2026-08-05).** Previously every Team endpoint
was gated on the single `teams.manage` grant, which only admin holds, so a manager had no way to
see their own team's roster in the UI at all. `view_team` (granted to `manager` by default) opens
exactly the three GET routes above, scoped to the team(s) the caller heads. Every write —
create, update, delete, reassigning the head, and adding/removing members — remains `teams.manage`,
i.e. admin only.

Membership editing is deliberately **not** extended to managers. Because adding a member is
implemented as "set that user's `managerId` to this team's head", a manager holding that power
could pull an arbitrary user in the org onto their own team and thereby inherit every
`view_team`-scoped grant over that person's Leads/Customers/Attendance/Leave/AMC data. Org
structure stays admin-controlled; a manager reads it.

**Deliberately no stored `memberIds` array on `Team`** — membership is always derived from
`User.managerId`, the same field every other "own team" scope in this app already reads. Adding
a user to a Team literally sets their `managerId` to that team's `headManagerId`, so:
- A user can never be a member of two teams simultaneously — setting `managerId` to a new
  team's head is, by construction, also leaving whichever team/manager they had before.
- Every pre-existing "own team" query (Leads/Customers/Attendance/AMC) automatically includes a
  Team's members with zero changes to those modules — they were already filtering by
  `managerId`, which is all a Team membership actually is.

**`teams: ["manage"]`** in `PERMISSION_REGISTRY` — one combined tier (no separate view/create/
edit/delete), mirroring `permissions: ["manage"]`'s own shape. No default grant for any
non-admin role, matching how `permissions.manage` itself is never granted by default.

17 tests (`team.test.js`), all passing — CRUD, membership (add/remove/single-team-membership),
`headManagerId` validation, and a check that the pre-existing Leads/Customers/Attendance
own-team-scoping tests are unaffected.

**Filters + delete-preview member count (extended 2026-07-30, §7.28):** `GET /teams` gained
`type`/`isActive` query params (plain equality matches, combined with the existing query, not a
replacement of it). No new `GET /teams/:id/delete-preview` endpoint was added — the existing
`GET /teams/:id` detail response already returns the full derived `members` array, whose
`.length` the frontend already needs anyway to show a "this team has N members" warning before
a delete is confirmed; a separate endpoint would have just duplicated that. 3 new tests.

**`Team.type` converted to an admin-managed list (added 2026-07-31, §7.30) — a direct structural
mirror of `LeadSource`, but with real CRUD and validation LeadSource itself doesn't have.** New
`TeamType` model (`teamType.model.js`) — same shape as `leadSource.model.js` (`name` unique,
`isActive`), same lazy-seed-on-first-read behavior (`team.service.js#listTeamTypes`, seeding
"Sales"/"Installation"/"Technical" the first time it's ever called — including indirectly, via
`ensureValidTeamType` itself, not just via the read endpoint). **Deliberately diverges from
LeadSource in two ways, both confirmed with the user before building rather than assumed:**
LeadSource has no admin CRUD endpoints at all (read-only) and `Lead.source` is never actually
validated against it (a plain unvalidated String); this feature adds both — real
`POST`/`PATCH /team-types` endpoints and `team.service.js#ensureValidTeamType` rejecting a
`Team.type` that doesn't match an existing, active `TeamType.name`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/team-types` | Authenticated (any role) | Low-sensitivity shared config list, same reasoning as `GET /lead-sources` — any authenticated user can read it. Returns every type, active and inactive (unlike the Team form's own dropdown, which filters to active client-side) — an admin-facing management view needs to see inactive ones too. |
| POST | `/team-types` | `teams.manage` | Body `{ name }`. Rejects a duplicate name with **409** (checked explicitly, not just relying on the schema's unique-index error, matching `createUser`'s own duplicate-email handling). |
| PATCH | `/team-types/:id` | `teams.manage` | Body `{ name?, isActive? }` — either or both. Deactivating a type doesn't touch any existing `Team.type` value already set to it; it only blocks that name from passing `ensureValidTeamType` for a **new** create/update going forward. |

`Team.type` **stays a plain String on the schema** (no change to `team.model.js`'s field type) —
storing the `TeamType`'s `name` directly, the same storage shape `Lead.source` already uses for
`LeadSource.name`, not an ObjectId reference. Chosen specifically so an existing Team whose type
is later deactivated keeps displaying its type string normally, with no dangling/broken
reference to resolve. `ensureValidTeamType(type)` is the one place this rule is enforced, called
from both `createTeam` and `updateTeam` (only when `type` is actually being set) — a no-op for
an empty/undefined `type`, since the field remains optional exactly as before this change.

**Fixed 2026-08-05 — a deactivated type made its own team permanently unsavable.** `updateTeam`
re-ran `ensureValidTeamType` whenever `type` was merely *present* in the payload, not when it was
actually *changing*. The frontend's edit form always resubmits the team's current `type` alongside
whatever the user really edited, so once a type was deactivated, **every** subsequent save of a
team using it failed with `400 type must match the name of an existing, active team type` — even
a save that only changed the head manager and never touched the type at all. Reported as a "403
from a wrong `PATCH /users/:id` call"; live reproduction showed the request correctly hitting
`PATCH /teams/:id` and failing with a 400 from this validator instead. The guard is now
`payload.type !== undefined && payload.type !== team.type`, so a team is grandfathered into its
own existing value while a genuine switch to a different inactive type is still rejected. Two
regression tests in `team.test.js` cover both halves.

**No admin management UI was built on the frontend** — per this task's own explicit instruction
not to build more UI for Team Types than the equivalent LeadSource feature has, and LeadSource
has none either (it's consumed as a dropdown only). The Team Create/Edit form's `type` field
changed from a free-text `Input` to a `Select` populated from `GET /team-types` (filtered to
`isActive`), the direct frontend equivalent of how the Lead form's Source field already consumes
`useLeadSources`. See `frontend/README.md`'s Teams section for the frontend write-up.

15 new backend tests (`team.test.js`) — seeding, read access for a non-admin, create/update
admin-gating, duplicate-name rejection, missing-name rejection, and the key edge case: an
existing team keeps displaying a type value after that type is deactivated elsewhere, while a
**new** team can no longer be created with it. Two existing tests were rewritten, not just
patched around — `"accepts free-text type, not a fixed enum"` asserted the exact behavior this
task reverses, so it's now `"rejects a type that doesn't match an existing, active team type"`;
`"updates name, type, and isActive"` used made-up type strings (`"Old Type"`/`"New Type"`) that
would now be rejected, so both were changed to real seeded names (`"Sales"`/`"Installation"`).

### Attendance (`/api/v1/attendance`)

See `.context/final-plan.md` §6.5/§7.4 for the full design writeup. Started as a minimal
check-in/check-out slice (built the same day as `location`, which needed *some* `Attendance`
model to query for its shift-gating check) and extended to the full spec in a later task — the
model was extended in place, not replaced.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/attendance/check-in` | Authenticated, no module permission | Body `{ coords: {lat, lng}, photo }`. `photo` is **required** (400 if missing) — a base64 data URI (JSON body) or a multipart file field (`multer`, same as Leads' CSV import); either transport works on the same route. Creates a new `Attendance` record with `checkIn.time` set to the server clock and `date` set to today. `employeeId` always comes from the session. **409** if the employee already has an open record — one open check-in at a time. |
| POST | `/attendance/check-out` | Authenticated, no module permission | Body `{ coords: {lat, lng}, photo }`. `photo` is **required** (400 if missing). Closes the caller's own open record, runs the same connectivity-gap check a heartbeat would (covering any silence since the last one), computes `workingHours`, and auto-generates a `TravelLog` from this shift's check-in/check-out coords (§7.6, Phase 6) — never fails checkout if travel logging fails. **409** if there's no open record. |
| POST | `/attendance/heartbeat` | Authenticated, no module permission | No body. A "still alive" signal the client calls periodically while checked in — see the connectivity-gap design below. **409** with no open shift. |
| GET | `/attendance/me` | Authenticated | Own history, newest first, optional `?month=YYYY-MM` filter. Unconditional — no `attendance.*` grant needed, matching `GET /auth/me`. |
| GET | `/attendance/team` | `attendance.view_team` or `view_all` | Direct reports' records (or everyone's, with `view_all`), optional `?month=`. |
| GET | `/attendance/report` | `attendance.view_team` or `view_all` | `?from=&to=&format=pdf\|xlsx` (format defaults to `xlsx`). Same visible-employee scoping as `/team`. Streams the file directly — see below. |

**Updated (Phase 8, §7.11; Cloudinary removed 2026-08-04) — `GET /attendance/report` internally
calls the unified `report.service.js#generateReport` dispatcher (`module: "attendance"`) —
`attendance.service.js#generateAttendanceReport` itself is completely unchanged, still the
function that actually fetches and renders the data. The dispatcher used to upload the result to
Cloudinary and return `{ downloadUrl }`; as of 2026-08-04 it no longer talks to Cloudinary at
all — `generateReport` returns the raw buffer, and this endpoint streams it directly as the HTTP
response (`Content-Type`/`Content-Disposition: attachment`), the same as `GET /leads/export` and
`GET /payroll/:id/payslip` already did. See the Reports section below for the full dispatcher
design and the reasoning for the removal.

**Connectivity-gap detection — design (§6.5's own spec was intentionally terse: "if network
issue/logout during shift, ... mark red"):** `POST /attendance/heartbeat` is a **deliberately
separate concern from Location's GPS ping** (§7.4b) — not reused or coupled to it. A heartbeat
carries no coords and exists purely to prove "the session is still alive"; conflating the two
would make Location's ping cadence and Attendance's gap-sensitivity the same tunable when they
answer different questions. The server can only ever detect a gap *retroactively*, at whichever
arrives first — the next heartbeat, or checkout: if more time has passed since the last proof of
life (a prior heartbeat, or check-in itself for the first one) than
`ATTENDANCE_GAP_THRESHOLD_MINUTES` (new env var, optional, defaults to 10 — roughly two missed
heartbeats at an expected ~2–5 minute client cadence before treating it as a real issue rather
than routine jitter), the entire silent window becomes one `connectivityGaps` entry
`{ start, end }`. This needed one field beyond `attendance.model.js`'s documented shape:
`lastHeartbeatAt`, purely internal bookkeeping, never its own API concept.

**`workingHours`** — computed once at checkout: gross shift duration minus total
`connectivityGaps` duration, clamped to a minimum of 0. A gap means the employee wasn't
verifiably working during that window, so it's subtracted rather than left out of the calculation
in some other way.

**Geofencing (added later) — design.** Flags when an employee's GPS location moves beyond a
configurable radius from their check-in point during a shift, rendered red on the timeline —
deliberately mirroring connectivity-gap detection's shape rather than inventing a second pattern.

- **Geofence center: the shift's own check-in point, not a per-site/office geofence.**
  `checkIn.coords` (§6.5, already stored on every real check-in — confirmed before building this,
  not duplicated into a new field) is reused directly as the center every ping is measured
  against. A per-site geofence (a fixed office location + radius, independent of where any given
  employee actually checked in) was considered and deliberately **not** built: this system has no
  concept of "sites" or assigned office locations anywhere in its data model (Customers have a
  `siteAddress`, but employees aren't assigned to one), and smartrays.md never describes one. A
  check-in-radius geofence needs no new configuration surface at all — it answers "did this
  employee stay near where they started their shift," which is the literal, directly-supportable
  reading of "moves beyond a radius from their check-in point," not "did they stay near a
  predefined office" (a materially different feature this task didn't ask for).
- **`GEOFENCE_RADIUS_METERS`** (new env var, optional, defaults to 500) — same optional-with-a-
  sensible-default treatment as `ATTENDANCE_GAP_THRESHOLD_MINUTES`/`LOCATION_PING_INTERVAL_MINUTES`.
- **Distance: a plain Haversine formula (`src/services/geo.service.js`), not the Google Maps
  Distance Matrix API** (`googleMaps.service.js`, already used for TravelLog's driving-distance
  calculation). A per-ping radius check needs straight-line ("as the crow flies") distance, is
  called far more often than a TravelLog computation (every ~2-minute ping vs. once per shift),
  and — critically — must never fail/block just because an external API is unavailable or
  rate-limited. `geo.service.js` has no network dependency at all, so none of that risk exists.
- **Violation-window shape, live rather than retroactive.** `geofenceViolations: [{ start, end,
  maxDistanceMeters }]` on the `Attendance` model — structurally parallel to `connectivityGaps`,
  but genuinely different in one respect: a connectivity gap is always recorded as an
  already-closed interval (both `start`/`end` computed together, in one shot, at whichever
  heartbeat/checkout discovers it), whereas the ping stream that drives geofencing is live, so a
  violation can be genuinely **open** (`end: null`) between pings. `attendance.service.js#applyGeofenceCheck`
  (called from `location.service.js#submitPing` on every ping — a cross-module direct call, the
  same precedent `attendance`→`transport` already established, not a duplicated implementation)
  opens a new entry the first time a ping lands outside the radius, updates the same open entry's
  `maxDistanceMeters` (never opening a second one) on every subsequent still-outside ping, and
  closes it (`end` set) the moment a ping lands back inside. `attendance.service.js#closeOpenGeofenceViolation`
  force-closes any still-open window at checkout — "closes ... at checkout, whichever comes
  first," the same symmetry `applyConnectivityGapIfNeeded` already has with heartbeat-vs-checkout.
- **Never blocks the ping.** `applyGeofenceCheck` wraps its entire body (distance calculation,
  array mutation, and its own `.save()`) in try/catch and always resolves — the same "never block
  the primary action" principle `generateAutoTravelLog` already established for checkout. The
  `LocationPing` document itself is already created by the time this runs, so a failure here can
  never undo it or turn a successful ping into a failed response.

**Photo capture is mandatory, enforced server-side (revised after the initial build).** It was
originally left optional at the API layer, reasoning that "never a file-upload input" (§7.4) was
purely a client-side camera-widget constraint the API couldn't meaningfully enforce. That
reasoning didn't hold up: smartrays.md's entire point in capturing a photo is to prove physical
presence at check-in/check-out, and that protection doesn't actually exist if the API will
silently accept a request with no photo at all — anyone hitting the endpoint directly, or a
modified client, bypasses it entirely. `attendance.validation.js#validatePhotoPresence` now
rejects (400) any check-in/check-out with neither `req.file` nor `req.body.photo` present, for
both transports (base64 JSON and multipart). New shared `src/services/cloudinary.service.js`
uploads the photo to Cloudinary and returns only the secure URL — the binary is never stored in
MongoDB. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are now **required**
env vars (see below).

**Reused, not duplicated:** the "open record" query (`checkIn.time` set, `checkOut.time` null) is
the exact same shape `location.service.js#findOpenAttendance` already uses.

**No permission-registry entry for check-in/check-out/heartbeat** — like Location's
`POST /pings`, these are facts about your own shift, not `can()`-gated "view" actions. `/team` and
`/report` **are** gated — new `attendance.view_team`/`view_all` registry entries, no plain `view`
tier (own attendance is always reachable via `GET /attendance/me` with no gate at all, the same
reasoning as `users.*`).

**Report generation goes through a new shared service, not inline controller code:**
`src/services/report.service.js` exports `generateExcelReport({ sheetName, columns, rows })` and
`generatePdfReport({ title, subtitle, columns, rows })` (signature updated 2026-08-04 — see the
Reports section's PDF table-formatting write-up below) — generic document-building primitives
(`exceljs` for Excel, `pdfkit` for PDF). `attendance.service.js` calls these with its own column/row
shaping; the actual streaming/buffer mechanics live in the shared service. This is deliberate
groundwork for the real cross-module reports pipeline (§7.11, Phase 8) without building that
pipeline now — when §7.11 gets built properly, it has one real function per format to
formalize/extend rather than duplicated ad hoc `exceljs`/`pdfkit` calls scattered across modules.
**Not** retrofitted onto Leads' existing `.xlsx` export (`lead.service.js#exportLeadsToExcel`,
built before this service existed) — that code already works and is already tested; migrating it
wasn't part of this task and risked a regression for no behavior change.

31 tests (18 new, 13 from the original slice), all passing. No application bugs found. Cloudinary
is mocked at the module boundary (`vi.mock("../../services/cloudinary.service.js", ...)`) — no
test makes a real network call, keeping the suite fully self-contained; the gap-detection tests
backdate `lastHeartbeatAt` directly via Mongoose rather than waiting out the real threshold. The
report tests assert actual file structure, not just headers: the `.xlsx` response is re-read with
`exceljs` (same pattern as Leads' own export test) to confirm both the "PK" zip signature and that
only the manager's own team's records appear in it, and the PDF response is checked for the
`%PDF-` magic-number header — proving the streamed bytes are real, well-formed documents, not
just a response with the right `Content-Type`.

**Location Tracking is now proven end-to-end, not just against directly-seeded test data.**
`location.test.js` gained one new test that checks in via the real `POST /attendance/check-in`,
pings via the real `POST /location/pings`, checks out via the real `POST /attendance/check-out`,
then pings again and confirms the 409 — no direct Mongoose writes anywhere in that flow. The rest
of `location.test.js`'s tests still seed an open shift directly via a `createOpenAttendance()`
helper (deliberately — each one isolates a specific location scenario without an extra HTTP round
trip); this one test is what actually proves the two modules' real endpoints connect.
`location.test.js` now also mocks `src/services/cloudinary.service.js` and supplies a `photo` on
both calls in that test — a follow-up fix, since photo capture became mandatory after this test
was originally written and it would otherwise 400.

**Admin manual correction (added later — frontend Attendance module task).** Until now the only
way an `Attendance` record ever came into existence was self-service check-in/check-out — no way
for an admin to fix a broken record (e.g. a photo failed to upload, a gap was mis-detected) or
create one for a day an employee never checked in at all (e.g. marking someone `absent`/`on_leave`
after the fact). Two new admin-only endpoints:

| Method | Path | Access | Notes |
|---|---|---|---|
| PATCH | `/attendance/:id` | Admin only (`requireAdmin`) | Body `{ status?, checkIn: { time }?, checkOut: { time }? }`, all optional. Edits an existing record's `status`/check-in/check-out time. `workingHours` is recomputed via the same `computeWorkingHours` helper the real checkout flow uses (over the record's existing `connectivityGaps`, unchanged) whenever both times end up set after the edit; `null` if either is missing. Sets `isManuallyAdjusted: true`/`adjustedBy: <admin's own id>` regardless of which fields changed. **404** if the record doesn't exist. |
| POST | `/attendance/manual` | Admin only (`requireAdmin`) | Body `{ employeeId, date, status?, checkIn: { time }?, checkOut: { time }? }`. Creates a brand-new record for an employee+date that has none — no photo/geolocation required, since this is an explicit admin override, not a self-service check-in. `status` defaults to `present`. **409** if a record already exists for that employee+date (edit it via `PATCH` instead). **404** if `employeeId` doesn't resolve to a real user. |

**No new permission-registry tier for either endpoint** — `attendance: ["view_team", "view_all"]`
has no edit-tier action, and inventing one wasn't asked for. Both gate on plain `requireAdmin`,
the exact same precedent `POST /payroll/run` already established for a genuinely admin-only,
no-permission-tier action.

**Timestamp ordering — `checkOut` must be strictly after `checkIn` (2026-08-08).** Both endpoints
above accept arbitrary times, and until this nothing anywhere compared them: not
`attendance.validation.js` (which only checked `Date.parse` wasn't `NaN`), not the service, not
the model. Self-service check-out can't invert — it stamps `now` — so this only ever reached the
data through an admin correction.

It stayed invisible because `computeWorkingHours` clamps with `Math.max(0, ...)`: an inverted pair
produced `workingHours: 0`, **indistinguishable from a legitimately zero shift**. The clamp is
deliberately unchanged — a negative `workingHours` would be worse than a clamped one — so the
guard is on the input instead. Both endpoints now return **400** (`"check-out time must be after
the check-in time."`) for an inverted *or* equal pair; equal counts because a zero-length shift is
never a correction anyone means to make, and it is exactly what an off-by-one or a copy-pasted
timestamp yields.

Two details worth knowing:

- **`PATCH` compares the MERGED record, not the request body.** A patch carrying only
  `checkOut.time` is checked against the check-in already stored — the case a payload-only guard
  misses completely. It throws before `save()`, so a rejected correction writes nothing.
- **This is not a same-day rule.** An overnight shift (in 16:47, out 10:11 the next morning) is
  legitimate and passes; only ordering is asserted. Clearing `checkOut.time` still works, since
  there is then nothing to compare.

`attendance.model.js` carries a `pre("save")` backstop with the same rule, so a *future* write
path cannot reintroduce this without going through either service — which is precisely how it
went unnoticed the first time. It throws a plain `Error` with `statusCode = 400` rather than an
`ApiError`, keeping models dependency-free as they are everywhere else in this codebase;
`errorHandler.middleware.js` reads `statusCode` off any thrown value, so it still surfaces as a
400 and not a 500. It fires only when both times are present, so an open shift — the normal shape
of every record between check-in and check-out — stays saveable.

Adding the backstop caught **six existing test fixtures** (in `payroll.test.js`,
`attendanceRetention.test.js`, `attendancePhotoCleanupCron.test.js`) that seeded
`checkIn.time === checkOut.time` as a shorthand. None of them assert on the timestamps, and no
real record can have that shape, so the fixtures were corrected rather than the rule relaxed —
payroll's now derives its check-out from the `workingHours` it was already claiming, which its
equal-timestamp version had been quietly contradicting.

### `POST /attendance/mark-status` — gap-filling only (2026-08-05)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/attendance/mark-status` | `attendance.view_team` OR `view_all` (route), own-team scoping resolved per-record in the service | Body `{ employeeId, date, status }` where `status` is **`absent` or `half_day` only**. Creates a record for an employee+date that currently has **none**. Sets `isManuallyAdjusted: true` / `adjustedBy: <caller's id>`. No photo/geolocation required or accepted. Admin: any employee, any date. Manager: their own direct reports only (**403** otherwise). **409** if a record already exists for that employee+date. **404** if `employeeId` isn't a real user. **400** for any other `status`, or a missing field. |

**This is explicitly NOT a reversal of the read-only decision** that removed the Attendance
edit/delete UI. The distinction is the entire point of the endpoint:

- A day that **has** a record carries verified evidence — photo, coordinates, timestamps. This
  endpoint refuses it outright (409) and never modifies it. `PATCH /attendance/:id` remains the
  only writer for an existing record, and it is still admin-only and still unexposed in the UI.
- A day that has **no** record carries no evidence to contradict, and leaving it blank silently
  understates absences in payroll. That gap is what this fills.

So: create where nothing exists, never touch what does. `present` and `on_leave` are deliberately
excluded from `MARKABLE_STATUSES` (`attendance.model.js`) — `present` is the one claim this whole
module exists to require real check-in evidence for, and `on_leave` is owned by the Leave module's
approval flow, not set by hand here. `checkIn`/`checkOut` times are not accepted at all: a marked
day asserts no presence, so there is nothing for times to back up.

Scoping follows the same split as `leave.service.js#ensureCanActOnLeave` — route middleware
confirms the caller holds *some* attendance view grant, and
`attendance.service.js#markAttendanceStatus` resolves the actual "is this employee mine?" question
per-record, which route-level middleware cannot express.

**Audit-trail integrity (`isManuallyAdjusted`/`adjustedBy`).** The whole point of this module is
verified presence via a mandatory photo — a record either endpoint above touches must always be
visibly distinguishable from a real, photo-verified self-check-in, both in the API response (both
fields are always present in every `Attendance` document) and in the UI (calendar/list markers,
photo-viewer warning banner — see `frontend/README.md`). `isManuallyAdjusted: Boolean` (default
`false`) and `adjustedBy: ObjectId → User` (default `null`) were added to `attendance.model.js`;
every other read path (`GET /attendance/me`, `/team`, `/report`) returns them unchanged, no special
casing needed.

**Schema change: `checkIn.time` is no longer required.** A manually-created `absent`/`on_leave`
record legitimately has no real check-in event at all — synthesizing a fake timestamp for it would
undermine the very distinction `isManuallyAdjusted` exists to preserve. Relaxed from
`{ type: Date, required: true }` to `{ type: Date, default: null }`. The real self-service
check-in path (`attendance.service.js#checkIn`) is untouched and still always sets a real
timestamp — this relaxation only matters for the admin-correction path.

13 new tests (6 for `PATCH /:id`, 7 for `POST /manual`) — admin-only access enforced (403 for
non-admin on both), `workingHours` recompute (including reverting to `null` when a check-out time
is cleared), `isManuallyAdjusted`/`adjustedBy` set correctly on both paths, duplicate-record 409,
invalid-status/missing-field 400s, 404s for a nonexistent record/employee. 485/486 total backend
tests pass (the one pre-existing failure is `leave.test.js`'s date-sensitive quota-at-approval
test, unrelated to this change — confirmed via `git stash` to fail identically with none of this
task's changes applied).

### Attendance corrections/additions — Break In/Out, admin exemption, photo cleanup cron, granular manager permissions, notifications (§7.4c, 2026-07-31)

Five separate additions to the Attendance module, built together.

**1. Admin exemption.** `POST /attendance/check-in` now rejects (403, `"Admin accounts do not
track attendance"`) when the requesting user's role is `admin`. Enforced **server-side**, in
`attendance.service.js#checkIn` itself — not just by hiding the check-in widget on the frontend
(the safer of the two options this task raised, since a frontend-only exemption is trivially
bypassed by anyone hitting the endpoint directly, e.g. via curl or a modified client). `checkIn`'s
signature changed from `(employeeId, coords, photo)` to `(requestingUser, coords, photo)` to make
this check possible — the caller (`attendance.controller.js`) now passes `req.user` (already
loaded by `authenticate`) instead of just `req.user._id`; `checkOut`/`breakIn`/`breakOut` take the
same full-user shape for consistency and because they need it too (notifications, below). Since
an admin can never check in at all, they can never reach an open-shift state either, so no
separate check was needed on check-out/break-in/break-out — they're transitively blocked.

**2. Break In/Out — a single break per shift, not an array (confirmed decision).** New
`breakIn: { time, coords }` / `breakOut: { time, coords }` on `attendance.model.js`, structurally
identical to `checkIn`/`checkOut` minus `photoUrl` — **no photo required for either** (confirmed
decision), but `coords` **is** required, enforced the same way check-in's is.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/attendance/break-in` | Authenticated, no module permission | Body `{ coords }`, no photo. **409** if there's no open check-in, if already on break, or if the shift's one break has already been used (`breakIn` AND `breakOut` both already set). |
| POST | `/attendance/break-out` | Authenticated, no module permission | Body `{ coords }`. **409** if not currently on break (`breakIn` unset, or `breakOut` already set). |

**Checkout while still on break: rejects, doesn't auto-close (a deliberate choice between the two
options this task raised).** `POST /attendance/check-out` now returns **409** (`"You're still on
break — end your break before checking out."`) if `breakIn.time` is set and `breakOut.time` isn't.
Auto-closing the break silently was the alternative; rejecting was chosen because silently ending
a break the employee forgot about would hide a real state transition from them — a clear message
asking them to explicitly end it first is safer and unambiguous, matching the same reasoning this
module already uses elsewhere (e.g. why a wrong/missing photo is a hard 400, not a silent skip).

**`workingHours` now also subtracts break duration**, in addition to the existing
connectivity-gap subtraction: `computeWorkingHours(checkInTime, checkOutTime, connectivityGaps,
breakMs = 0)` gained a fourth parameter, defaulting to 0 so `createManualAttendance` (which has no
break concept at all) is unaffected. `adjustAttendance`'s own recompute call was updated to pass
the record's `breakDurationMs()` too, so an admin's manual time correction stays consistent with
every other `workingHours` derivation in the system, the same "recompute, don't drift" principle
this endpoint's docstring already established for `connectivityGaps`.

**3. 45-day Cloudinary photo cleanup cron — new `src/cron/attendancePhotoCleanupCron.js`,
mirroring `payrollCron.js`'s exact structure/registration.** Runs daily at 00:15
(`"15 0 * * *"`), calling `attendance.service.js#cleanupOldAttendancePhotos`: finds every
`Attendance` record older than 45 days (by its `date` field — the shift's own calendar day, not
`createdAt`) that still has a `photoUrl` set on `checkIn` or `checkOut`, deletes the actual
Cloudinary asset, then clears both `photoUrl` and the new `photoPublicId` field to `null` —
nothing else on the record is ever touched. Resilient by design: one record's failure (a
Cloudinary error, or an old record with no `photoPublicId` at all) is caught, logged, and counted,
never stopping the batch — the same "never block on a single failure" principle already used
elsewhere in this module (`applyGeofenceCheck`/`generateAutoTravelLog`).

- **New field needed to make deletion possible at all: `checkIn.photoPublicId` /
  `checkOut.photoPublicId`.** Checked first, not assumed: `uploadAttendancePhoto` previously
  returned only `secure_url` — Cloudinary's own asset identifier (`public_id`) was never stored
  anywhere, and `secure_url` alone can't identify an asset for `cloudinary.uploader.destroy()`.
  `uploadAttendancePhoto`'s return shape changed from a bare string to `{ secureUrl, publicId }`
  (a real, deliberate breaking change to this function's contract — both of its only two callers,
  `checkIn`/`checkOut` in `attendance.service.js`, were updated together). New
  `deleteCloudinaryAsset(publicId)` added to `cloudinary.service.js` for the cron to call.
- **`photoPublicId` is schema `select: false` on both `checkIn`/`checkOut`** — it has no
  legitimate use anywhere outside the cleanup cron, so it's excluded from every normal query by
  default (`GET /attendance/me`, `/team`, and the check-in/check-out response itself) the same way
  `User.passwordHash` already is elsewhere in this codebase. The cron explicitly re-selects it
  (`.select("+checkIn.photoPublicId +checkOut.photoPublicId")`) since it's the one place that
  legitimately needs it back.
- **A record with `photoUrl` but no `photoPublicId`** (only possible for a photo uploaded before
  this field existed) can't have its Cloudinary asset identified for deletion — best effort still
  clears the local `photoUrl` reference (so the app stops pointing at a 45-day-old photo), logs a
  warning, and moves on; the underlying asset is orphaned on Cloudinary in that one case, not
  silently ignored.

**CHECKED EXPLICITLY, as this task asked — do these crons actually run in production at all?
No. This was already a known, documented gap before this task (see this file's own Deployment
section and `server.js`'s own comment), confirmed again here rather than assumed:** `server.js`
skips registering all three crons (`payrollCron`, `leadFollowUpReminderCron`, and now this one)
whenever `process.env.VERCEL === '1'`, since `node-cron` needs a long-lived process and a Vercel
serverless function is not one. `api/index.js` — the ACTUAL Vercel entry point this backend runs
as in production — never calls any of the three `register*Cron()` functions at all, confirmed by
reading it directly; it only wraps the existing Express app with a cached DB connection. **This
means all three scheduled jobs, including this brand-new one, silently never fire in the deployed
app today.** This is not a regression introduced by this task — `payrollCron`/
`leadFollowUpReminderCron` were already in exactly this state — but adding a third cron on top of
an already-broken pattern is worth surfacing loudly rather than quietly compounding: the real fix
(Vercel Cron Jobs hitting a dedicated, authenticated endpoint instead of `node-cron` inside the
app process, or moving this backend off serverless entirely) is still outstanding. See
`docs/project-status.md`'s Outstanding Decisions for tracking.

**4. Granular manager permissions — `attendance.view_photos` / `attendance.view_location`.** Two
new actions added to `PERMISSION_REGISTRY.attendance` (now `["view_team", "view_all",
"view_photos", "view_location"]`), independent of and layered on top of `view_team`/`view_all` —
a manager who can see the team's records at all doesn't automatically see the sensitive
photo/coords fields inside them. **Default OFF for the manager role template** — no entry added
to `permission.service.js`'s `DEFAULT_ROLE_TEMPLATES`, since an absent key already means "not
granted" (`permission.helper.js#can`'s `modulePermissions[action] === true` check). Grantable
per-manager via the **existing** Individual User Overrides page — registering the keys in
`PERMISSION_REGISTRY` is all that's needed for them to show up in that already-built matrix, no
new UI required. Admin still bypasses every check unconditionally, same as always (`can()`'s own
admin short-circuit).

`getMyAttendance`/`getTeamAttendance` now run every record through `attendance.service.js#
applyVisibilityRules({ canSeePhotos, canSeeLocation })` before returning it:
- **`getTeamAttendance` (manager/admin viewing OTHERS' records):** `canSeePhotos`/`canSeeLocation`
  come from `can(requestingUser, "attendance", "view_photos"/"view_location")` — admin gets both
  automatically (the same `can()` bypass), a manager needs the specific grant for each,
  independently.
- **`getMyAttendance` (viewing YOUR OWN record) — hard rule, no override possible.** Always both
  `false`, regardless of the viewer's own role or grants — even a manager or admin who happens to
  be looking at their OWN history via this endpoint gets the same stripped shape. This is not
  permission-gated at all; it's a fixed `SELF_VIEW_VISIBILITY = { canSeePhotos: false,
  canSeeLocation: false }` constant applied unconditionally.
- **The check-in/check-out/break-in/break-out RESPONSE itself is also run through the same
  self-view stripping** — a deliberate reading of this task's own repeated wording ("employee
  NEVER sees own photo/location regardless of any permission," stated as a blanket rule, not
  scoped only to the two GET endpoints). The frontend already has both the photo and the coords
  locally at that point anyway (it just captured them to send), so nothing is lost by stripping
  them from what comes back. Existing tests that asserted the pre-existing (pre-this-task)
  behavior — the response echoing back `photoUrl`/`coords` — were updated to check the real value
  on the **persisted document** instead (`Attendance.findById(...)`), the same "assert against the
  real data, not just the response shape" pattern already established elsewhere in this suite
  (e.g. the website-intake `clientType` fix).
- **`photoPublicId` never reaches any of this** — it's schema `select: false`, so it's simply
  absent from every query result here regardless of visibility rules; nothing to strip.

**5. Notifications — check-in/break-in/break-out/check-out, reusing `createNotification`, same
pattern as Leads/Leave.** `attendance.service.js#notifyAttendanceEvent(employee, type, message,
attendanceId)` notifies three audiences, deduplicated via a `Set` (an admin who's also the
employee's manager, or an employee who's also an admin — the latter not actually reachable since
admin is blocked from checking in at all, but handled defensively anyway): the employee themselves
(a confirmation), their manager if `managerId` is set, and every admin. Four new
`NOTIFICATION_TYPES` entries: `attendance_check_in`, `attendance_break_in`,
`attendance_break_out`, `attendance_check_out` — each notification's `relatedEntity` is
`{ module: "attendance", id: <attendance record's own id> }`.

**Testing:** 65 tests total in `attendance.test.js` now (up from the prior count) — admin
exemption (403 + zero records created), the full break-in/break-out state machine (rejects with no
open shift, rejects a second break-in while already on break, rejects once the shift's one break
is used, rejects break-out when not on break, rejects checkout while on break with the exact
message, allows checkout once the break ends, workingHours correctly subtracts break duration
alongside a connectivity gap in the same shift), the self-view hard rule (own photo/coords always
null even for a manager granted both permissions for OTHER people's records), permission-gated
team visibility (all four combinations: neither grant/photos-only/location-only/both, plus
admin-always-sees-both with no grant needed), and notification delivery to employee+manager+admin
across all four event types. New `src/cron/attendancePhotoCleanupCron.test.js` (6 tests, mirroring
`payrollCron.test.js`'s own structure) — the schedule itself (`registerAttendancePhotoCleanupCron`
mocking `node-cron`), a record older than 45 days gets cleaned, a recent record is left completely
untouched, no other field on a cleaned record is touched, one record's Cloudinary failure doesn't
stop the rest of the batch from being cleaned, and a legacy record with no `photoPublicId` still
gets its `photoUrl` cleared (with a logged warning) even though the asset itself can't be deleted.
`location.test.js`/`travelLog.test.js`'s own `uploadAttendancePhoto` mocks were updated to the new
`{ secureUrl, publicId }` shape too. Full backend suite: 642/642 passing, no regressions.

### Leave (`/api/v1/leave`)

See `.context/final-plan.md` §6.5/§7.5 and §11.7 (leave cadence, resolved this task).

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/leave/request` | Authenticated, no module permission | Body `{ startDate, endDate, type?, reason, isHalfDay? }`. `reason` is now **required** (2026-07-31, §7.5c — see below). Self-service — same reasoning as Attendance check-in/out. `employeeId` is forced to the caller unless they're admin (an admin can request on behalf of someone else — needed so `mark-unapproved-absence` below has a record to act on for an employee who never self-requested). **Admin cannot request leave for themselves** (2026-07-31, §7.5c — see below), but the on-behalf-of path above still works unchanged. `type` defaults to `paid`; `unapproved_absence` is rejected here (400) — it's only ever set via the dedicated admin/manager action below. `isHalfDay` (added later) requires `startDate === endDate` (400 otherwise) — see "Half-day leave support" below. Notifies the requester's manager (if set) and every admin — see "Notifications" below. |
| GET | `/leave` | `leave.view`/`view_team`/`view_all`, per the requested `?scope=` | `?scope=own` (default), `team`, or `all` — each checked against its own matching permission action, not resolved as a union of whatever's held (unlike Location's implicit-view design; §7.5's endpoint gives the caller an explicit choice). |
| GET | `/leave/balance` | Own always reachable; `?employeeId=` reuses `view_team`/`view_all` | Added later. Returns `{ paidLeaveUsed, paidLeaveLimit: 1, paidLeaveRemaining }` for the calendar month containing today — see "Leave balance" below. |
| PATCH | `/leave/:id/approve` | Admin org-wide, or a manager on their own team (2026-07-31, §7.5c — reverses the earlier admin-only restriction, see below) | Rejects (409) if the record isn't `pending`. A `paid`-type approval is capped by the one-paid-leave-per-month quota (§11.7) — see below. Notifies the requester (`leave_approved`) unless the decider is approving their own request. |
| PATCH | `/leave/:id/decline` | Admin org-wide, or a manager on their own team (2026-07-31, §7.5c) | Added later. Body `{ reason? }`. Sets `status: "rejected"` — rejects (409) if the record isn't `pending`. Notifies the requester (`leave_declined`, includes the reason if given) unless the decider is declining their own request. See "Decline action" below for the schema decision. |
| PATCH | `/leave/:id/mark-unapproved-absence` | Admin org-wide, or a manager on their own team (2026-07-31, §7.5c) | Unconditional decree — works regardless of current status. Sets `type: "unapproved_absence"`, `isDoubleDeduction: true`, `status: "approved"`, per the 2x rule (smartrays.md). Deliberately **not** wired to the notification below — the task that added Leave notifications only asked for submit/approve/decline, and this is a distinct, retroactive action. |
| DELETE | `/leave/:id` | Admin org-wide, or a manager on their own team (2026-07-31, §7.5d) | New — see below. A hard delete, not a status change. Same `ensureCanActOnLeave` team-scoping as approve/decline/mark-unapproved-absence. |

**One paid leave per month, no carry-over (§11.7, resolved this task):** neither source document
said anything about carry-over either way — genuinely ambiguous, so this is a deliberate,
explicitly-stated assumption, not an inferred one. Enforced in `approveLeave`: a single `paid`
request spanning more than 1 day is rejected outright, and approving one is rejected if the
employee already has another **approved** `paid` leave somewhere in that same calendar month
(pending/rejected requests don't count against the quota).

**Permission design:** mirrors Location's three-tier shape (`view`/`view_team`/`view_all`)
rather than Attendance's/Users' unconditional-self-access pattern, because viewing your own leave
data — not just requesting it — genuinely is gated behind a real grant here, matching how
`GET /leave?scope=` lets the caller choose. `sales_associate`/`employee` get `leave.view: true`
by default; `manager` gets `leave.view_team: true`, plus (2026-07-31, §7.5c) `approve`, `decline`,
and `mark_unapproved_absence`, scoped to their own team — see below. Admin's access to all these
remains unconditional and org-wide via `can()`'s built-in admin bypass, unchanged. **Manager also
gets `view` (2026-07-31, §7.5d)** — previously `view_team` only, meaning a manager had no way to
see their own past requests at all — plus `delete`, same team-scoping as the other three actions.

**Half-day leave support (added later).** `Leave.isHalfDay` (Boolean, default `false`) — when
true, the request counts as **0.5 days**, not a full day, against both the monthly paid-leave
quota and Payroll's leave-day math. Every place that used to count inclusive calendar days now
goes through one shared, exported function, `leave.service.js#computeLeaveDays(leave)` — it
returns `0.5` for a half-day record, otherwise the same inclusive-day count as before. This is
reused (not duplicated) by `payroll.service.js#computePayrollFields`, which imports
`computeLeaveDays` directly rather than keeping its own separate day-counting logic — a
half-day paid leave now correctly contributes `0.5` to `paidLeaveDays`, and a half-day
unpaid/unapproved-absence leave correctly contributes `0.5` (or `1` if also double-deducted) to
`unpaidDeductionDays`. A half-day request is enforced (400) to have `startDate === endDate` at
the validation layer — a half day only ever describes a single day — compared via the UTC
calendar-date key (`toISOString().slice(0,10)`) rather than local date components, to avoid the
same local-timezone day-boundary bug class already fixed elsewhere in this codebase (Attendance,
Reports).

**Leave balance (`GET /leave/balance`, added later).** Reuses the exact quota-checking
calculation the approval flow already has — `computeLeaveDays` plus a new shared
`getApprovedPaidLeaveDaysForMonth(employeeId, referenceDate, excludeLeaveId?)` helper, called by
both `ensureWithinMonthlyPaidLeaveQuota` (with the leave being approved excluded from its own
"already used" count) and `getLeaveBalance` (without exclusion, since there's no specific request
being evaluated). Own balance needs no permission grant at all, the same "own data" precedent as
`GET /attendance/me`; `?employeeId=` for someone else reuses the exact same `leave.view_team`/
`view_all` tiers `GET /leave?scope=` already checks — a manager's `view_team` is further scoped to
their own direct reports (a `User.findOne({ _id: employeeIdParam, managerId: requestingUser._id })`
lookup), matching `scope=team`'s own `managerId` filter.

**Decline action (`PATCH /leave/:id/decline`, added later) — schema decision.** The task asked to
"add to the Leave status/type enum as appropriate," but `leave.model.js`'s `LEAVE_STATUSES` already
declared a `"rejected"` value that no endpoint had ever actually set (only `approveLeave` and
`markUnapprovedAbsence` existed, both of which only ever set `status: "approved"`). Rather than
adding a redundant `"declined"` value meaning the same thing, `declineLeave` sets the existing
`"rejected"` value — this is the first endpoint to ever use it. A new `declineReason` field (String,
nullable) was added, kept **separate** from the existing `reason` field (the requester's own reason
for taking leave) so declining a request never overwrites that original context. `approvedBy` is
reused to record which admin made the decline decision — the same treatment `markUnapprovedAbsence`
already gives that field despite its own outcome not being a literal "approval" either; this field
means "the admin who last decided this record's approval state," not strictly "approved by."

**Notifications (added later) — reuses the existing Notification module's `createNotification`,
no new infrastructure.** Three new `NOTIFICATION_TYPES`: `leave_requested`, `leave_approved`,
`leave_declined`. On `POST /leave/request`, notifies the requester's manager (via `managerId`, if
set) **and every admin** — the first place in this codebase that notifies "all admins" rather than
one specific already-known recipient (a plain `User.find({ role: "admin" })`); the requester is
never a recipient of their own submission, the same self-notify skip
`lead.service.js#notifyLeadAssignment` already established for lead reassignment. On approve/decline,
notifies the requester only (skipped if the deciding admin is the requester themselves — a
self-requested-then-self-decided edge case). Neither notification path can block its own action —
`createNotification` itself already never throws on a push failure.

56 tests, all passing (18 original + 23 for half-day/decline/balance/notifications + 15 new for
§7.5c below). No application bugs found in this task's additions.

**Manager parity on approve/decline/mark-unapproved-absence, admin exemption from requesting, and
a required `reason` field (2026-07-31, §7.5c).** This **reverses the earlier admin-only
restriction** on all three decision actions (§7.5's original "binary-admin-action" design, quoted
above in the old wording). Reasoning: managers already carry real team-scoped authority elsewhere
in this codebase (`leave.view_team`, `attendance.view_team`, `users.view_team`), and having them
unable to act on their own reports' leave — needing an admin for every approval — didn't match
that pattern and created unnecessary admin bottleneck. Three changes:

1. **Registry + endpoint changes.** `PERMISSION_REGISTRY`'s `leave` module gained `approve`,
   `decline`, `mark_unapproved_absence`; the manager `DEFAULT_ROLE_TEMPLATES` entry in
   `permission.service.js` now grants all three by default. The three routes switched from
   `requireAdmin` to `authorize("leave", "approve"/"decline"/"mark_unapproved_absence")` — admin
   keeps working automatically through `can()`'s unconditional admin bypass, zero special-casing
   needed. Route-level `authorize` only confirms the caller holds *some* grant for the action; a
   new shared service helper, `leave.service.js#ensureCanActOnLeave(leave, requestingUser)`,
   resolves the record-specific team check — admin short-circuits immediately, otherwise it loads
   the leave's `employeeId` and 403s unless that employee's `managerId` matches the requesting
   manager. This is the same "route confirms a grant, service resolves the specific record's team
   scope" split already used by `getLeaveBalance` and `getTeamAttendance`.
2. **Admin exemption from requesting (mirrors the same exemption added to Attendance).**
   `requestLeave` now 403s if the resolved `employeeId` equals the requesting admin's own id —
   "Admin accounts do not request leave for themselves — specify employeeId to request on behalf
   of an employee." Deliberately narrower than a blanket "admin role can never POST here": the
   existing admin-on-behalf-of mechanism (`payload.employeeId` honored only for admin) is the only
   way a Leave record is ever created for an employee who never self-requested, and
   `markUnapprovedAbsence` — which only *converts* an existing record, never creates one — depends
   on it entirely. The exemption is scoped to "admin acting on their own behalf," not "admin acting
   at all," so this load-bearing path is untouched.
3. **New required `reason` field.** `Leave.reason` (String) already existed but was optional;
   now `required: true`, enforced additionally at the validation layer (400 if missing/blank).
   Kept deliberately separate from `declineReason` (the approver's reason for declining, added in
   the "Decline action" entry above) — conflating the two would mean a decline overwrites the
   requester's original context, which is exactly what having two distinct fields avoids.

15 new tests: manager approve/decline/mark-unapproved-absence on their own team (succeeds), the
same three rejected when attempted outside the manager's team, a no-grant role blocked on all
three, admin unaffected (still works org-wide regardless of team), admin blocked from requesting
for themselves (both omitted-`employeeId` and explicit-own-id cases), `reason` required (400 if
missing or blank), and `reason` stored/returned correctly (checked against both the HTTP response
and a fresh `Leave.findById` read). Full backend suite re-run after these changes: 654/654 passing
across 21 test files, no regressions.

**Manager `view` grant, and `DELETE /leave/:id` (2026-07-31, §7.5d — same day, discovered while
building the frontend's role-based Leave tabs).** Two changes, prompted by the frontend needing a
manager-facing "Own" tab (their own request history) alongside "Team," and a Delete action:

1. **Manager now holds `leave.view` too, not just `view_team`.** Before this, a manager had no way
   to see their OWN past leave requests at all — `GET /leave` (scope=own) requires `leave.view`,
   which manager's default template never granted (only `sales_associate`/`employee` had it).
   `DEFAULT_ROLE_TEMPLATES.manager.leave` now includes `view: true` alongside the existing
   `view_team`/`approve`/`decline`/`mark_unapproved_absence`.
2. **`DELETE /leave/:id`, new.** `PERMISSION_REGISTRY`'s `leave` module gained `delete`; manager's
   template grants it by default. Reuses the exact same `ensureCanActOnLeave` team-scoping as
   approve/decline/mark-unapproved-absence — admin org-wide, manager on their own direct reports
   only. A real hard delete (`leave.deleteOne()`), not a status/soft-delete concept this module has
   never had.

**A real, already-seeded-database finding, not just a code change — the same "manager"
`RolePermissionTemplate` staleness §7.5c hit, hit again.** `RolePermissionTemplate` rows are lazily
seeded once and read verbatim from then on (§7.12) — this dev database's "manager" template was
already re-seeded once for §7.5c earlier the same day, and needed a second live
`PATCH /permissions/templates/manager` for this `view`/`delete` addition too, for the exact same
reason. Confirmed zero manager accounts exist in this database at the time of the fix, so no
existing manager needed an additional `POST /users/:id/permissions/reset` — every manager
registered from now on inherits the corrected template. This database backs the deployed
production API too (no separate staging DB), so the fix is already live there. **This exact
pattern — hit twice in one session — is why §7.12b's boot-time reconciliation mechanism exists**
(see the Permissions module section, above); a future permission-registry change like this one
will propagate to the live template automatically on the next server boot, no manual `PATCH`
required.

6 new tests: manager can now `GET /leave` (scope=own) for themselves; admin deletes any request
org-wide; manager deletes their own team's request; manager blocked deleting outside their team; a
no-grant role (sales_associate) blocked from deleting; 404 for a nonexistent id. Full backend
suite: 660/660 passing across 21 test files, no regressions.

### Transport/Travel (`/api/v1/travel-logs`) — Phase 6

See `.context/final-plan.md` §6.5/§7.6. **Folder name note:** the module folder is
`src/modules/transport/` (matching the single-lowercase-word convention every other module
folder uses — `auth`, `lead`, `customer`, `project`, `leave`, etc.); the files inside are named
`travelLog.*` (matching the actual model name `TravelLog`, the same relationship `customer/`'s
folder has to its `customerActivity.model.js`).

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/travel-logs` | Authenticated, no module permission (manual entry) | Body `{ originCoords?, destinationCoords?, distanceKm?, date?, employeeId? }`. Requires either `distanceKm` or both coords — there needs to be something to use or compute a distance from. If `distanceKm` is given, it's used as-is (manual entries may not always have precise coords); otherwise, if both coords are given, `distanceKm` is computed via Google Maps. Self-service by default; a manager may log on behalf of their own direct report, an admin on behalf of anyone — a **plain employee/sales_associate naming someone else's `employeeId` is rejected outright (403)**, deliberately not silently redirected to self the way Leads' `ownerId` is (see below). |
| GET | `/travel-logs` | `travelLogs.view`/`view_team`/`view_all`, per the requested `?scope=` | `?scope=own` (default)/`team`/`all`, same explicit-scope-per-permission-action pattern as `GET /leave` — not Location's implicit union. Optional `?employeeId=` narrows further within whatever the scope already permits (e.g. a manager on `scope=team` filtering to one report); ignored on `scope=own`. Optional `?month=YYYY-MM`. |
| GET | `/travel-logs/report` | `travelLogs.view_team` or `view_all` | `?from=&to=&format=pdf\|xlsx` (format defaults to `xlsx`) — same shape as `GET /attendance/report`, reusing `src/services/report.service.js`'s generic builders rather than writing new PDF/Excel generation code. Streams the file directly — see below. |
| PATCH | `/travel-logs/:id/approve` | Authenticated only — structural check, not a permission tier (added 2026-07-13) | Allowed for the target employee's own manager or admin; 403 otherwise. 409 if the log isn't currently `pending`. |
| PATCH | `/travel-logs/:id/reject` | Same as above | Same structural check and 409-if-not-pending rule. |

**Auto-generation hooks into Attendance checkout, not the other way around.** `attendance.service.js#checkOut`
calls `transport/travelLog.service.js#generateAutoTravelLog` directly (the same cross-module
direct-call pattern as `location`→`Attendance` and `lead`→`customer.service.js#createCustomer`) —
no event bus or callback mechanism, since none exists elsewhere in this codebase and introducing
one here would be an inconsistent one-off. `generateAutoTravelLog` is guaranteed to **never throw**:
missing `checkIn`/`checkOut` coords or a Google Maps failure both just mean no `TravelLog` gets
created, so checkout itself can never fail because travel logging failed. `originCoords`/
`destinationCoords` come from that shift's `checkIn.coords`/`checkOut.coords`; `distanceKm` is
computed via the new `src/services/googleMaps.service.js` (Google Maps Distance Matrix API,
`GOOGLE_MAPS_API_KEY` now a **required** env var).

**Permission design:** mirrors `leave`'s three-tier shape (`view`/`view_team`/`view_all`) for the
list endpoint (explicit `?scope=`, not an implicit union), and mirrors `attendance`'s report gate
(`view_team`/`view_all` only, no explicit scope param) for the report endpoint. `sales_associate`/
`employee` get `travelLogs.view: true` by default (their own history); `manager` gets
`travelLogs.view_team: true`.

**Updated (Phase 8, §7.11; Cloudinary removed 2026-08-04) — `GET /travel-logs/report`:** same
migration as Attendance's report endpoint — `travelLog.controller.js` calls the unified
`report.service.js#generateReport` dispatcher (`module: "transport"`) internally,
`generateTravelLogReport` itself is unchanged, and the response is streamed directly as of
2026-08-04 (no more Cloudinary upload / `{ downloadUrl }`). See the Reports section below.

**Approval workflow (added 2026-07-13, resolves §11.4) — "does travel distance feed payroll, or
is it reporting-only?": it feeds payroll, but only entries someone with authority has
explicitly approved.** Every `TravelLog` — `auto` or `manual` — is created `status: "pending"`;
neither source auto-approves. `PATCH /travel-logs/:id/approve`/`reject` are gated by a
**structural relationship check** in `travelLog.service.js` (mirrors
`resolveEmployeeIdForManualEntry`'s existing shape for manual-entry attribution, not a new
`can()` permission tier): the target employee's own manager, or admin; 403 otherwise. Re-
resolving an already-approved/rejected log is rejected (409) — there's no unwind/re-open
endpoint in v1. `approvedBy`/`approvedAt` are used generically for "who resolved this and when,"
covering both outcomes — the same naming Leave's `approvedBy` already uses even for
`mark-unapproved-absence`, which isn't a normal approval either. `payroll.service.js#runPayroll`
sums `distanceKm` only from `status: "approved"` entries for the month, never
`pending`/`rejected` ones — see the Payroll section below.

28 tests, all passing (21 from the original build + 7 new for the approve/reject flow: default-
to-`pending` for both sources, manager-approves-own-report, admin-can-reject, manager-blocked-
for-non-report, non-manager/non-admin-blocked, re-resolving an already-resolved log rejected
with 409, and a nonexistent id returning 404). `googleMaps.service.js` is mocked at the module boundary (`vi.mock`) in `travelLog.test.js`,
`attendance.test.js` (since checkout now transitively calls it), and `location.test.js` (its
end-to-end test performs a real checkout too) — no test makes a real Google Maps API call.

### Payroll (`/api/v1/payroll`) — Phase 4

See `.context/final-plan.md` §6.5/§7.7. Two prerequisites were closed first, in the same task:
`User.baseSalary` (see the User Management section above) and TravelLog's approval workflow
(see the Transport/Travel section above, §11.4 resolved).

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/payroll/run` | Admin only (`requireAdmin`, no role holds `payroll.run` but admin) | `?month=&year=` required. `?employeeId=` (a stated addition beyond §7.7's literal endpoint list) runs just that one employee; omitted, it bulk-runs every active employee with a `baseSalary` set. `?regenerate=true` overrides the "already generated" guard — see below. |
| GET | `/payroll` | `payroll.view`/`run`, per the requested `?scope=` | `?scope=own` (default) or `all` — **only two tiers, no `team`** (§7.7): Manager gets no payroll grant at all, a deliberate divergence from every other workforce module (salary data is more sensitive than attendance/leave/travel data). `?month=YYYY-MM` optional filter. |
| GET | `/payroll/:id/payslip` | Self (`payroll.view`) or broad grant (`payroll.run`) | **PDF only** (§7.7 — no `xlsx` option, unlike every other module's report endpoint). 404 (not 403) for anyone out of scope, mirroring `user.service.js#getUserById`'s exact shape. |

**Single-employee run vs. bulk run behave differently on an already-generated employee/month —
a stated judgment call, not in §7.7's literal text:** a targeted `?employeeId=` run throws
**409** unless `regenerate=true` is passed; a bulk run (the monthly cron's own call shape)
**silently skips** already-generated employees instead, so a cron that fires twice — or a
server restart on the 1st — stays idempotent rather than erroring on every employee.
`regenerate=true` overrides both the same way (recomputes and overwrites in place, same
document, not a duplicate record — enforced by a compound unique index on
`employeeId`+`month`+`year`). Employees with no `baseSalary` set (every `admin` account
included, which never has one) are skipped in a bulk run, not errored; a targeted run for such
an employee is rejected outright (400).

**`runPayroll`'s formulas, implementing §7.7 exactly:**
- `daysInMonth` — actual calendar days in that month/year.
- `presentDays` — count of `Attendance` records with status `present`/`half_day` that month.
- `paidLeaveDays` — sum of days across approved `paid` `Leave` that month (capped at 1
  in practice by `leave.service.js#approveLeave`'s own monthly quota, §11.7 — this doesn't
  re-enforce the cap, it just sums whatever's actually approved). **Since the half-day leave
  addition (see the Leave section above), this goes through `leave.service.js#computeLeaveDays`
  (imported directly, not re-derived here) rather than payroll's own former local day-counting
  function** — a half-day (`isHalfDay: true`) leave correctly contributes `0.5`.
- `unpaidDeductionDays` — approved `unpaid` `Leave` days, **plus** approved
  `unapproved_absence` days **doubled** — driven by the existing `isDoubleDeduction` flag
  already on the `Leave` model, not a duplicated type check. Same `computeLeaveDays` reuse as
  above — a half-day unpaid leave contributes `0.5`, doubled to `1` if also
  `isDoubleDeduction`.
- `workingHoursTotal` — sum of `Attendance.workingHours` for the month.
- `grossAmount` = `(baseSalary / daysInMonth) × (presentDays + paidLeaveDays)`.
- `mileageReimbursement` = sum of `distanceKm` from that employee's **`status: "approved"`**
  `TravelLog` entries that month (never `pending`/`rejected`) × `MILEAGE_RATE_PER_KM`.
- `netAmount` = `grossAmount − (unpaidDeductionDays × dailyRate) + mileageReimbursement`.
- `paidOn` = the 1st of the month **after** the payroll month.
- Leave records are attributed to the month containing their `startDate` (mirrors
  `leave.service.js`'s own monthly-quota window) — a stated v1 simplification: paid leave is
  capped at 1 day and unpaid/absence spans are short in practice, so a split-across-months day
  count wasn't worth the added complexity.

**`Payroll.mileageReimbursement`** — not in §6.5's documented field list, added the same way
Attendance's `lastHeartbeatAt` was: necessary once §11.4 resolved to "yes, it feeds payroll,"
and there's nowhere else on the model to record the resulting amount. Already folded into
`netAmount`; kept as its own field too so a payslip can show it as a separate line item.

**`MILEAGE_RATE_PER_KM`** (new env var, see below) — a deliberately simple v1: **one single
global rate, not per-role/per-project.** A stated simplification, not an oversight; the default
value is a **placeholder** the client must confirm before payroll is run for real.

**Monthly cron (`src/cron/payrollCron.js`, registered from `server.js` after the database
connects):** runs at 00:05 on the 1st of every month, bulk-running Payroll for the **previous**
calendar month — matches smartrays.md's "salary paid on the first day of every month" cadence.
Calls `payroll.service.js#runPayroll` directly, the same cross-module direct-call pattern used
elsewhere (e.g. `attendance`→`travelLog`) — there's no HTTP request to run through the
admin-gated route. `src/cron/` is a **new top-level directory**, not folded into
`src/services/` — scheduled-job orchestration is a distinct concern from the stateless
external-service wrappers that already live there (cloudinary/googleMaps/report).

**Permission design:** new `payroll: ["view", "run"]` registry entry — only two actions, not
three, since there's no `team` tier at all. `run` doubles as the "administrative access" gate
for `scope=all` on the list endpoint too, since §5's matrix never lists a separate `view_all`
for this module and only admin ever holds `run` anyway. Only `employee` defaults to
`payroll.view: true` ("own payslip only"), per §5's matrix. `manager` and `sales_associate`
both get **no** `payroll` grant at all — §5 marks `payroll.view/run` as "–" for both roles
identically, not blank for `sales_associate`. **Correction (2026-07-13):** an earlier version
of this build misread the `sales_associate` cell's "–" as unspecified/blank rather than an
explicit "no access" (the same symbol the matrix uses for every other "–" cell, including
Manager's), and granted `sales_associate` the same `payroll.view: true` default as `employee`.
Fixed in `permission.service.js`'s `INITIAL_TEMPLATE_DEFAULTS` — `sales_associate` now gets no
`payroll` key at all, matching Manager exactly, as a literal-text correction rather than a
judgment call.

19 tests (`payroll.test.js`), no application bugs found. Covers: validation (non-admin/manager
blocked from `POST /payroll/run`, missing/invalid `month`/`year`, running for an employee with no
`baseSalary`), the full formula computation against hand-computed expected values (present days,
paid/unpaid/double-deducted leave days, working hours, mileage from approved-only TravelLog
entries, gross/net amounts, `paidOn`), the 409-vs-silently-skip distinction between a targeted
re-run and a bulk re-run, `regenerate=true` recomputing in place rather than duplicating,
`scope=own`/`all` access (manager and sales_associate both blocked from `scope=all`, only admin
allowed), an employee seeing their own payslip via the default `sales_associate`/`employee`
template grant, and payslip access (self succeeds, admin succeeds for anyone, an unrelated
employee gets 404, a manager gets 404 even for their own direct report since Payroll has no
`team` tier, an unsupported `format` is rejected).

**Cron job test coverage — 6 more tests, in `src/cron/payrollCron.test.js`,** since none of the
above touches `payrollCron.js` itself: `resolvePreviousMonth` is a pure function, tested directly
(same-year case, and the January→December-of-prior-year wraparound); `registerPayrollCron` is
tested by mocking `node-cron`'s `schedule` export (`vi.spyOn`) and asserting it's called with the
exact `"5 0 1 * *"` expression — the job is never actually left scheduled against a real timer,
and no test waits for real time to pass. The job body itself was pulled out into a separately
exported `runMonthlyPayrollJob(referenceDate = new Date())`, which accepts the reference date as
a parameter specifically so tests can call it directly with a fixed date instead of faking global
`Date`/timers (which would risk destabilizing `mongodb-memory-server`/Mongoose's own internal
timer usage) — three tests seed real employees and real `baseSalary` values and confirm the job
produces the exact same `Payroll` records a manual bulk `POST /payroll/run` would (idempotent on
a second call for the same reference date, and skips — not errors on — an employee with no
`baseSalary` set).

### Monthly leave-and-attendance report — ONE shared calculator (§7.47, 2026-08-11)

`GET /payroll/monthly-report?year=&month=` → one row per active non-customer employee for that
calendar month: name, base salary, present/absent days, paid leave, unpaid leave, deduction, net
payable. Backs the Attendance page's **Report** tab.

**The endpoint computes nothing.** Every figure comes from
`src/services/salaryCalculation.service.js`, a new module deliberately placed in `services/`
rather than inside `payroll/`:

> Payroll (§7.7) computes the same figures, and its run **has never fired in production**. When
> that is fixed it must consume this service rather than keep its own copy. Two independent
> salary calculations do not fail as a red test — they fail months later as a disputed payslip
> with two numbers and no way to say which is right.

**`payroll.service.js` CONSUMES this as of §7.53 (2026-08-12).** The service is OWNED by the leave
report and consumed by Payroll, so a change to either moves both — that is the price of one
calculator, and it is cheaper than the alternative. Payroll's own arithmetic is deleted, not left
behind a flag.

| Export | Purpose |
|---|---|
| `daysInMonth(year, month)` | 1-based month, matching the API rather than JS's 0-based `Date`. |
| `perDayRate(baseSalary, year, month)` | Base salary ÷ **calendar** days. |
| `leaveYearStart(year, month)` / `leaveYearLabel(...)` | THE leave-year boundary — the one place it is defined. |
| `computeEmployeeMonth({user, attendance, leaves, year, month})` | One employee's row. Pure — no DB access, which is what makes it directly unit-testable. |
| `buildMonthlyReport({year, month})` | Fetches and delegates; two queries total, not N+1. |

**The rules, and why each is written this way:**

0. **Absence is LEAVE-SOURCED (§7.50)** — counted from approved `Leave` records only, never from
   `Attendance`. A roster-marked absence with no Leave record behind it contributes nothing and is
   not deducted: it is an attendance fact, and this is a leave report. `presentDays` is still
   computed and returned (Payroll derives gross pay from it) but no longer drives anything here,
   and `attendance` defaults to `[]` so a leave-only caller need not fetch it.

   This partially reverses the two-source reconciliation below, and **both bugs that fix addressed
   stay fixed** — structurally, not by special-casing. An unapproved absence still costs 2 days
   because its Leave record IS the absent day, and `markUnapprovedAbsence` writing no Attendance
   record cannot bite a calculation that never reads Attendance. The `on_leave`/`absent` split
   cannot diverge because the status is never consulted.
1. **Per-day rate is base salary ÷ CALENDAR days**, not working days. ₹30,000 over 31 days is
   ₹967.74/day; over ~22 working days it would be ₹1,363.64 — roughly 30% more deducted for the
   same single absence.
2. **Half days count 0.5 everywhere.** A `half_day` record is half a day present AND half a day
   absent, so it contributes to both columns and carries 0.5 into the deduction.
3. **Absence is resolved PER DATE, reconciling Attendance against Leave** — not by summing two
   independent counts. Two defects came out of this, both found in the browser against real
   data, neither reachable by the unit tests as originally written:
   - `markUnapprovedAbsence` writes **no** Attendance record (it only flips the Leave row), so an
     unapproved absence never appeared in `absentDays`. Only the surcharge landed: **1 day
     charged where the policy says 2.** Seen as a row reading "Absent 0" beside a ×2 marker.
   - Approving a full-day leave writes **`on_leave`**, not `absent` (`writeApprovedLeaveAttendance`).
     Counting only `absent` and then subtracting the 1-day paid allowance took it off a total it
     had never been part of — **1 day charged for 2 absences** whenever someone actually used
     their paid leave. `on_leave` now counts as a day away, which is the shape of the worked case
     itself: 3 absent → 1 paid + 2 unpaid.
   A date present in both lists is counted once, with the Attendance record winning: it is the
   recorded truth, and a Leave row only fills in a day nothing was recorded for.
4. **Unapproved absence deducts twice** (§7.5) — the day itself (now always counted, per above)
   plus a surcharge day. `doubleDeductionDays` returns the surcharge count alone so the UI can say
   exactly how many days were doubled. A deduction that silently disagrees with its own day count
   reads as a bug rather than a policy.
5. **An unset `baseSalary` returns `null`, never 0.** `baseSalary`/`deduction`/`netPayable` all
   come back `null` so the UI renders an em dash. "Net Payable ₹0" reads as a real figure; it
   actually means nobody recorded what that person is paid. Attendance counts still populate.
6. **The 1-day paid cap is re-applied here** (§11.7), even though `approveLeave` already enforces
   it. A report that trusted the stored data to obey the rule would silently misreport if a
   second approved day ever got in.
7. **Every active employee gets a row**, including those with no attendance that month — a
   missing row reads as "no data" when the truth is "nobody recorded anything".

**`User.baseSalary` is MONTHLY GROSS (§7.52, 2026-08-12)** — not annual, not net. `perDayRate`
divides it by the calendar days in ONE month, and `payroll.service.js` computes its own `dailyRate`
the same way, so an annual figure stored in this field produces a Net Payable roughly 12× too high
**with no error raised anywhere**: every downstream number stays internally consistent and simply
means something different from what the reader assumes.

The basis was implicit in the arithmetic and stated nowhere. It is now on the model field, on the
User form's label and helper text, and on the report's Base Salary and Net Payable column headers.
No range validation was added — a legitimate salary can be almost any figure, and a warning that
fires on real values trains people to dismiss warnings.

**Annual balance columns (§7.49, 2026-08-11).** Three derived figures per row — `oldBalance`,
`monthCredit`, `balance` — plus a `leaveYear` label. Nothing is stored and no schema changed:
all three come from year-to-date approved paid leave, so there is no balance field that can drift
away from the leave records themselves.

**This changes NO approval rule.** `PAID_LEAVE_MONTHLY_LIMIT = 1` in `leave.service.js` is still
the only thing deciding whether a request can be approved, and §11.7 still holds — one paid day
per calendar month, no carry-forward, no pot anyone can spend in bulk. Twelve is simply what
one-a-month adds up to over a year, so "Balance" answers *how much of the annual allowance is
left*, not *how many days may I take now*.

- `oldBalance` = 12 − approved paid leave taken **before** this month, same leave year
- `monthCredit` = 1, always — the entitlement accrues whether or not it is spent
- `balance` = 12 − approved paid leave taken year-to-date, including this month

**The year boundary is defined once**, as `LEAVE_YEAR_START_MONTH` + `leaveYearStart()`. It is
January today; moving the business to a financial year (April–March) is a one-line change to that
constant. `leaveYearStart` is written generally rather than special-cased to January precisely so
that stays true — with a start month of 4, March 2026 belongs to the year that began in April
2025. `leaveYearLabel` rides along on every row so the UI never re-derives a boundary of its own.

`buildMonthlyReport` now fetches **Leave for the whole leave year to date** (Attendance stays
month-scoped) — still one query per collection, widened in date range rather than in round trips.
Every month-scoped figure clips its own dates, so widening the input changed no existing number:
verified by diffing the live endpoint's response before and after, where all pre-existing fields
came back byte-identical and only the four new ones appeared.

One latent bug fell out of the widening: `isHalfDay ? 0.5 : count` returned 0.5 for a half-day
leave lying entirely OUTSIDE the requested range. Invisible while only a single month was ever
queried; wrong the moment a year-to-date window existed. `paidDaysBetween` now returns 0.5 only
when the leave actually falls inside the window.

**Gated on `payroll.run`, NOT `payroll.view` — this was a live bug the access test caught,
returning 200 with the whole company's salaries in the body.** `payroll.view` is the obvious
choice and is wrong: per §5's matrix it means *own payslip only*, and it sits in the **default
`employee` role template** (`permission.service.js`). Gating a whole-company salary report on it
would have published every salary to every employee. `run` is this module's existing
see-everyone tier — already used by `GET /payroll?scope=all`, and documented as exactly that in
`permissionRegistry.constants.js` because §5 never gave payroll a `view_all`. No new key was
invented.

Tests: `src/services/salaryCalculation.test.js` (31) covers the worked case
(30000 / 31 days / 3 absent → 1 paid, 2 unpaid, ₹1,935 deduction, ₹28,065 net), the paid cap,
half days, both per-date reconciliation cases above, the null-salary cases and
February/30/31-day divisors, plus the balance columns: prior-month usage, the January
reset, half days at 0.5, and a guard that deduction and net payable did not move.
`payroll.test.js` gained 6, including the gate above and a check that the refused response
carries no salary figure at all.

### Payroll consumes the shared calculator (§7.53, 2026-08-12)

`payroll.service.js#computePayrollFields` no longer computes anything. It fetches the inputs and
calls `salaryCalculation.service.js#computeEmployeeMonth`; what it returns is a mapping onto the
`Payroll` model's field names. **Zero payroll documents existed** — the run was registered through
`node-cron`, which does not execute on Vercel, so it has never fired — which is checked, not
assumed: `payrolls.countDocuments()` was 0 before the change. No migration, no historical data to
preserve.

**Four differences, and every one of them mispaid somebody:**

| | Before | After |
|---|---|---|
| Gross | `dailyRate × (presentDays + paidLeaveDays)` | the agreed **monthly salary** |
| Half day | counted as a whole present day (`countDocuments`) | 0.5 |
| Paid leave | uncapped sum of approved paid days | capped at 1/month (§11.7) |
| Deduction | `unpaidDeductionDays × dailyRate` | leave-sourced, §7.5 surcharge counted once |

The gross change is the one that mattered most. Building gross UP from attendance meant an employee
with **no attendance records earned nothing**, whether or not anybody had marked them absent —
missing data read as unpaid. The worked example in `payroll.test.js` moves from a net of 18,250 to
27,250 for exactly that reason: only 20 of June's 30 days had a record, and the other 10 were priced
as unworked. Gross is now the salary that was agreed, and only RECORDED absence takes anything off
it.

**`workingHours` affects no amount, and must not start to.** A shift where no heartbeat landed
computes to zero working hours — a real 17.4-hour overnight shift did exactly that — and heartbeats
stop whenever a phone locks or a tab is backgrounded. Pay is derived from DAY COUNTS.
`workingHoursTotal` is still computed and stored, marked on both the model and the calculator as
reported-only. A test gives two employees identical days and wildly different hours and asserts
every amount matches.

**Mileage is passed INTO the calculator** (`reimbursements`), not added afterwards, so every step
that produces a payable figure lives in one file. The report passes none. That is also what makes
"Payroll and the report agree" a checkable claim: a test runs payroll for an employee with no travel
logs, fetches the same month's report row, and asserts presentDays, paidLeave, chargeable days,
gross, deduction and net are all identical.

New calculator outputs for Payroll's benefit: `grossAmount`, `workingHoursTotal`, `reimbursements`.
New `Payroll` fields: `deduction`, `doubleDeductionDays` — stored rather than re-derived so a
payslip can mark the ×2 without recomputing.

### The pay run: draft → review → approved → paid (§7.54, 2026-08-12)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/payroll/period/review` | `payroll.run` | Every active employee for the period, with anomalies flagged. |
| POST | `/payroll/period/submit` | `payroll.run` | draft → review. |
| POST | `/payroll/period/approve` | `payroll.run` | review → approved. **The freeze.** Records who and when. |
| POST | `/payroll/period/paid` | `payroll.run` | approved → paid. Recording only, no disbursement. |
| POST | `/payroll/period/adjustments` | `payroll.run` | Raises a correction, payable on the NEXT run. |
| GET/POST | `/payroll/cron/run` | `Bearer CRON_SECRET` | Vercel Cron. Generates a DRAFT and nothing else. |

**APPROVAL IS THE FREEZE, and it is the most important property here.** An approved record holds its
own computed figures and no code path recomputes it: `runPayrollForEmployee` returns 409 for any
non-draft record whatever `regenerate` says, and the bulk path skips it. If a July attendance record
is edited in September, July's payslip does not move. A test approves a period, then deletes every
attendance record and adds three days of unpaid leave underneath it, and asserts presentDays,
deduction and net are all exactly what they were.

**A draft regenerates freely and has no payslip.** Its numbers are still moving; handing someone a
document that will change is worse than handing them nothing, so `GET /:id/payslip` 409s until the
period is approved. Once approved the PDF renders from the STORED figures — proven by a test that
deletes the underlying attendance and still gets a valid PDF — with the §7.5 ×2 marked where it
applies and one labelled line per adjustment.

**Corrections never mutate history.** An approved run is immutable, so a correction is a labelled
line on the NEXT run — the same discipline AMC renewal follows by creating a new record rather than
extending one in place. `PayrollAdjustment` is its own collection, not a field on the record it
corrects, for two reasons: it is raised before the target period's draft exists, and a draft is
regenerated freely, so anything embedded in one would be destroyed by the next re-run. Generation
re-collects them, which is also why a re-run does not double-count. Every adjustment carries a
reason and an actor; adjusting a period that is not yet approved is refused (409) because the right
fix there is to re-run it.

**Anomalies are FLAGGED, not blocked** — `NO_BASE_SALARY`, `NO_RECORD`, `NO_ATTENDANCE`,
`HIGH_DEDUCTION` (deduction above a third of gross), `UNAPPROVED_ABSENCE`, `HAS_ADJUSTMENT`. Every
one has a legitimate cause as well as a suspicious one: a long unpaid absence and a mistaken roster
mark produce the same high deduction, and only a human can tell them apart. Refusing to proceed
would make the common case painful to serve the rare one.

**CRON: Vercel Cron, never `node-cron`.** `node-cron` does not execute on Vercel, which is the
entire reason payroll has never fired — the job was registered and simply never ran. The endpoint
accepts GET as well as POST because Vercel Cron issues GET, and reads `CRON_SECRET` from
`process.env` at REQUEST time rather than the import-time `env` snapshot, matching
`/attendance/cleanup` exactly. It generates a DRAFT only: **a machine must not decide what people
are paid**, so approval stays an explicit human action, and a test asserts the cron cannot move an
already-approved period.

> **`CRON_SECRET` is not set in Vercel production, so this endpoint will 503 there until it is.**
> That is correct fail-closed behaviour for something that writes payroll — an unset secret must
> never mean "open to everyone" — and it is reported here rather than worked around.

**Permissions: `payroll.run` throughout.** Never `payroll.view`, which means own-payslip-only and is
in the default employee template; a parameterised test walks all five period endpoints as an
employee holding `payroll.view` and asserts 403 on each.

### `baseSalary` reaches the admin edit form, and nothing else (§7.55, 2026-08-12)

`GET /users/:id` now selects `+baseSalary` **for an admin only**. `select: false` stays on the model:
removing it would leak salary into every list, every dropdown and every user payload in the app,
which is the entire reason it is there.

**The bug it fixes:** nothing returned the field, so the admin edit form rendered an EMPTY box for a
user who has a real salary. Saving happened not to wipe it — AntD omits untouched fields from the
payload — but that is a property of the payload shape, not a guarantee. Anything that later
submitted full form state would have zeroed a real salary with no error raised anywhere.

The self branch needed the same treatment: it short-circuits to the already-loaded document, which
also lacks the field, so an admin editing their OWN record hit the identical blank box.

**Gated on being an ADMIN, not on being able to reach the record.** A manager can legitimately fetch
a team member through this endpoint; their salary is still not the manager's to see. Asserted
directly, along with: the list payload contains no `baseSalary` at all, the dropdown picker contains
none, and a non-admin fetching their own record gets none.

**Audit of every other `select: false` field on `User`** — asked for, and the answer is that
`baseSalary` was the only one with this problem. Bound to a form input: `baseSalary` alone.
`passwordHash`, `passwordResetToken`, `passwordResetExpiresAt`, `twoFactorSecretEncrypted`,
`twoFactorSecretIv`, `twoFactorRecoveryCodeHashes`, `trustedDevices` and `twoFactorFailedAttempts`
appear in no form at all — the 2FA state is driven through its own dedicated flow, which fetches
what it needs. A test asserts none of them appear in the admin fetch either.

> **The encrypted bank fields in §7.48 part two will have exactly this problem** if they are added
> to `UserFormModal` while `select: false`. They must either be returned by this same admin-only
> single-user fetch, or be edited through their own flow rather than a form that silently renders
> them blank.

### Support & Ticketing (`/api/v1/tickets`) — Phase 5

See `.context/final-plan.md` §6.6/§7.8. Two-part task: (A) Customer Portal self-signup — see
the Auth section above; (B) the `Ticket` module itself, below.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/tickets` | `tickets.create` | Body `{ subject, description, category?, customerId (internal only, required), assignedToId? (internal only, optional) }`. Internal (admin/manager): `customerId` required, must reference a real `Customer`; `category` optional (default `"other"`); `assignedToId` optional convenience for create-and-assign in one step. Portal (customer): `customerId`/`raisedByCustomerId` always derived from `req.user`, never trusted from the body; `category` is **always forced to `"other"`** regardless of what's sent — portal users are never asked to categorize. Both paths' `description` becomes the ticket's first `history[]` comment entry. |
| GET | `/tickets?scope=all\|assigned\|own` | `tickets.view_all`/`view_assigned`/`view_own`, per the requested scope | `scope=all` (admin/manager) — **everything, including portal-raised tickets** (smartrays.md: internal visibility into those is Admin/PM only). `scope=assigned` (employee) — only tickets `assignedToId` matches them. `scope=own` (customer) — only their own company's tickets. A missing `?scope=` does **not** default to "own" the way Leave/TravelLog/Payroll do — Ticket has no universal "own" tier, so it resolves to whichever tier the caller's role holds, in priority order `all` > `assigned` > `own`. |
| PATCH | `/tickets/:id/assign` | `tickets.assign` | Admin/manager only. `assignedToId` must reference a real `User` (400 otherwise). |
| PATCH | `/tickets/:id/status` | Authenticated only — structural check inside the service | Admin/manager (anyone holding `tickets.assign`), **or** the ticket's own assigned employee — nobody else, notably not the raising customer. **404** if the caller can't even view the ticket at all; **403** if they can view it (e.g. the raising customer) but aren't allowed to manage its status — a different signal from "not found". **Any status transition is allowed** (including backwards, e.g. `closed` → `open`) — §6.6/§7.8 are silent on transition rules, a stated assumption. Appends a `status_change` history entry with `fromStatus`/`toStatus`. |
| POST | `/tickets/:id/comments` | Authenticated only — "anyone with view access" inside the service | Admin/manager always; the assigned employee; the raising customer's own company. Appends a `comment` history entry. |
| POST | `/tickets/:id/attachments` | Authenticated only — same view-access gate as comments | `multipart/form-data` (field `file`) or a base64 data URI in `req.body.attachment` — same either-transport acceptance as Attendance's photo capture. Uploads via `cloudinary.service.js#uploadTicketAttachment` (new export, reuses the existing Cloudinary client/config rather than duplicating upload logic; `resource_type: "auto"` since an attachment isn't guaranteed to be an image). |

**No dedicated `GET /tickets/:id`** — deliberately not added beyond §7.8's literal endpoint
list. Every mutating endpoint above returns the full updated `Ticket` (including its current
`history[]`), the same "return the mutated record" convention already used everywhere else
(`PATCH /leave/:id/approve`, `PATCH /travel-logs/:id/approve`, etc.) — so a frontend never
actually needs a separate detail fetch.

**`Ticket.subject`** — not in §6.6's terse field list, added the same way `baseSalary`/
`lastHeartbeatAt` were: a short summary is necessary for any list view. There's no separate
`description` field either — the raiser's initial free-text explanation becomes the very first
`history[]` entry instead, since `history[]` already exists specifically to hold comments.
`attachments[]` entries are `{ url, uploadedBy, uploadedAt }`, not bare URL strings.

**Permission design:** new `tickets: ["create", "assign", "view_all", "view_assigned",
"view_own"]` registry entry, matching §5's matrix exactly — `manager` gets
create/assign/view_all (covers "PM"); `employee` gets only `view_assigned` (no `create` —
employees don't raise tickets themselves in this design); `customer` gets
`create`/`view_own` (the new `customer` `RolePermissionTemplate`, see the Auth section above);
`sales_associate` gets **nothing** — the matrix marks both ticket rows "–" for that role.

**Known deviations:** **§11.2 (category vs. lifecycle status split) resolved by this build** —
the split itself (separate `category` and `status` fields) is adopted; the exact category enum
values remain open to client confirmation if the list ever needs to grow, a narrower question
than the shape decision §11.2 was actually about. No separate "recategorize" endpoint exists yet
— `category` is set once, at creation.

35 tests, no application bugs found on the first implementation. Covers: create (internal
admin/manager raise with `customerId` required/validated, create-and-assign in one step, portal
raise auto-scoped and forced to `category: "other"` regardless of what's sent,
`sales_associate`/`employee` both blocked with 403, missing/invalid
`customerId`/`subject`/`description` rejected); list scoping (`scope=all` sees everything
including portal-raised tickets — checked separately for **both** admin and manager, since
manager's "PM" access is its own distinct grant, not admin's bypass; `scope=assigned` sees only
the caller's own assignments, not every ticket; `scope=own` sees only the caller's own company
and **explicitly cannot** see another's — tested directly with two `Customer`s from two
different companies and checked in both directions; `sales_associate` blocked entirely; a
customer requesting `scope=assigned` blocked; the role-based default-scope resolution; an
invalid scope rejected); assign (admin/manager only, a nonexistent assignee rejected,
employee/customer blocked, a nonexistent ticket 404s); status (the assigned employee can change
it with the resulting history entry showing the right `fromStatus`/`toStatus`, admin/manager can
change it without being the assignee, an unrelated employee 404s, a customer on their own ticket
gets 403 not 404, a backwards transition like `closed`→`open` is allowed and logged, an invalid
status rejected); comments (admin/manager/assigned-employee/own-company-customer can all
comment, an unrelated employee or a different company's customer both get 404, an empty comment
rejected); **history ordering** (a mixed sequence of comments and status changes — initial raise,
a comment, a status change, another comment, a final status change with an accompanying comment
— is asserted to appear in `history[]` in the exact order it happened, not just "one new entry
appeared"); and attachments (a valid upload via the mocked Cloudinary service appends the
returned URL, a request with no file is rejected). `cloudinary.service.js` is mocked at the
module boundary (`vi.mock`) — no test makes a real network call.

### Payments (`/api/v1/payments`) — Phase 7

See `.context/final-plan.md` §6.6/§7.9/§11.3. Admin-only tab — module folder is
`src/modules/payment/`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/payments` | `payments.view` | All payments, newest first. Admin-only — no ownership scoping exists for this module at all, unlike every other feature module (§5's matrix marks every other role "–"). Optional query params: `from`/`to` (`YYYY-MM-DD`, inclusive both ends — same convention Attendance/TravelLog's report generators already use, `$gte`/`$lt`-plus-one-day, not invented fresh) and `page`/`limit` — the first real server-side pagination in this backend (every other list endpoint returns its full result set and lets the frontend paginate client-side; Payments needed it since payment history only grows, added for the Payments frontend build). Response shape is `{ items, total, page, limit }`, not a bare array; omitting `limit` returns every matching row unpaginated (`limit: null`). |
| POST | `/payments` | `payments.create` | Body `{ customerId\|manualClientName, date, amount, notes, invoiceId? }`. Exactly one of `customerId`/`manualClientName` required (never both, never neither). `invoiceId` can only be provided alongside a `customerId` — see the reconciliation logic below. |

**§11.3 resolved — Payments use PARTIAL RECONCILIATION, not a fully standalone log and not full
invoicing:**
- When `customerId` **and** `invoiceId` are both given, the linked `Invoice` (validated to
  actually belong to that `customerId` — 400 if it belongs to a different customer) has its
  `balance` reduced by the payment amount. Reaching exactly 0 → `Invoice.status: "paid"`;
  anything left over → `Invoice.status: "partially_paid"` (a new value added to
  `INVOICE_STATUSES`, between `sent` and `paid` — the original 4-value enum had nothing to
  represent "some money in, balance not zero yet"). An overpayment clamps the balance to 0
  rather than going negative — a stated v1 simplification, no refund/credit tracking exists.
  Reconciling against an invoice with no `balance` set (a `draft` created without a
  `Contract.amount`) or a `cancelled` invoice is rejected (400).
- A manual-only payment (`manualClientName`, no `customerId`), or a `customerId` with no
  `invoiceId`, is just logged — **expected, not a gap**: not every payment is tied to a
  specific invoice.
- This does **not** mean full invoicing exists now — auto-numbering, recurring generation, and
  ledger views all remain out of scope; `Invoice` is still the minimal Phase 2 placeholder
  model. Only the balance/status update on an *existing* invoice, and only when a payment is
  explicitly linked to one.

16 tests, no application bugs found. Covers: access (admin-only, manager/sales_associate/
employee all blocked), standalone logging (manual client, customerId with no invoiceId — the
invoice is left untouched), validation (both/neither of customerId/manualClientName rejected,
invoiceId without customerId rejected, invalid date/non-positive amount rejected), and partial
reconciliation (a partial payment reduces balance and sets `partially_paid`, an exact payment
sets `paid`, an overpayment clamps to 0 and sets `paid`, two sequential partial payments compound
correctly, an invoiceId from a different customer is rejected, a null-balance or cancelled
invoice is rejected, a nonexistent invoiceId is rejected).

**Edit/delete audit trail (added 2026-07-30):** since these are financial records, edits and
deletes are never silent or destructive.

- **Soft delete, not hard delete** — chosen because these are financial records: the document
  is never actually removed, only excluded from normal list/total queries. `Payment` gained
  `isDeleted`/`deletedAt`/`deletedBy`/`deletionReason`. `listPayments`'s filter uses
  `isDeleted: { $ne: true }`, not `isDeleted: false` — every payment recorded before this
  change has no `isDeleted` field at all, and a strict `false` match would have silently
  excluded every one of those pre-existing rows, not just the genuinely deleted ones.
- **A separate `PaymentAuditLog` collection, not an embedded array on `Payment`** — matches
  this codebase's established pattern for an unbounded, independently-queryable history tied to
  a parent record (e.g. `LeadCall` for `Lead`). Fields: `paymentId` (not a full snapshot — safe
  because deletion is soft, so the pointed-at document always still exists), `action`
  (`"edited"`/`"deleted"`), `changedBy`, `reason` (required), `previousValues` (a snapshot of
  the payment's fields immediately before this action), and `createdAt` (via `timestamps`,
  serving as the entry's own timestamp — no separate field needed).

| Method | Path | Access | Notes |
|---|---|---|---|
| PATCH | `/payments/:id` | `payments.edit` | Body: any of `amount`/`date`/`notes`/`collectedBy`, plus a required `reason` (400 if missing/blank). `customerId`/`manualClientName`/`invoiceId` are **not** editable through this endpoint — those are the payment's reconciliation identity (§11.3), and re-pointing a payment at a different customer/invoice after the fact has knock-on effects on that invoice's balance this extension doesn't attempt. 404 if the payment doesn't exist or is already soft-deleted. Logs an `"edited"` `PaymentAuditLog` entry (capturing the pre-edit values) before returning. |
| DELETE | `/payments/:id` | `payments.delete` | Body `{ reason }` (required, 400 if missing/blank) — sent in the request body, not a query param, the same shape as the edit reason above so both "why" fields are handled identically front-to-back. Soft-deletes (see above) and logs a `"deleted"` audit entry. 404 if the payment doesn't exist or is already deleted. |
| GET | `/payments/:id/audit-log` | `payments.view` | Full edit/delete history for one payment, newest first. Deliberately **not** filtered by `isDeleted` — works for an already-deleted payment too, since the audit trail's whole point is staying inspectable after a delete. 404 only if the payment never existed at all. |

`PERMISSION_REGISTRY`'s `payments` entry grew from `["view", "create"]` to `["view", "create",
"edit", "delete"]` — kept as their own actions rather than folded into `create`, matching how
`leads`/`customers` keep edit/delete distinct from create, even though every role's grant is
identical today (admin: all four, everyone else: none).

23 new tests (edit: admin-only, requires a reason, applies the update + logs previous values,
ignores customerId/manualClientName/invoiceId, 404s for nonexistent/already-deleted; delete:
admin-only, requires a reason, soft-deletes and excludes from list/totals, logs the deleted
snapshot, 404s for nonexistent/already-deleted; audit log: admin-only, returns full history
newest-first, still works for a soft-deleted payment, 404s only for a payment that never
existed, empty array for one with no history yet). Full backend suite: 553 tests, all passing.

### AMC (`/api/v1/amc`) — Phase 7

See `.context/final-plan.md` §6.6/§7.10. Module folder is `src/modules/amc/`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/amc` | `amc.view` | "Own team" (manager) / "own" (sales_associate) scoping, resolved via the underlying `Customer.ownerId` — AMC has no `ownerId` field of its own. Admin sees everything. |
| POST | `/amc` | `amc.edit` | Body `{ flow: 'new_customer'\|'existing_customer', customerId?, newCustomerPayload?, amount?, startDate, renewalDate }`. See the two-flow creation below. |
| PATCH | `/amc/:id` | `amc.edit` | Updates `amount`/`startDate`/`renewalDate`/`status`. **404** (not 403) for an out-of-scope record, matching the Leads/Location/Customer precedent. |

**Two-flow creation (smartrays.md: "AMC ... ask which create client or convert client"):**
`flow: "new_customer"` creates a real `Customer` inline, reusing
`customer.service.js#createCustomer` directly — the same cross-module direct-call pattern
already used elsewhere (e.g. lead→customer conversion), not a duplicated creation path; its
required-field validation (`companyName`/`projectManagerId`) is reused too, via
`amc.validation.js` calling `customer.validation.js#validateCreateCustomerInput` directly
against `newCustomerPayload`. `flow: "existing_customer"` requires `customerId`, which must
reference a real `Customer` **within the requesting user's ownership scope** — a sales
associate can't create an AMC record against another sales associate's customer.

**"Manager = PM" scoping clarification:** unlike Leads/Customers (which have their own
`ownerId` field), AMC's only link to ownership is indirect, through `customerId` →
`Customer.ownerId`. New `customer.service.js#getVisibleCustomerIds(requestingUser)` export
(returns `null` for admin — meaning unrestricted — or the visible `Customer` id list
otherwise) resolves this without duplicating the ownership-scoping logic a second time.

**Known deviations:** none from the ask. No automation on renewal for v1 — `status` only
changes via an explicit `PATCH /amc/:id`; nothing watches `renewalDate` and flips it to
`"expired"` automatically. No cross-linking to `Contract`/`Invoice` either.

20 tests, no application bugs found. Covers: the `existing_customer` flow (admin/in-scope
sales_associate succeed, out-of-scope sales_associate rejected, nonexistent/missing customerId
rejected), the `new_customer` flow (creates a real Customer and links the AMC to it, missing/
incomplete newCustomerPayload rejected), validation (invalid flow, missing dates), access
(employee blocked entirely), list scoping (admin sees all, manager sees "own team" — their
direct reports' customers — sales_associate sees only "own", employee blocked), update (admin/
in-scope sales_associate succeed, out-of-scope 404s, invalid status rejected), and a dedicated
regression test confirming a record with a long-past `renewalDate` never auto-flips to
`"expired"` on its own.

### Reports (`/api/v1/reports`) — Phase 8

See `.context/final-plan.md` §7.11. Module folder is `src/modules/report/`.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/reports/generate` | Resolved per-module inside `generateReport` — no route-level gate, no new `reports.generate` permission | Body `{ module, filters?, format? }`. `module` is one of `attendance`/`leave`/`payroll`/`transport`/`leads`/`customers` (exactly the six §7.11 names). `format` defaults to `xlsx`. Streams the generated file directly as the response (`Content-Type` + `Content-Disposition: attachment`) — see the Cloudinary-removal note below. |

**Dispatcher design (`report.service.js`):** a small internal `module → { canAccess, generateBuffer }` map:
- **`attendance`/`transport`** already had a combined fetch-and-render function from their own
  earlier builds (`generateAttendanceReport`/`generateTravelLogReport`) — the dispatcher calls
  those **directly, unmodified**, rather than splitting them apart or duplicating their
  column/row shaping.
- **`leave`/`payroll`/`leads`/`customers`** had no existing report-rendering code, only a scoped
  list/query function (`listLeaves`/`listPayroll`/`listLeads`/`listCustomers`). The dispatcher
  calls those **unmodified** to fetch data, then does its own **new** column/row shaping via the
  existing shared `generateExcelReport`/`generatePdfReport` primitives — this rendering code is
  new to this task and lives entirely in `report.service.js`, not inside each source module.
  Owner/employee names are populated after the fact (`Model.populate(records, ...)`) without
  touching the list functions themselves.

**No new `reports.generate` permission — access is gated per-module by reusing `can()`** against
that module's own existing actions:
```
attendance: view_team OR view_all        transport: view_team OR view_all (travelLogs)
leave:      view OR view_team OR view_all payroll:   view
leads:      view                          customers: view
```
This `canAccess` check is deliberately **coarse** — "can this role attempt a report from this
module at all" — not the full scope resolution. The module's own data-fetcher (still called by
the dispatcher) resolves the actual scope and may itself reject a *broader* one than the caller
holds — e.g. `listPayroll` still 403s a `scope=all` request from someone who only has
`payroll.view`, not `payroll.run`. **Scoping is never re-implemented**: the dispatcher fetches
data *as the requesting user*, through each module's existing scoped function — the exact same
one that module's own list/report endpoint already uses. A manager requesting an `attendance`
report gets exactly their team's data, proven in `report.test.js` by asserting the dispatcher's
report contains the exact same employee set `GET /attendance/team` independently returns.

`GET /attendance/report` and `GET /travel-logs/report` internally call this same dispatcher
instead of duplicating report generation — see the Attendance/Transport sections above.

**Cloudinary removed from the dispatcher (2026-08-04).** Through Phase 8, `generateReport`
uploaded the generated buffer to Cloudinary and returned `{ downloadUrl }`, and every one of the
three callers above (`POST /reports/generate`, `GET /attendance/report`,
`GET /travel-logs/report`) returned that JSON shape. This depended on Cloudinary being reachable
and fast for every single report download, added an external-service failure mode with no upside
(the file never needed to leave this server — it's generated here and requested by an
already-authenticated caller of this same API), and meant a slow/unavailable Cloudinary made
report downloads fail even though nothing about the report itself was wrong. `generateReport` now
returns the raw buffer directly; each of the three controllers sets
`Content-Type`/`Content-Disposition: attachment` and calls `res.send(buffer)` — the same
direct-stream shape `GET /leads/export` and `GET /payroll/:id/payslip` already used (see
"Explicitly out of scope" below for why those two were never part of the Cloudinary-upload
dispatcher to begin with). `uploadReportFile` (the now-dead Cloudinary wrapper function) was
deleted from `cloudinary.service.js` rather than left unused.

**Explicitly out of scope:** `GET /payroll/:id/payslip` was **not** migrated onto the dispatcher
and stays exactly as it was (a direct PDF stream, never routed through `generateReport` or
Cloudinary at any point) — it's a single-document artifact, not a filtered-list report, so it
doesn't fit the dispatcher pattern. A dedicated regression test in `payroll.test.js` confirms
this still streams `application/pdf` directly. Leads' `GET /leads/export` also stays exactly as-is
— a deliberately separate, pre-existing CSV/Excel export (also always a direct stream, never
Cloudinary); the `leads` module report inside the dispatcher is additive (reuses `listLeads`, not
`exportLeadsToExcel`), not a replacement. The 2026-08-04 Cloudinary removal above didn't touch
either of these two endpoints — they had nothing to remove.

**Per-module `filters` validation (`report.validation.js`) reuses each target module's own
existing query validator** rather than duplicating its checks — called as a plain function
against a `{ query: filters }` stand-in, the same pattern `amc.validation.js` already uses for
`customer.validation.js#validateCreateCustomerInput`:
```
attendance/transport: validateReportQuery  (date-range checks: from/to must parse, from ≤ to)
leave:                 validateScopeQuery   (scope must be own/team/all)
payroll:               validateListQuery    (scope must be own/all — no team tier; month format)
leads/customers:       no dedicated query validator exists for either today (their list
                       endpoints run unvalidated) — `status`, if given, is checked directly
                       against LEAD_STATUSES/CUSTOMER_STATUSES, the same enum source their
                       body validators already import, instead of a new hardcoded list.
```

18 tests, no application bugs found. Covers: validation (missing/invalid `module`, invalid
`format`, non-object `filters`, unauthenticated request), `attendance` (a manager's report
matches `GET /attendance/team`'s exact employee set; a `sales_associate` blocked), `transport`
(same team-scoping proof; blocked role), `leave` (an employee's own report succeeds; a
`sales_associate` requesting `scope=team` still 403s via the reused `listLeaves` check), `payroll`
(an employee's own report succeeds with the right values in the rendered `.xlsx`; a manager is
blocked entirely — Payroll has no manager grant at all), `leads` (a `sales_associate`'s report
contains only their own leads, matching `listLeads`' ownership rule; an employee blocked),
and `customers` (a manager's report contains only their team's customers, matching
`listCustomers`' ownership rule; an employee blocked; a PDF format request). `cloudinary.service.js`
is still mocked at the module boundary (other routes on the same app instance need it), and every
report test now explicitly asserts none of its functions were called — proving the dispatcher
genuinely never talks to Cloudinary, not just that it doesn't return a `downloadUrl`.

#### PDF report formatting + a real "Unknown" employee-name bug — fixed 2026-08-04

**Diagnosis first, per the task's own instruction — the actual cause, not either of the two
hypothesized ones exactly:**
- **Not a broken separate name lookup.** Every report builder (Attendance, Transport, Leave,
  Payroll, Leads, Customers) resolves the employee/owner name via the exact same
  `Model.populate(records, { path: "employeeId"/"ownerId", select: "name" })` pattern used
  everywhere else in this codebase — there's no second, parallel lookup mechanism to be broken.
- **It IS a genuinely unresolvable reference — by design, not a data bug.**
  `user.service.js#hardDeleteUser`'s own docblock states it explicitly: hard-deleting a user
  **deliberately does NOT cascade-delete or fix up that user's id anywhere else** (`Lead.ownerId`,
  `Attendance.employeeId`, `Leave.employeeId`, `Payroll.employeeId`, etc.) — every consumer
  already tolerates an unresolvable reference by falling back gracefully rather than crashing, so
  there's nothing to fix up at the database level. `populate()` sets the field to `null` when the
  referenced document no longer exists; `record.employeeId?.name` then reads `undefined`, and the
  `|| "Unknown"` fallback fires. **The fix, per the task's own suggested alternative:** every
  report builder's fallback changed from `"Unknown"` to **`"[Deleted User]"`** — `"Unknown"` reads
  like something went wrong generating the report; `"[Deleted User]"` correctly communicates that
  this was a deliberate, audited deletion (see `DeletedUserAuditLog` — the full record still
  exists there, just not attached to this Leave/Attendance/Payroll/etc. record anymore). A
  dedicated regression test in `report.test.js` creates a throwaway employee, gives them a Leave
  record, deletes the `User` document (reproducing the exact post-hard-delete state), and asserts
  the generated report contains `"[Deleted User]"` and never `"Unknown"`.

**PDF table formatting — `generatePdfReport` redesigned, affecting every module that shares it,
not just Leave.** Before this fix, `generatePdfReport({ title, rows, formatRow })` rendered a
centered title followed by one plain pipe-delimited text line per row — checking every caller
confirmed this affected **all six §7.11 dispatcher modules' PDF output** (Attendance, Transport,
Leave, Payroll, Leads, Customers) plus Payroll's separate single-record `generatePayslipPdf`
(§7.7) — the exact same generic function, not something Leave-specific. Redesigned to
`generatePdfReport({ title, subtitle, columns, rows })` (`src/services/report.service.js`),
now drawing a real table with `pdfkit`'s drawing primitives (no table library — `pdfkit` has no
built-in table support, and this project's own existing "simple enough not to need a dependency"
precedent already applies):
- **Header row**: bold white text on a filled navy background (`#163b78`, the same brand-navy
  seed color `App.jsx`'s AntD `ConfigProvider` uses) — a real, immediately visible header, not
  just the first data row.
- **`columns: [{ header, key, width }]`** — `width` is a **relative weight** (e.g. `2` renders
  twice as wide as `1`), not an absolute point or character measurement; actual point widths are
  computed by proportionally distributing the page's usable width, so a caller never has to
  hand-tune measurements or account for page size.
- **Alternating row shading** — a subtle light gray (`#f3f4f6`) on every other row — plus a thin
  border around each row (`#d9dce1`), for readability on longer reports.
- **Cell value formatting is centralized**, not re-implemented per caller: a `Date` renders as a
  locale date (`format: "time"` on a column definition instead renders `HH:MM`, for a field like
  Attendance's Check-In/Check-Out where the time-of-day is what matters); a `boolean` renders as
  `Yes`/`No`; a non-integer `number` renders to 2 decimals; `null`/empty renders as `-`.
- **Title + subtitle** — the title stays prominent (18pt bold, centered); a new optional
  `subtitle` (10pt, muted gray, centered) surfaces the report's active filters — the date range
  for Attendance/Transport, the scope for Leave, scope+month for Payroll, the status filter for
  Leads/Customers — directly under the title, addressing the task's own "if not already shown"
  ask (it wasn't).
- **Pagination**: a hand-rolled page-break check (no `pdfkit` table/pagination plugin) — once the
  next row wouldn't fit above the bottom margin, a new page starts and the header row redraws.
  Verified against a 32-row sample report spanning two pages.
- **One row-mapping function per module now, not two.** Previously each module had a separate
  row-shaping function for `.xlsx` (typed values for `exceljs`) and a separate, independently
  re-derived text line for `.pdf` (`formatRow`) — this is *why* the "Unknown" bug existed in two
  places per module instead of one. Each module now has a single `build*Rows(records)` function
  producing typed values (`Date`, `number`, `boolean`, real employee-name strings) that feeds
  **both** `generateExcelReport` and `generatePdfReport` — `generatePdfReport` itself now owns
  all PDF-specific display formatting (via `formatCellValue` above), so there's no display logic
  left to duplicate or drift between the two formats.
- **Payroll's single-record payslip** (`generatePayslipPdf`, §7.7 — explicitly outside the §7.11
  dispatcher, unaffected by any of the above architecture) also called this same shared function
  with the old `formatRow` signature, so it needed a matching migration: rendered as a two-column
  Field/Value table (11 rows: Employee, Period, Days in month, Present days, ..., Paid on) — the
  natural fit for a single-record document under the same table primitive, rather than a
  special-cased text layout kept alongside the new table code.

**Verified with real generated PDFs, not just code review** (per the task's own instruction) — a
32-row Leave report and a 2-row Attendance report were generated directly via `generatePdfReport`
and rendered to PNG for visual inspection: real navy header row, alternating row shading, correct
date/time formatting (`09:03 am`, not an ISO timestamp), `"[Deleted User]"` rendering correctly
where `"Unknown"` used to, and the page-2 continuation redrawing the header row correctly.

No test assertions needed to change beyond the one new regression test above — every existing
report test already verified PDF output via the `%PDF-`/`PK` magic-number check on the actual
response body (not via inspecting `formatRow`'s text output), so those assertions remained valid
against the new table-rendering code unchanged. Full backend suite: **668/668 passing.**

#### Reports exclude deleted/deactivated employees' records — export-only filter, 2026-08-04

Every §7.11 dispatcher module's report/export (Attendance, Transport, Leave, Payroll, Leads,
Customers) now **excludes** rows whose referenced employee/owner no longer exists (a
hard-deleted `User`) or is currently deactivated (`isActive: false`) — a **report/export-only**
filter, not a data or deletion change. This is deliberately the opposite direction from the
2026-08-04 PDF fix above: that fix made a deleted user's row *visible* in the report (labeled
`"[Deleted User]"` instead of `"Unknown"`); this task makes that same row *absent* from the
report entirely. Both are real, correct behavior for their own scope — the PDF fix's
`"[Deleted User]"` label lives on in the row-building code as a defensive fallback (still
correct if `populate()` ever failed to resolve a reference for some other reason), but in
practice a report never reaches that fallback anymore, since this new filter removes any such
row before the row-building step runs at all.

**`excludeInactiveOrDeletedRefs(records, refField)`** (`src/services/report.service.js`) — the
one shared filter every module calls: `records.filter((record) => record[refField] != null &&
record[refField].isActive !== false)`. Requires the populate call selecting that field to also
select `isActive` (in addition to whatever else, e.g. `name`) — without it, `ref.isActive` reads
`undefined` and the `!== false` check would (correctly, but for the wrong reason) treat it as
active. Applied right after each module's own `populate()` call and right before its
`build*Rows`/`buildXlsxReport`/`buildPdfReport` row-shaping — so the exclusion happens exactly
once per module, at the same point every module already resolves the employee/owner name:

```
attendance/transport: their own generateAttendanceReport/generateTravelLogReport
                       (attendance.service.js/travelLog.service.js)
leave/payroll/leads/customers: report.service.js's MODULE_HANDLERS.<module>.generateBuffer
```

**Explicitly does NOT touch:**
- **Deletion/cascade logic** — `user.service.js#hardDeleteUser` is completely unmodified; this
  task didn't need to touch it, since it already deliberately leaves other records' references
  unresolved (see that function's own docblock, and the PDF fix's write-up above).
- **The underlying records** — nothing is deleted, modified, or fixed up. A deactivated/deleted
  employee's Leave/Attendance/Payroll/etc. history remains in the database exactly as it was,
  forever — it's just omitted from this one generated file, computed fresh on every request.
- **Any other view** — the list/detail endpoints each module already had (`GET /leave`,
  `GET /attendance/team`, `GET /payroll`, `GET /leads`, `GET /customers`,
  `GET /travel-logs`) call the exact same `listLeaves`/`getTeamAttendance`/`listPayroll`/
  `listLeads`/`listCustomers`/`listTravelLogs` functions they always did — none of those
  functions were touched, so every one of those views keeps showing a deleted/deactivated
  employee's records exactly as before (whatever fallback label the frontend already used for
  an unresolvable name — this task didn't change that either).

**Testing:** one dedicated regression test per affected module (7 total, across
`report.test.js`/`attendance.test.js`/`travelLog.test.js`) — each creates a record for a
throwaway employee, deletes or deactivates that `User`, generates the report, and asserts the
row is **absent** (not relabeled) while an unrelated active employee's row is unaffected, then
independently confirms via `Model.findById` that the underlying record still exists untouched.
Leave's test additionally calls `GET /leave?scope=all` directly and confirms the same record
**is** still returned there — the most direct possible proof that this is an export-only filter,
not a change to what the app considers that employee's history. Full backend suite:
**674/674 passing**, no regressions.


See `.context/final-plan.md` §7.23. Same module folder (`src/modules/report/`), new sibling
files `analytics.service.js`/`analytics.controller.js` — `report.service.js`/`report.controller.js`
(the dispatcher documented above) are untouched. Routes still register inside the existing
`report.routes.js`, so `/reports/*` stays one routing entry point.

**These are the first MongoDB aggregation pipelines (`$group`/`$match`) anywhere in this
backend** — confirmed via a full grep before writing any; every prior "report" was a
`.find()`-scoped list rendered to PDF/Excel in JS, never an aggregation.

| Method | Path | Permission | Response |
|---|---|---|---|
| GET | `/reports/analytics/leads-pipeline` | `leads.view` | `[{status, count}]`, scoped like Leads' own list (admin org-wide / manager team / owner own). |
| GET | `/reports/analytics/leads-conversion?from=&to=` | `leads.view` | `[{month, totalLeads, wonLeads, conversionRate}]`, grouped by `createdAt` month (no separate "won at" timestamp exists on `Lead`). |
| GET | `/reports/analytics/leads-by-source` | `leads.view` | `[{source, count}]`. |
| GET | `/reports/analytics/leads-by-client-type` | `leads.view` | `[{clientType, count}]`. |
| GET | `/reports/analytics/customers-growth?from=&to=` | `customers.view` | `[{month, newCustomers}]`, grouped by `signedUpAt` month, scoped like Customers' own list. |
| GET | `/reports/analytics/customers-status-split` | `customers.view` | `{active, inactive}` — always both keys, `0` rather than omitted when there's no data of that status. |
| GET | `/reports/analytics/customers-contract-value` | `customers.view` | `[{type, totalValue, count}]`, summed from `Contract` (which has no `ownerId` of its own — scoped via the underlying Customer's ownership, same reasoning AMC's own scoping already uses). |
| GET | `/reports/analytics/payments-trend?from=&to=` | `payments.view` | `[{month, totalAmount}]` — admin-only, no team/own tier (matches Payments' own grant, §5). |
| GET | `/reports/analytics/amc-renewals-upcoming?days=30` | `amc.view` | `{count, renewals: [{customerId, customerName, renewalDate, amount}]}` — a scoped/sorted `find`+`populate`, not an aggregation (no grouping need). `days` defaults to 30. |
| GET | `/reports/analytics/attendance-trend?from=&to=` | `attendance.view_team` or `view_all` | `[{month, attendanceRate}]` — `present` counts as 1, `half_day` as 0.5, `absent`/`on_leave` as 0; scoped exactly like `GET /attendance/team`. |
| GET | `/reports/analytics/payroll-cost-trend?from=&to=` | admin only (`requireAdmin`) | `[{month, totalCost}]`, summed `netAmount` — mirrors `POST /payroll/run`'s existing gate (Payroll has no team tier at all, §5). |

**Scoping is reused, never re-derived.** Three previously-private helpers were exported
(additive only — no behavior change to their existing callers) specifically for this task:
`lead.service.js#resolveOwnershipFilter`, `customer.service.js#resolveOwnershipFilter`, and
`attendance.service.js#resolveDirectReportIds`. `customer.service.js#getVisibleCustomerIds` was
already exported (AMC already reuses it) and is reused again here for Contract-value and AMC
scoping. `attendance-trend`'s org-wide/team branch reuses `can(user, "attendance", "view_all")`,
exactly mirroring `getTeamAttendance`'s own inline check.

`from`/`to` are `YYYY-MM-DD` throughout — the same `$gte`/`$lt`-plus-one-day convention
Attendance/TravelLog/Payments already use, not a new date-range shape. Payroll's `month`/`year`
are separate Number fields (not a Date), so its `from`/`to` are converted to a single comparable
"month index" (`year*12 + zero-based month`) for the `$match`'s `$expr`, rather than inventing a
second date-range convention just for this one endpoint.

40 tests (`analytics.test.js`), no application bugs found. Covers, per endpoint group: correct
aggregation against seeded fixtures, scoping (admin vs. manager vs. a narrower role — reusing
the same multi-agent fixture pattern every other module's scoping tests already use, including
an unaffiliated `sales3` deliberately left off the manager's team), date-range filtering where
applicable, and an empty-data case returning a sensible empty result (`[]`, `{active:0,
inactive:0}`, or `{count:0, renewals:[]}`) rather than an error. One fixture bug found and fixed
during this task (not a bug in the endpoints): `$dateToString` formats in UTC by default, so a
test date built as local midnight (`new Date(2026, 6, 1)`) on a host timezone ahead of UTC
silently shifted into the previous UTC day/month, merging it into the wrong month's group —
fixed by constructing month-boundary-sensitive fixtures via `Date.UTC(...)` explicitly;
production is unaffected since the server clock itself is UTC.

### Customers (`/api/v1/customers`) — Phase 2

See `.context/final-plan.md` §6.3/§7.2 for the full design writeup, and
`leads-customer-functional-spec.md`'s CUSTOMER MODULE section for the UX/data reference this was
built against (Next.js/Supabase stack ignored, data model and automation chain reused).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/customers` | `customers.view` | Scoped identically to Leads: admin sees all, a manager sees their direct reports' customers, everyone else sees only their own. Filters: `search`, `status`, `owner`. |
| POST | `/customers` | `customers.create` | `projectManagerId` required (400 if missing) — no role restriction on it, unlike `User.managerId`. `sales_associate` always gets `ownerId` forced to themselves. |
| GET | `/customers/:id` | `customers.view` | 404 (not 403) for an out-of-scope customer. |
| PATCH | `/customers/:id` | `customers.edit` | `sales_associate` cannot reassign `ownerId`. Setting `customerStatus` to `inactive` triggers the deactivation cascade (below). |
| DELETE | `/customers/:id` | `customers.delete` | No cascading delete of contacts/contracts/credentials — same precedent as `deleteLead` not cascading `LeadCall`. |
| POST | `/customers/bulk` | Checked inside the service, not the route | Body `{ ids, action: activate\|deactivate\|delete }`. `activate`/`deactivate` need `customers.edit`; `delete` needs `customers.delete` — the permission check happens in `bulkUpdateCustomers` itself since one route can't express "which permission" ahead of a mixed-action-type body. Reuses `updateCustomer`/`deleteCustomer` per id, so scoping and the cascade both apply per-item automatically. Registered before `/:id` so Express doesn't treat "bulk" as an id. |
| GET/POST/PATCH/DELETE | `/customers/:id/contacts(/:contactId)` | `customers.view`/`customers.edit` | Plain sub-resource CRUD. |
| GET/POST/PATCH/DELETE | `/customers/:id/contracts(/:contractId)` | `customers.view`/`customers.edit` | POST/DELETE trigger the contract automation below. |
| GET/POST/PATCH/DELETE | `/customers/:id/credentials(/:credId)` | `customers.view or edit` **+ `credentials.view`** | Two `authorize()` calls chained in series (an AND gate — each just calls `next()` if permitted). |
| POST | `/customers/:id/credentials/:credId/reveal` | `customers.view` + `credentials.view` | The only place plaintext ever leaves the service layer. Writes a `credential_revealed` activity log entry every time. |
| GET | `/customers/:id/activity` | `customers.view` | Simple timeline: `created`, `edited`, `deactivated`, `reactivated`, `contract_added`, `contract_removed`, `credential_revealed`. |

**Deliberately not built in this task:** `GET /customers/:id/invoices` and `GET /customers/:id/ledger`
— both depend on real invoicing (numbering, ledger balances, payment tracking), which is Phase 7.
`Invoice` exists only as a **minimal placeholder model** (customerId, contractId, number, type,
amount, balance, status, issuedAt) so the contract automation below has somewhere real to write a
draft record — the exact same treatment `Attendance` got for Location Tracking (§7.4b).

**Contract automation (§6.3/§6.4, leads-customer-functional-spec.md):**
- Adding a `monthly` contract auto-creates a `recurring`-type `Project` + a draft `Invoice`.
- Adding a `onetime` contract auto-creates a `onetime`-type `Project` + a draft `Invoice`.
- Adding a `yearly` contract triggers **no automation** — neither source document describes one,
  so this is a deliberate no-op, not an oversight.
- Deleting a contract completes its linked `Project` (`status: "completed"`) and cancels any of
  its linked `Invoice`s that aren't already `paid`/`cancelled`. The reference spec's "pauses
  recurring profile" has no literal analog here (there's no separate RecurringProfile model in
  this build), so it maps onto completing the Project + cancelling the Invoice instead.

**Deactivation cascade:** setting `customerStatus` to `inactive` (via `PATCH /customers/:id` or
the bulk `deactivate` action — both funnel through the same `updateCustomer`) completes every
currently-`active` `Project` for that customer. Only fires on the active→inactive transition, not
on every save of an already-inactive customer.

**Credentials vault encryption (§6.3/§11.8, resolved 2026-07-13):** AES-256-GCM via a new shared
`src/services/credentialEncryption.service.js` — a fresh random IV per record
(`Credential.passwordIv`), the key from `CREDENTIALS_ENCRYPTION_KEY` (now a **required** env var,
see below). The GCM auth tag is appended to the ciphertext and stored in `passwordEncrypted`
rather than given its own DB field, keeping the schema exactly as documented in §6.3 (no
undocumented third field). `passwordEncrypted`/`passwordIv` are `select: false` on the schema —
the same defense-in-depth pattern as `User.passwordHash` — so a plain `.find()`/`.findOne()`
never returns them; only `revealCredential` explicitly re-selects them to decrypt.

**Lead conversion is wired up for real now** — see the Leads section above. `lead.service.js`
imports `customer.service.js#createCustomer` directly (the same cross-module pattern as
`location` importing the `Attendance` model) rather than duplicating creation logic.

**`getVisibleCustomerIds(requestingUser)` (added, §7.10 AMC prerequisite)** — exposes this
module's existing ownership-scoping logic (the same one `GET /customers` already uses) as a
reusable Customer-id list, returning `null` for admin (unrestricted) or the visible id list
otherwise. Used by `amc.service.js` to scope AMC records via their underlying Customer's
ownership, since AMC has no `ownerId` field of its own — see the AMC section above.

21 tests, no application bugs found. Two test-authoring issues were caught and fixed while
writing the suite (not app bugs): `validateContactInput` was wrongly reused for `PATCH .../contacts/:contactId`,
rejecting a partial update with "name is required" even though name wasn't being changed — fixed
with a dedicated `validateContactUpdateInput` that only checks name if it's present. And the bulk
delete-permission test needed a user whose `customers.delete` grant was explicitly narrowed away,
since both `manager` and `sales_associate` hold full `customers` CRUD by default (matching Leads'
own precedent) — no role lacks `delete` while still holding other customer permissions.

### Projects (`/api/v1/projects`) — Phase 2

See `.context/final-plan.md` §6.4/§7.3. **There is no `POST /projects` endpoint** — a project is
only ever created by the customer module's contract automation above, never directly.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/projects` | `projects.view` | Scoped differently from Leads/Customers — there's no `managerId`-based "own team" concept for a Project (its own team IS `teamMemberIds`/`projectManagerId`). Admin sees all; everyone else sees only projects where they're the manager or a team member. |
| GET | `/projects/:id` | `projects.view` | 404 (not 403) for an out-of-scope project. |
| POST | `/projects/:id/team` | `projects.assign_team` **+** must be *this specific project's* `projectManagerId`, or admin | "Manager/Admin only" (§7.3) is interpreted narrowly — holding the permission grant is necessary but not sufficient; a different manager who isn't this project's own PM still gets 403 (mirrors `user.service.js#updateUser`'s "self OR admin" shape). Body `{ action: "add"\|"remove", userId }`. |

**Permission design:** `projects.assign_team` is a real, admin-editable grant (manager/admin get it
by default) rather than a hardcoded role check — consistent with this codebase's Single Source of
Truth for Auth principle (§4.1), which the Permissions module (§7.12) exists specifically to
uphold.

10 tests, no application bugs found.

**Task functionality — deliberately removed 2026-07-29.** This module originally also included a
`Task` sub-feature (model, `GET /projects/:id/tasks`, `POST /tasks`, `PATCH /tasks/:id/start`,
`PATCH /tasks/:id/stop`, the `tasks` permission registry entry, and a server-side one-`in_progress`
-task-per-employee constraint) plus a frontend `TasksPage` and sidebar nav entry. It was fully
removed at the user's request, not left unbuilt — see `.context/final-plan.md` §6.4/§7.3 for the
historical record of what existed before removal.

---

### Notifications (`/api/v1/notifications`) — Phase 9

See `.context/final-plan.md` §6.7/Platform. Closes out the last planned backend piece —
push notifications (Web Push/VAPID) and the lead follow-up reminder cron, per §3's originally
planned (not yet built) infrastructure.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/notifications/subscribe` | Authenticated, no module permission | Body `{ endpoint, keys: { p256dh, auth } }` — the browser's Push API subscription object, verbatim. Upserts by `endpoint` (not `userId`) — re-subscribing an already-known endpoint (e.g. a shared device logged in as a different user) re-associates it rather than erroring on a duplicate key. Links the subscription's id onto `User.pushSubscriptions`. |
| POST | `/notifications/unsubscribe` | Authenticated, no module permission | Body `{ endpoint }`. Deactivates (`isActive: false`) rather than deleting — the same row can be re-activated by a later re-subscribe. A silent no-op for an endpoint that doesn't belong to the caller (or doesn't exist), since "make sure this isn't subscribed anymore" is the actual intent regardless. POST, not DELETE — this codebase avoids REST-purist endpoints where a body is more convenient (see `PATCH /leads/:id/hot`), and DELETE-with-a-body is friction for no benefit here. |
| GET | `/notifications?unreadOnly=true&type=lead_created,lead_assigned` | Authenticated, no module permission | Always scoped to the caller — there is no cross-user access anywhere in this module, the same "self data needs no grant" shape as `GET /auth/me`/`GET /attendance/me`. **`type` added 2026-07-31 (§7.29):** an optional comma-separated `NOTIFICATION_TYPES` filter. Added specifically so the Leads/Leave sidebar badges (see `frontend/README.md`) can reuse this exact endpoint — `unreadOnly=true&type=...` and take `.length` — rather than a dedicated count endpoint. |
| PATCH | `/notifications/:id/read` | Authenticated, no module permission | 404 (not 403) for a notification that isn't the caller's — matching the Leads/Location/User/Payroll out-of-scope precedent. |
| PATCH | `/notifications/read-all?type=lead_created,lead_assigned` | Authenticated, no module permission | Marks every one of the caller's own unread notifications read; doesn't touch anyone else's. **`type` added 2026-07-31 (§7.29):** optional, same comma-separated filter as the list endpoint above — scopes the bulk mark-read to just those types, so clicking the Leads sidebar nav item can clear only that badge without touching an unrelated unread Leave notification (or the bell dropdown's own unscoped "Mark all as read", which omits `type` entirely). |

**No `PERMISSION_REGISTRY` entry at all** — every action here is inherently self-scoped (your
own subscriptions, your own notifications), so a permission grant would be redundant, the same
reasoning `users.*`/`attendance.*` already establish for "always-reachable own data."

**`src/services/webPush.service.js`** wraps the `web-push` package: `setVapidDetails()` runs once
at import time from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (now **required** env
vars — see below), and `sendPush(subscription, payload)` is a thin thing wrapper with no
try/catch of its own — a failed send is `notification.service.js`'s concern, not this wrapper's.
Mocked at the module boundary in every test that touches it, same pattern as Cloudinary/Google
Maps — no test ever makes a real push network call.

**`notification.service.js#createNotification(userId, type, message, relatedEntity?)`** creates
the DB record (the real source of truth — `GET /notifications` returns it whether or not any
push actually got delivered) AND attempts a push to every one of the user's **active**
`PushSubscription`s, each attempted independently. A push failure is logged and swallowed
per-subscription — it **never** throws out of `createNotification`, so one bad subscription
can't suppress delivery to the user's other devices, and a notification always gets its DB
record regardless of push outcome. A `404`/`410` response from the push service (the
subscription is gone — uninstalled PWA, cleared site data, etc.) deactivates that subscription
row rather than deleting it, so a later re-subscribe of the same endpoint is a straightforward
re-activate.

**Wired into two existing modules:**
- **Leads** (`lead.service.js`) — `createLead`/`updateLead` both call a shared
  `notifyLeadAssignment` whenever a lead's `ownerId` ends up set to someone other than whoever
  made the change (assigning a lead to yourself needs no notification telling you what you just
  did). This is exactly leads-customer-functional-spec.md's "push notification when a lead is
  assigned to you."
- **Tickets** (`ticket.service.js#assignTicket`) — **a deliberate small addition beyond §7.8's
  literal scope**, not part of the Leads-specific spec. Made because the Notification
  infrastructure is fully generic and Ticket already has an `assign` action ready to hang a
  notification off of; stated here (and in `.context/final-plan.md`) explicitly as scope added
  on top of what this task was asked to build, not a silent expansion. Skipped when an
  admin/manager assigns a ticket to themselves.
- **Leave (`leave.service.js`, added later)** — three new `NOTIFICATION_TYPES`:
  `leave_requested` (the requester's manager, if set, and every admin — the first "notify all
  admins" recipient shape in this codebase, a plain `User.find({ role: "admin" })`, rather than
  one specific already-known recipient), `leave_approved`/`leave_declined` (the requester only,
  on `PATCH /leave/:id/approve`/`/decline`). Every path skips self-notification the same way
  Leads' assignment notification does. See the Leave section above for the full write-up.
- **Lead creation (`lead.service.js`, added 2026-07-31, §7.29)** — a new `lead_created`
  `NOTIFICATION_TYPES` value, distinct from the existing `lead_assigned`. Where
  `notifyLeadAssignment` is a personal "you were assigned this" ping (skipped when you assign a
  lead to yourself), the new `notifyLeadCreation(lead)` helper is a broadcast: every admin
  (`User.find({ role: "admin" })`), **plus** the lead's owner if one was set — deduplicated via a
  `Set` so an admin who's also the owner gets exactly one `lead_created` notification, not two.
  Deliberately fires even when the creator is themselves an admin (unlike the self-assignment
  skip) — the intent is "a new lead entered the pipeline," which every admin benefits from seeing
  regardless of who created it. Called from both `createLead` (manual add) and
  `createLeadFromWebsiteIntake` (§7.25) — the two don't share an implementation, so this is called
  from both rather than assuming one funnels through the other; the website-intake path keeps its
  existing single `lead_assigned` notification to its owner-admin unchanged, and the new
  `lead_created` broadcast is purely additive on top of it.

**`src/cron/leadFollowUpReminderCron.js`** — the other literal Leads requirement ("push 24h and
15min before follow-up, via cron"). Runs every 5 minutes (`*/5 * * * *`, much finer-grained than
the monthly payroll cron, since both reminder windows are precise-ish moments in time, not a
once-a-day batch). `lead.service.js#sendDueFollowUpReminders(referenceDate)` — the job body,
exported separately for direct testing with a fixed date, the same pattern
`payrollCron.js#runMonthlyPayrollJob` already established — checks two independent windows (24h,
15m) per tick: "`followUpDate` falls inside the next N and hasn't been reminded for yet." This
is deliberately a "due within the window" check, not an exact-time match, so a cron restart or a
delayed tick can never cause a reminder to be silently skipped — once a lead's follow-up enters
a window it keeps matching every tick until the guard is set. `won`/`lost` leads are excluded
(nothing left to follow up on); a follow-up that's already fully passed (e.g. the server was
down through the whole window) never gets a reminder at all — this is a "before it's due" nudge,
the existing `followUp=overdue` filter already covers the after-the-fact case.

**New `Lead` fields, a necessary schema addition (§6.7/§7.1), the same treatment as
Attendance's `lastHeartbeatAt`:** `followUpReminder24hSentAt`/`followUpReminder15mSentAt`
(`Date`, nullable) — idempotency guards so the cron never double-sends. Both reset to `null`
whenever `followUpDate` actually changes (`updateLead`), so rescheduling a follow-up "re-arms"
both reminders instead of them silently staying suppressed for the new date.

**New `User.pushSubscriptions`** (`[ObjectId → PushSubscription]`, §6.1/§6.7) — kept in sync by
`subscribe`/`unsubscribe`, though `PushSubscription.isActive` (not this array's membership) is
what `createNotification` actually checks before sending.

**This closes out every backend phase in `.context/final-plan.md` §10** — Phase 9's backend half
(Notification module, Web Push, the follow-up cron) was the last unbuilt backend piece; only
Phase 9's frontend half (Dashboard polish, service worker/PWA wiring) remains.

34 new tests: 17 in `notification.test.js` (subscribe/unsubscribe upsert-by-endpoint semantics,
self-scoped list/read/read-all, push-delivery behavior including the 404/410
deactivate-vs-transient-failure distinction), 9 in `leadFollowUpReminderCron.test.js` (both
reminder windows independently, no double-send, excluded won/lost, already-passed follow-ups
never remind, never throws), 6 new in `lead.test.js` (assignment notification on
create/reassign, no self-notify, follow-up reminder reset on reschedule), 2 new in
`ticket.test.js` (assignment notification, no self-notify). No application bugs found — this
was a clean net-new build. Full suite: **399 tests, all passing.**

---

## Environment Variables

See `.env.example` for the full annotated list. Summary:

| Variable | Required now? | Purpose |
|---|---|---|
| `NODE_ENV` | Yes | `development` / `production` |
| `PORT` | Yes | API port |
| `MONGODB_URI` | Yes | Mongoose connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `JWT_EXPIRES_IN` | Yes | e.g. `7d` — also drives the auth cookie's `maxAge` |
| `COOKIE_NAME` | Yes | Name of the httpOnly auth cookie |
| `CLIENT_ORIGIN` | Yes | Allowed CORS origin(s) — comma-separated list accepted as of 2026-08-04, see the CORS section below |
| `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Only for `npm run seed:admin` | One-time first-admin bootstrap |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | **Yes, as of 2026-07-13** | File storage for Attendance check-in/check-out photos (§6.5/§7.4) — `env.js` now fails fast at boot if any is missing. |
| `CREDENTIALS_ENCRYPTION_KEY` | **Yes, as of 2026-07-13** | 32-byte base64 AES-256-GCM key for the customer credentials vault (§6.3/§11.8) — `env.js` now fails fast at boot if it's missing, since every `Credential` record depends on it. |
| `LOCATION_PING_INTERVAL_MINUTES` | No — defaults to `2` if unset | Minutes between location pings; the client reads this via `GET /location/config` |
| `ATTENDANCE_GAP_THRESHOLD_MINUTES` | No — defaults to `10` if unset | Minutes of heartbeat silence before a `connectivityGaps[]` entry is recorded (§6.5/§7.4) |
| `GEOFENCE_RADIUS_METERS` | No — defaults to `500` if unset | Meters a location ping may drift from the shift's check-in point before a `geofenceViolations[]` entry is recorded (§6.5/§7.4) |
| `GOOGLE_MAPS_API_KEY` | **Yes, as of Phase 6** | Google Maps Distance Matrix API key (§6.5/§7.6) — required for both auto-generated and coords-based manual `TravelLog` entries; `env.js` fails fast at boot if it's missing. |
| `MILEAGE_RATE_PER_KM` | No — defaults to `10` if unset | Currency units per approved-`TravelLog`-km, Payroll's mileage reimbursement (§6.5/§7.7). **Placeholder value** — a deliberately simple v1 (one single global rate, not per-role/per-project); the client must confirm the real rate. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | **Yes, as of Phase 9** | Web Push VAPID keypair (§6.7) — `webPush.service.js#setVapidDetails` fails immediately at import time if either is missing or not a real key. Generate a real pair with `node -e "console.log(require('web-push').generateVAPIDKeys())"` — there's no safe placeholder for a public-key-cryptography pair the way there is for e.g. a Cloudinary cloud name. |
| `VAPID_SUBJECT` | No — defaults to `mailto:support@smartrayssolutions.com` if unset | The `mailto:`/`https:` contact URL the Web Push spec asks a VAPID sender to supply. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | **Yes, as of §7.17 (password reset)** | SMTP config for `src/services/email.service.js`'s password-reset email. Any standard SMTP provider works. `env.js` fails fast at boot if any is missing, matching every other required-integration var above — but note `nodemailer.createTransport()` itself (unlike `web-push`'s `setVapidDetails()`) does NOT validate host/credentials synchronously at import, so a bad-but-present value won't crash the boot, only a real send attempt. |

### CORS — multi-origin support for local dev (2026-08-04)

**Why this exists — a real incident, not speculative hardening.** `CLIENT_ORIGIN` used to be a
single hardcoded value (`http://localhost:5173`), and `app.js`'s `cors()` call passed it straight
through as a static string. When port 5173 was already occupied (a concurrent Claude Code
session running its own `npm run dev`), Vite silently fell back to 5174 — and a browser login
attempt from that fallback port got blocked by CORS. The backend actually processed the request
fine (confirmed via direct `curl`, which bypasses browser-enforced CORS entirely, and by calling
`loginUser()` directly); the browser simply refused to let the page's JS read the cross-origin
response, and the frontend's generic catch-all rendered that as "Login failed" — indistinguishable
from an actual wrong-password error. This cost real debugging time across multiple sessions
before being correctly diagnosed (see `docs/project-status.md`'s 2026-08-04 changelog entry).

**The fix:** `CLIENT_ORIGIN` now accepts a comma-separated list of origins —
`src/config/env.js` splits and trims it into `env.clientOrigins` (an array), used by `app.js`'s
`cors()` origin callback to check each incoming request's `Origin` header against the full list:

```js
cors({
  origin: (origin, callback) => callback(null, !origin || env.clientOrigins.includes(origin)),
  credentials: true,
})
```

- **A request with no `Origin` header at all** (curl, server-to-server calls) is let through —
  the exact same behavior the old static-string config already had, since CORS only ever
  restricts what a *browser's* fetch/XHR can read, never the server-side response itself.
- **An origin outside the list** gets `callback(null, false)`, not a thrown error — the request
  still completes normally server-side; it just comes back with no
  `Access-Control-Allow-Origin` header, so a real browser blocks the calling page from reading
  it. The allowlist stays genuinely closed: no wildcard, no reflecting back whatever `Origin`
  was sent, just a check against the explicit list.
- **`env.clientOrigin`** (singular, unchanged name) is now derived as the **first** entry in the
  list — used by the one place that needs exactly one canonical URL rather than an allowlist,
  `auth.service.js`'s password-reset email link (`${env.clientOrigin}/reset-password?...`).

**Local dev:** `.env`/`.env.example` now default to
`CLIENT_ORIGIN=http://localhost:5173,http://localhost:5174` — covering Vite's own fallback port
so a port collision with another running instance no longer silently breaks login. **Production
stays a single value** (`https://crm.smartrayssolutions.com`) — this multi-origin support is
specifically to absorb local dev port drift, not meant as general production flexibility; nothing
about the Vercel-deployed backend's `CLIENT_ORIGIN` changed.

**Testing:** `app.test.js` (new file, 4 tests) — `testDb.js`'s own `CLIENT_ORIGIN` test default
was updated to match the real `.env`'s two-origin value, so these tests exercise the actual
comma-separated parsing, not a mocked allowlist: both `http://localhost:5173` and
`http://localhost:5174` get `Access-Control-Allow-Origin` correctly reflected back; an origin
outside the list (`http://evil.example.com`) gets no such header at all, proving the allowlist
stays closed rather than becoming accidentally permissive; and a request with no `Origin` header
still passes through. Full backend suite: **678/678 passing.**

---

## Deployment

Deployed to Vercel as `smartrays-crm-backend` (Root Directory: `backend`) — see the root
[`README.md`](../README.md)'s Deployment section for the full CLI redeploy steps, env var
push process, and the cron-jobs-don't-run-on-serverless limitation. Summary of what's
backend-specific:

- `api/index.js` — the actual Vercel entry point (not `server.js`/`app.listen()`). Wraps the
  existing `app.js` Express app in a handler that ensures a cached DB connection first.
  `app.js` itself is untouched, so local dev via `server.js` is unaffected.
- `vercel.json` — rewrites every request path to `api/index.js`.
- `src/database/connection.js#connectDatabase` caches its connection promise across
  invocations instead of opening a fresh one every call — required so serverless cold starts
  don't exhaust Atlas's connection limit. Throws (rather than `process.exit`-ing) on failure now,
  since exiting the process mid-request makes no sense in a serverless function; `server.js`
  itself still exits on a failed initial connect for local/traditional hosting.
- `server.js` skips `registerPayrollCron()`/`registerLeadFollowUpReminderCron()`/
  `registerAttendancePhotoCleanupCron()` (all three, as of §7.4c) when `process.env.VERCEL ===
  '1'` — node-cron needs a long-lived process to fire on schedule, which a Vercel serverless
  function is not. **None of the three crons fire in production today** — a known gap, not
  silently swallowed; confirmed directly against `api/index.js` (the actual Vercel entry point),
  which never calls any of the three `register*Cron()` functions at all. See the root README and
  `docs/project-status.md` for the planned real fix (Vercel Cron hitting a dedicated endpoint, or
  moving this backend off serverless).
- `getAuthCookieOptions()` (`auth.service.js`) uses `sameSite: 'lax'` + `secure: true` in
  production (changed from `'none'`, 2026-07-31) — the frontend now proxies `/api/*` to this
  backend via a Vercel Rewrite (`frontend/vercel.json`) instead of calling this backend's own
  domain directly, so the auth cookie is genuinely same-site again from the browser's
  perspective. `'none'` was a real but fragile fix for the cross-site setup this replaces —
  confirmed via live cross-browser testing (WebKit/Safari) that `'none'` gets silently blocked
  from storage entirely by third-party-cookie policies regardless of `Secure` being set; `'lax'`
  has no such dependency since there is no cross-site cookie anymore.

---

## Testing

```bash
npm test          # runs the full suite once (vitest run)
npm run test:watch   # re-runs on file changes
```

**Stack:** `vitest` (test runner — chosen over Jest for native ESM support, since this project
is `"type": "module"` with no build step) + `supertest` (HTTP-level requests against the
Express app) + `mongodb-memory-server` (spins up a real, disposable `mongod` per test file — no
dependency on a running local/Docker MongoDB, and no risk of tests touching real data).

**Layout:** test files are **colocated with the module they test** (`*.test.js` next to
`*.model.js`/`*.service.js`/etc.), matching this project's per-module organization. Shared test
infrastructure lives in one place, `tests/helpers/`, the same way shared app code lives in
`src/utils`/`src/middlewares`/`src/helpers` rather than inside a module folder:

```
backend/
├── tests/helpers/
│   ├── testDb.js          start/stop the in-memory MongoDB, clear collections between tests
│   ├── testApp.js         dynamically imports app.js (see note below)
│   ├── authHelpers.js     create a user directly in the DB, log in and get a supertest agent
│   └── binaryResponse.js  supertest response parser for binary downloads (xlsx export)
├── src/modules/
│   ├── auth/auth.test.js
│   ├── lead/lead.test.js
│   ├── location/location.test.js
│   ├── permission/permission.test.js
│   ├── user/user.test.js
│   ├── attendance/attendance.test.js
│   ├── customer/customer.test.js
│   ├── project/project.test.js
│   ├── leave/leave.test.js
│   ├── transport/travelLog.test.js
│   ├── payroll/payroll.test.js
│   ├── ticket/ticket.test.js
│   ├── payment/payment.test.js
│   ├── amc/amc.test.js
│   └── report/report.test.js
└── src/cron/payrollCron.test.js   (colocated with the cron job it tests, same convention)
```

Vitest's default discovery (`**/*.test.js`, excluding `node_modules`) picks up colocated test
files automatically — no config needed to point it at `src/modules/`.

**Why the dynamic imports:** `src/config/env.js` validates required env vars and calls
`process.exit(1)` the moment it's imported — including transitively, e.g. importing `app.js`
imports `route.js` imports every module's routes imports `env.js`. Tests need to set
`MONGODB_URI` (from the freshly-started in-memory server) and the other required vars *before*
that happens, which is impossible with a static top-level `import app from "../../app.js"`
(ES module imports are hoisted and evaluated before any `beforeAll` hook runs). `testApp.js` and
`authHelpers.js` use `await import(...)` instead, deferred until a test's `beforeAll` explicitly
calls them — after `startTestDatabase()` has already set every env var. This only applies to
files that transitively import `env.js` (`app.js`, routes, controllers, services, middlewares);
`lead.test.js` imports the `Lead`/`LeadCall`/`LeadSource` models directly and statically, since
plain Mongoose schema files have no such dependency.

**Coverage:**
- **Auth** (19 tests): register blocked when unauthenticated and when authenticated as
  non-admin, succeeds as admin and never leaks `passwordHash`, rejects duplicate email/short
  password/invalid role; login succeeds/fails correctly and never puts the token in the
  response body; `/me` with and without a session; logout invalidates the session — including a
  **regression test** that asserts the `Set-Cookie` header expires immediately
  (`Expires=Thu, 01 Jan 1970`, no `Max-Age`), locking in the cookie-clearing bug fixed during
  the Auth module build; and (added, §7.8) Customer Portal self-signup — succeeds via a
  `Contact`-email domain match, succeeds via the `Customer.email` fallback when no `Contact`
  matches, rejects clearly with no domain match at all, rejects a duplicate email, rejects an
  invalid email/short password, and the newly signed-up account logs in afterward like any
  other.
- **Leads** (34 tests): CRUD, validation (missing name, `lost` without `lostReason` on create/
  update/status-change), pipeline transitions, hot-flag toggle, call logging + history + invalid
  outcome, `search`/`owner`/`followUp`/`status` filters, permission scoping (admin/manager/
  sales_associate, including that a sales associate gets **404** — not a silently empty result
  or a 403 — when touching another sales associate's lead, and that ownership can't be
  self-escalated by sending a different `ownerId`), CSV import (valid rows created, invalid rows
  skipped and reported, not fatal to the batch), `.xlsx` export (byte-for-byte re-read and checked
  against the database), and (replacing the old 501-stub test once the `customer` module existed)
  the real conversion flow: rejects with no `projectManagerId`, then creates a real `Customer`
  from the lead's data and sets `convertedCustomerId` on the lead.
- **Location** (26 tests — 20 original + 6 new for geofencing): ping accepted with an open Attendance record, rejected (409) with
  none and after checkout, `employeeId` can't be spoofed from the request body, live-view
  scoping (admin/manager/sales_associate/no-permission-at-all), an employee who's checked out
  correctly disappears from the live view, history returns exactly the right employee+day
  trail (ordered, excluding other employees/days) with 404 on out-of-scope `employeeId`, the
  config endpoint, the TTL index configuration (`LocationPing.collection.indexes()`, not a real
  45-day wait), the role-based permission defaults themselves (asserting the actual stored
  `permissions.location` value for a manager, a sales associate, and an explicit override) —
  fixtures for this suite register through the real `/auth/register` endpoint rather than
  inserting directly into the database, specifically so the default-permission logic under test
  actually runs — and (added once the `attendance` module existed) one end-to-end test proving a
  real `POST /attendance/check-in` unblocks a real `POST /location/pings`, and a real
  `POST /attendance/check-out` blocks the next one, with no direct database writes anywhere in
  that flow. **Geofencing (6 new tests):** a ping within the default 500m radius records no
  violation; a ping beyond it opens one (`end: null`, `maxDistanceMeters` set to the actual
  distance); repeated still-outside pings update the same open window's `maxDistanceMeters` to
  the worst distance seen rather than opening a second one; a later in-radius ping closes it;
  a real `POST /attendance/check-out` force-closes a still-open window; and — mocking
  `geo.service.js#haversineDistanceMeters` to throw once, the same technique
  `travelLog.test.js` already uses to mock a Google Maps failure — a ping still succeeds (201)
  even when the geofence calculation itself blows up.
- **Permission** (20 tests): registry shape, template CRUD (view/edit as admin, blocked for
  non-admin, invalid role rejected), the two behaviors that matter most for a template system —
  editing a template does **not** retroactively change an existing user's permissions, and a
  *newly* created user is seeded from the *current* template, not stale defaults — per-user
  overrides that never leak into the template or another user with the same role, the reset
  endpoint specifically proving it re-syncs to the template's **current** values rather than
  creation-time or customized ones (edit the template *after* customizing the user, then
  reset, then assert against the new template values), unknown module/action keys rejected with
  a clear 400, and every one of the 7 endpoints in this module individually confirmed to reject
  a non-admin with 403.
- **User** (62 tests): `managerId` validation at creation time (rejected for a non-manager/admin
  target, rejected for a nonexistent id, accepted for both `manager` and `admin`), the dropdown
  endpoint (accessible with no `users.*` grant, excludes deactivated users, returns only
  `_id`/`name`/`role` — explicitly asserting `passwordHash` and `permissions` are absent, not just
  the other extra fields), list scoping (`view_all` sees everyone, `view_team` sees direct
  reports + self but not an unaffiliated sales associate, **falls back to a self-only 1-item list
  (200, not 403) when the caller holds no `users.*` grant at all**, filters by `role`/`isActive`/
  `managerId`), single-record access (self always allowed regardless of grant, manager can fetch
  a team member, **404** for an unaffiliated sales associate, **403** for no grant at all when
  fetching someone else's specific id — deliberately not the same self-only fallback as the list
  endpoint), self-vs-admin update rules (self can edit `name`/`email`/`phone`, self is blocked
  from `role`/`isActive`/`managerId` with 403, one non-admin can't edit another user at all, admin
  can edit every field on anyone, admin sending an invalid `managerId` through the general update
  endpoint is rejected — enforced identically at both the validation and service layers),
  deactivate/reactivate (admin-only, a non-admin is blocked even on their own record, a manager
  can't deactivate a team member), manager assignment (valid assignment, invalid target
  rejected, clearing with `managerId: null`, non-admin blocked), and (added 2026-07-13, §7.7
  Payroll prerequisite) `baseSalary`: a non-admin is blocked (403) from setting their own, and
  an admin setting it succeeds and never leaks it on a plain `GET /users` list fetch. Plus the
  2026-07-30 §7.28 additions: the team-head deactivation guard (8 tests) and (5 tests) the
  guarded hard-delete — rejects an active user, rejects with no reason, rejects a deactivated
  team head (defensive), blocks a non-admin, and the success path (deletes the user, writes one
  `DeletedUserAuditLog` entry with the full snapshot and exact reason, and a Lead this user owned
  is still readable afterward with its `ownerId` unchanged).
- **Attendance** (32 tests): check-in creates an open record and rejects a second one while the
  first is still open (409), rejects missing coords (400), always attributes the record to the
  authenticated user regardless of any `employeeId` sent in the body, and lets two different
  employees each hold their own independent open record at the same time; check-out closes the
  open record, rejects when there's no open record (409) and when the record is already closed
  (409), rejects missing coords, and never touches another employee's open record even when that
  employee is the one calling check-out; `GET /attendance/me` returns only the caller's own
  history, rejects a malformed `month` query (400), and correctly filters down to the given
  month; photo capture uploads a base64 photo on check-in/check-out and stores the mocked
  Cloudinary URL, **rejects a check-in and a check-out with no photo at all (400) — the photo
  requirement is enforced server-side, not just client-side** — and accepts a real multipart
  file alongside JSON-stringified coords; heartbeat rejects with no open shift (409), records no
  gap within the threshold, records a `connectivityGaps` entry when the backdated last-heartbeat
  exceeds the threshold (both via a follow-up heartbeat and via checkout), and `workingHours` is
  asserted to exactly equal gross duration minus gap duration (and to equal gross duration alone
  when there was no gap); `GET /attendance/team` scopes to direct reports only, 403s a role with
  no `attendance.*` grant, and filters by month; `GET /attendance/report` (updated Phase 8, §7.11;
  streams directly again as of 2026-08-04's Cloudinary removal) generates a real, non-empty
  `.xlsx` by default — asserted against the actual streamed response body, re-read with `exceljs`
  to confirm the "PK" zip signature and that only the manager's own team's records appear in it,
  not an unaffiliated sales associate's, plus the correct `Content-Type`/`Content-Disposition`
  headers and that no Cloudinary function was called — and a real, non-empty `.pdf` with
  `?format=pdf` (checked for the `%PDF-` magic-number header on that same streamed buffer),
  rejects an invalid format and an inverted date range, and 403s a role with no `attendance.*`
  grant.
- **Leave** (18 tests): requesting creates a `pending` request, always attributes it to the caller
  unless the caller is admin (who may request on behalf of someone else), rejects `endDate` before
  `startDate` and a self-requested `type: "unapproved_absence"` (400, admin-only via the dedicated
  action); `GET /leave?scope=own\|team\|all` — own returns only the caller's requests, team lets a
  manager see direct reports' requests but 403s a sales_associate with no `view_team` grant, all
  403s a manager but succeeds for admin, and an invalid scope value is rejected; approval — admin
  approves a pending paid request, a non-admin (including the requester's own manager) is blocked,
  approving an already-non-pending request is rejected (409), a single paid request over 1 day is
  rejected, **the one-paid-leave-per-month quota is confirmed to be enforced at APPROVAL time, not
  request time — two paid requests for the same employee in the same calendar month both submit
  successfully (201), the first approval succeeds, and only the second approval is rejected
  (409) with a message naming the quota** — and an unpaid request's approval never touches the
  paid-leave quota; marking an unapproved absence sets `type`/`isDoubleDeduction`/`status`
  correctly and is blocked for a non-admin. **(41 tests total after this task's additions — 23
  new):** half-day requests accepted only when `startDate === endDate` and a non-boolean
  `isHalfDay` rejected; two half-day paid approvals in the same month both succeed (0.5 + 0.5)
  while a third is rejected (409, quota exceeded); `PATCH /leave/:id/decline` sets `status:
  "rejected"`/`declineReason` correctly (with or without a reason), is admin-only, 409s a
  non-pending record, 400s a non-string reason, 404s a nonexistent id; `GET /leave/balance`
  returns correct used/limit/remaining numbers (including the 0.5 half-day case), ignores a
  pending leave, and is scoped correctly for admin/manager/sales_associate viewing someone
  else's balance (own always allowed; manager only for their own direct reports; sales_associate
  blocked entirely); notifications — the requester's manager and every admin (but never the
  requester) are notified on submission, an unaffiliated manager is not, and the requester is
  notified on both approve and decline (the decline notification includes the reason).
- **Customer** (21 tests): CRUD + scoping identical in shape to Leads (admin/manager-team/
  sales_associate-own, including **404** not 403 for an out-of-scope fetch and `ownerId` forced to
  self for a sales_associate), bulk activate/deactivate/delete (including that the delete action
  specifically needs `customers.delete`, checked inside the service since one route can't express
  a per-action permission ahead of a mixed-action body), the full contract automation chain
  (`monthly`→recurring Project+draft Invoice, `onetime`→onetime Project+draft Invoice, `yearly`→no
  automation, deleting a contract completes its Project and cancels its Invoice), the deactivation
  cascade (active projects → completed, already-completed ones left alone), contacts CRUD, and the
  credentials vault (the stored value is asserted to be neither the plaintext nor to contain it,
  list/detail never expose `passwordEncrypted`/`passwordIv`, reveal decrypts correctly and writes
  an activity-log entry, and a role without `credentials.view` is blocked from the vault
  entirely), plus the activity log itself recording actions in the right order.
- **Project** (10 tests): list/detail scoping (admin sees everything, everyone else only projects
  where they're the manager or a team member, **404** not 403 for out-of-scope, **403** for a role
  with no `projects.*` grant at all), team add/remove (this project's own manager or admin only —
  a *different* manager who merely holds the role-level grant is still blocked, and an employee
  with no `assign_team` grant is blocked at the route). Task assignment and the
  one-`in_progress`-task-per-employee constraint were tested here too until Task functionality was
  deliberately removed 2026-07-29 — see the Projects section above.
- **Transport/Travel** (28 tests): a real Attendance checkout auto-creates a `source: "auto"`
  `TravelLog` from that shift's check-in/check-out coords with the mocked distance; calling
  `generateAutoTravelLog` directly with missing coords returns `null` and creates nothing;
  a Google Maps failure during checkout never fails the checkout itself and creates no log;
  manual entry uses a caller-supplied `distanceKm` as-is without calling Google Maps, computes
  `distanceKm` via Google Maps when only coords are given, rejects an entry with neither, and
  self-attributes when no `employeeId` is given; a plain sales_associate naming a peer's
  `employeeId` is rejected outright (403, not silently redirected to self); a manager can log for
  their own direct report but is blocked (403) from logging for a non-report; an admin can log for
  anyone; `GET /travel-logs?scope=own\|team\|all` — own returns only the caller's own logs, team
  lets a manager see direct reports' logs (and narrows further with `?employeeId=`) but 403s a
  sales_associate with no `view_team` grant, all 403s a manager but succeeds for admin, an invalid
  scope is rejected, and a dedicated side-by-side test proves admin/manager/employee scoping
  simultaneously (three employees log travel, then admin's `scope=all`, the manager's
  `scope=team`, and one employee's default `scope=own` are each asserted against the exact
  expected employee-id set); the report (updated Phase 8, §7.11; streams directly again as of
  2026-08-04's Cloudinary removal) generates a real, non-empty `.xlsx` by default (asserted
  against the actual streamed response body, re-read with `exceljs` to confirm both the "PK"
  signature and team-only scoping, plus that no Cloudinary function was called) and a real PDF
  with `?format=pdf` (checked for the `%PDF-` header on that same streamed buffer), and 403s a
  role with no `view_team`/`view_all` grant; (added 2026-07-13) approve/reject: both `auto`- and
  `manual`-source logs default to
  `status: "pending"`, the target employee's own manager can approve, an admin can reject, a
  manager is blocked (403) from resolving a non-report's log, a plain sales_associate is blocked
  entirely, re-resolving an already-resolved log is rejected (409), and a nonexistent id is 404.
- **Payroll** (21 tests, §7.7, Phase 4 + a Phase 8 regression test + 1 new for half-day leave):
  see the Payroll section above for the full formula
  coverage (the new test confirms a half-day paid/unpaid `Leave` contributes exactly `0.5` to
  `paidLeaveDays`/`unpaidDeductionDays`); also: a non-admin (manager included) is blocked from `POST /payroll/run`,
  missing/invalid `month`/`year` rejected (400), running for an employee with no `baseSalary`
  rejected (400), re-running an already-generated employee/month rejected (409) unless
  `regenerate=true` (which recomputes the same document in place, not a duplicate), a bulk run
  generates for every active employee with a `baseSalary` set and silently skips the rest (and
  silently re-skips already-generated employees on a repeat bulk run), `scope=own`/`all` access
  (manager blocked from `scope=all`; an `employee` sees their own payroll via the default
  template grant), a **`sales_associate` with no override gets no payroll access at all** —
  `GET /payroll` is 403, `GET /payroll/:id/payslip` on their own record is 404 (§5's matrix
  marks `payroll.view/run` as "–" for Sales Associate, the same as Manager, not "own payslip
  only" like Employee — a correction to an earlier misread of that cell as blank/unspecified,
  see the Permissions section below), and payslip access (self succeeds, admin succeeds for
  anyone, an unrelated employee gets 404, a manager gets 404 even for their own direct report
  since Payroll has no `team` tier, an unsupported `format` is rejected), plus a dedicated
  **Phase 8 regression test** confirming `GET /payroll/:id/payslip` still streams a direct PDF
  response (`Content-Type: application/pdf`, real `%PDF-` bytes) and was NOT swept into the
  §7.11 report dispatcher migration.
- **Payroll cron job** (6 tests, `src/cron/payrollCron.test.js`): `resolvePreviousMonth`'s pure
  date-math (same-year case and the January→prior-December wraparound), `registerPayrollCron`
  schedules `"5 0 1 * *"` (asserted via a `node-cron` mock, never a real timer), and
  `runMonthlyPayrollJob` (called directly with a fixed reference date, not real/faked time)
  produces the exact same `Payroll` records a manual bulk run would — including staying
  idempotent on a repeat call for the same reference date and skipping an employee with no
  `baseSalary` set.
- **Ticket** (35 tests, §7.8, Phase 5): see the Support & Ticketing section above for the full
  coverage — create (internal admin/manager with `customerId` required/validated,
  create-and-assign, portal raise auto-scoped and forced to `category: "other"`,
  `sales_associate`/`employee` blocked), list scoping (`scope=all\|assigned\|own`, checked
  separately for admin **and** manager since "PM" is its own grant not admin's bypass,
  `scope=own` cross-company isolation tested directly in both directions with two different
  `Customer`s, role-based default-scope resolution, `sales_associate` blocked entirely), assign
  (admin/manager only), status (assigned-employee and admin/manager can change it, an unrelated
  employee 404s, a customer on their own ticket gets 403 not 404, any transition including
  backwards is allowed and logged), comments (admin/manager/assigned-employee/own-company-customer
  can all comment, everyone else 404s), history ordering (a mixed sequence of comments/status
  changes lands in `history[]` in the exact order they happened), and attachments (mocked
  Cloudinary upload, no-file rejected).
- **Payment** (16 tests, §7.9, Phase 7): access (admin-only, manager/sales_associate/employee
  blocked), standalone logging (manual client name, or a `customerId` with no `invoiceId` —
  either way nothing gets reconciled), validation (both/neither of `customerId`/
  `manualClientName` rejected, `invoiceId` without `customerId` rejected, invalid date/
  non-positive amount rejected), and partial reconciliation (a partial payment reduces balance
  and sets `partially_paid`, an exact payment sets `paid`, an overpayment clamps to 0 and sets
  `paid`, two sequential partial payments compound correctly, an `invoiceId` belonging to a
  different customer is rejected, a null-balance or `cancelled` invoice is rejected, a
  nonexistent `invoiceId` is rejected).
- **AMC** (20 tests, §7.10, Phase 7): the `existing_customer` flow (admin and an in-scope
  sales_associate succeed, an out-of-scope sales_associate is rejected, a nonexistent/missing
  `customerId` is rejected), the `new_customer` flow (creates a real `Customer` and links the
  AMC to it, a missing/incomplete `newCustomerPayload` is rejected), validation (invalid `flow`,
  missing dates), access (employee blocked entirely), list scoping (admin sees all, a manager
  sees "own team" — their direct reports' customers, not an unaffiliated sales associate's — a
  sales associate sees only "own"), update (admin and an in-scope sales associate succeed, an
  out-of-scope record 404s, an invalid status is rejected), and a dedicated regression test
  confirming a record with a long-past `renewalDate` never auto-flips to `"expired"` on its own.
- **Report** (24 tests, §7.11, Phase 8): validation (missing/invalid `module`, invalid `format`,
  non-object `filters`, unauthenticated request), `attendance` (a manager's dispatcher report
  contains the exact same employee set `GET /attendance/team` independently returns for that
  manager — proving scoping is reused, not reimplemented — a `sales_associate` with no grant
  is blocked, and an invalid date-range `filters` value is rejected via the reused
  `validateReportQuery`), `transport` (same team-scoping proof; blocked role; a `from > to`
  filter is rejected via the same reused validator), `leave` (an employee's own report succeeds
  — asserted against the actual streamed response, with an explicit "PK" xlsx-signature check on
  the buffer; a `sales_associate` requesting `scope=team` still 403s via the reused
  `listLeaves` check even though the coarse dispatcher gate let them in; an invalid `scope`
  value is rejected via the reused `validateScopeQuery`), `payroll` (an employee's own report
  succeeds with the correct values in the rendered `.xlsx`, plus the "PK" signature check; a
  manager is blocked entirely since Payroll has no manager grant at all; a `scope=team` filter
  is rejected via the reused `validateListQuery`, since Payroll only supports own/all), `leads`
  (a `sales_associate`'s report contains only their own leads, matching `listLeads`' ownership
  rule, plus the "PK" check; an employee blocked; an invalid `status` filter is rejected against
  `LEAD_STATUSES`), and `customers` (a manager's report contains only their team's customers,
  matching `listCustomers`' ownership rule, plus the "PK" check; an employee blocked; a
  `format=pdf` request generates a real PDF; an invalid `status` filter is rejected against
  `CUSTOMER_STATUSES`). Every one of the six modules' success path asserts the real magic-number
  file signature ("PK"/"%PDF-") directly on the streamed response body (2026-08-04 — the
  dispatcher no longer uploads to Cloudinary; see the Cloudinary-removal note above), plus that
  no Cloudinary function was called. `cloudinary.service.js` is still mocked at the module
  boundary (other routes on the same app instance need it) — no test makes a real network call.

Total: **365 tests**, all passing — verified via a real `npm test` run, per-file breakdown:
19 auth + 34 leads + 20 location + 20 permissions + 33 user + 32 attendance + 21 customer +
19 project + 18 leave + 28 transport + 20 payroll + 6 payrollCron + 35 ticket + 16 payment +
20 amc + 24 report = 365. (358 at the end of the initial Phase 8 build, +6 `report.test.js`
filter-validation/signature tests +1 `payroll.test.js` payslip-exclusion regression test = 365 —
a follow-up rigor pass, not a behavior change; the Attendance/Transport suites' own counts are
unchanged, 32/28.) No real MongoDB or
running server is required to run the suite — `npm test` is fully self-contained. No test makes
a real Cloudinary or Google Maps API call — `attendance.test.js` and `location.test.js` (whose
end-to-end test now supplies a photo too, since check-in/check-out require one, and performs a
real checkout that would otherwise call Google Maps) mock both
`src/services/cloudinary.service.js` and `src/services/googleMaps.service.js` at the module
boundary; `travelLog.test.js` and `ticket.test.js` mock the same Cloudinary module too.

---

## Coding Standards (enforced across every module)

From `.context/smartrays.md` — ES modules everywhere, thin controllers, business logic lives
in services, models only do DB operations, early returns over nesting, no clever one-liners,
meaningful names, `{success, message, data}` response envelope. Keep new modules consistent
with the `auth` module's file layout above rather than inventing new patterns.

---

## Dependencies added for Leads

- `exceljs` — CSV/Excel parsing (import) and `.xlsx` generation (export), per
  `.context/final-plan.md` §3.
- `multer` — multipart file upload handling for `POST /leads/import` (memory storage; files
  are parsed in-memory and never written to disk).

**Known issue:** `npm audit` reports a moderate-severity advisory in `uuid` (a transitive
dependency of `exceljs`) — a missing buffer bounds check that only triggers if a caller passes
a `buf` option directly to `uuid`'s v3/v5/v6 functions. Nothing in this codebase calls `uuid`
directly or passes attacker-controlled buffers into it, so this isn't reachable through our
usage. The suggested fix (`npm audit fix --force`) would downgrade `exceljs` to `3.4.0`, a
breaking change, for a library `.context/final-plan.md` §3 specifically pins as our tool —
left as-is and flagged here rather than silently downgraded. Revisit if `exceljs` publishes a
fix release.

## Dependencies added for Attendance (full Phase 3 build)

- `cloudinary` — official v2 SDK, `src/services/cloudinary.service.js`, uploads check-in/
  check-out photos and returns the secure URL. Configured from `CLOUDINARY_CLOUD_NAME`/
  `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` (now required env vars).
- `pdfkit` — `GET /attendance/report?format=pdf`, via the new `src/services/report.service.js`
  (see the Attendance section above). `exceljs` (already a dependency) handles the `.xlsx` case,
  the default format, through the same shared service.

`npm audit` after installing both: no new advisories beyond the pre-existing `uuid`/`exceljs`
one documented above.

## Transport/Travel — no new dependency added

`src/services/googleMaps.service.js` calls the Google Maps Distance Matrix REST API directly via
the Node runtime's built-in `fetch` — deliberately not adding an official Google Maps SDK package
for what's a single, simple HTTP GET. Revisit if this module's Google Maps usage grows beyond
plain distance lookups.

## Dependencies added for Payroll

- `node-cron` — already a listed §3 tech-stack dependency, installed for real with this task.
  Drives `src/cron/payrollCron.js` (see the Payroll section above). `npm audit` after installing:
  no new advisories beyond the pre-existing `uuid`/`exceljs` one documented above.

## Dependencies added for Notifications (Phase 9)

- `web-push` — already a listed §3 tech-stack dependency, installed for real with this task.
  `src/services/webPush.service.js` wraps it (see the Notifications section above); also used
  directly, once, via its `generateVAPIDKeys()` utility to produce the `VAPID_PUBLIC_KEY`/
  `VAPID_PRIVATE_KEY` pair. `npm audit` after installing: no new advisories beyond the
  pre-existing `uuid`/`exceljs` one documented above.

---

## Verification Notes (Leads module)

Verified with real HTTP requests against a running server + MongoDB (not just "it boots"):
one admin, one manager, two sales associates on that manager's team, a third sales associate
deliberately left off the team, and an employee account with no `leads` permission granted.

Confirmed:
- List scoping is exactly right for all 5 accounts (admin sees all; manager sees their 2 team
  members' leads but not the unaffiliated sales associate's; each sales associate sees only
  their own).
- Single-record access (`GET`/`PATCH`/`DELETE /leads/:id`) returns 404, not 403, for
  out-of-scope leads.
- An account with no `leads` permission granted gets 403 on `GET /leads`.
- `sales_associate` create requests always get `ownerId` forced to themselves even when a
  different `ownerId` is sent in the payload.
- `PATCH /leads/:id/status` to `lost` without `lostReason` is rejected (400); with it, succeeds.
- Hot-flag toggle flips correctly across repeated calls.
- Call logging + call history round-trip correctly; an invalid `outcome` is rejected (400).
- `POST /leads/:id/convert` returns 501 with a clear message, as designed.
- `followUp=today` / `followUp=overdue` / `search` / `status` filters all returned the exact
  expected subsets.
- CSV import correctly created valid rows and skipped/reported invalid ones (missing name,
  invalid status) with row numbers, without aborting the whole batch.
- `.xlsx` export downloaded with the correct content type and was re-read with `exceljs` to
  confirm every column and row matched the database.
- A manager creating a lead and assigning it to a team member's `ownerId` correctly made it
  visible in that team member's own list.

No bugs found during this verification pass (contrast with the Auth module build, where a
cookie-clearing bug was found and fixed — see the git history / prior session notes).

**Update:** the above was manual `curl` verification, done before the automated suite existed.
An automated suite now exists (see **Testing** above, `npm test`) and covers all of this plus
the permission-scoping edge cases in far more depth — 46 tests, all passing. Writing it found
**no application bugs** (the Leads module's logic held up), only two test-authoring issues,
fixed in the tests themselves, not the app:
1. `supertest`/`superagent` has no built-in parser for the `.xlsx` MIME type, so
   `response.body` was an empty object instead of a `Buffer` until a custom binary parser
   (`tests/helpers/binaryResponse.js`) was added.
2. An early version of the export test asserted the wrong worksheet column (mixed up "Name" vs.
   "Company" — column 1 vs. column 2 in `lead.service.js#exportLeadsToExcel`'s column order).
