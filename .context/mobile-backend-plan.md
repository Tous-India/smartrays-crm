# Mobile backend plan — serving a React Native Android app (2026-09-19)

**Status: §1 and §3 built (2026-09-21); §2 remains plan only.** Written against the codebase as of 2026-09-19 (working
tree, including the uncommitted §7.68–§7.71 work). Kept separate from `final-plan.md` on purpose;
that file carries one cross-reference line to here and nothing else.
The app that consumes this backend is planned in `.context/app-plan.md`.

## The constraint that shapes every item: additive only

The web app must keep working exactly as it does today. So every item below is something placed
*beside* the existing code: a new branch that only runs when the old one has nothing to say, a new
route next to an old one, a new optional field, a new collection. Nothing the web frontend calls
changes its request shape, its response shape, its cookie behaviour or its model fields.

Where an item *could* have been done by editing an existing thing, the plan says why it isn't. Where
an item genuinely cannot be additive, it is flagged as such and no workaround is designed.
**Result of the audit: nothing in the three items below is blocked by the constraint.** One item has
a single judgement call (batch pings and the open-shift rule, §3.4) that needs a yes before build.

## Already built — reuse, don't re-plan

Checked before planning. Each of these is a real piece of the mobile path that already exists:

| Exists today | Where | Reused by |
|---|---|---|
| `Authorization: Bearer` parsing, with a scoped-token rejection rule | `authenticatePreAuth` in `middlewares/authenticate.middleware.js` | §1 — the access-token branch is this, minus the `pre_auth` scope check |
| Server-side hashed tokens with expiry, label and per-device revoke | `User.trustedDevices[]` + `auth/trustedDevice.service.js` | §1 — the refresh-token store follows the same hash-and-compare discipline (different storage, see §1.3) |
| `SESSION_EXPIRED` error code — the server's positive "your credential is gone" assertion | `authenticate.middleware.js` | §1 — the app keys its "go to login" on this exact code, as the web does |
| CORS already admits requests with **no `Origin` header** | `app.js` → `callback(null, !origin \|\| …)` | §1 — a React Native `fetch` sends no Origin; nothing to change |
| Trusted-device token consulted only *after* the password is verified | `loginUser({ trustedDeviceToken })` | §1 — mobile passes the same value from a header instead of a cookie |
| One notification fan-out point | `notification.service.js#createNotification` → `attemptPush` per subscription | §2 — the transport dispatcher slots in here; no caller changes |
| Push-service "subscription gone" handling (404/410 → `isActive: false`) | `attemptPush` | §2 — FCM gets the same shape with its own error code |
| `GET /location/config` (ping cadence from the server) | `location.routes.js` | §3 — the app reads its queue-flush interval from here |
| Per-ping open-shift check and geofence evaluation | `location.service.js#submitPing`, `attendance.service.js#applyGeofenceCheck` | §3 — the batch path calls both per element |
| 45-day TTL on `LocationPing` | `location.model.js` (index on `createdAt`) | §3 — applies to batched documents unchanged; see the nuance in §3.5 |

---

## 1. Bearer token auth, alongside cookie auth

**Status: BUILT — commit `8a98b8c` (2026-09-21).** Four sibling routes under `/auth/mobile`
(login, 2fa/verify, refresh, logout) call the same service functions the web uses; `authenticate`
reads a Bearer access token only when there is no session cookie; refresh tokens live in a new
`RefreshToken` collection (SHA-256, rotated on use, reuse revokes the device, revoked on logout /
deactivation / password change); 28 tests, the existing 100 auth tests untouched.

### 1.1 What the code does today

- The session is a JWT `{ userId }` signed with `JWT_SECRET`, lifetime `JWT_EXPIRES_IN` (7d in
  `.env.example`), delivered **only** in an httpOnly cookie named `COOKIE_NAME`
  (`sameSite: "lax"`, `secure` in production). The login response body carries the user, never
  the token. There is no server-side session record and no revocation: logout clears the cookie.
- Two-factor: when a second factor is outstanding, login returns a `preAuthToken` (JWT with
  `scope: "pre_auth"`, short TTL) in the **body**; the app must send it as `Authorization: Bearer`
  to `POST /auth/2fa/verify`, which then issues the session cookie. A "remember this device"
  token is set as a second cookie.
- `authenticate` reads exactly one thing: `req.cookies[env.cookieName]`.

### 1.2 Every place the current code assumes a cookie

Backend, runtime:

| # | Place | Assumption |
|---|---|---|
| 1 | `authenticate.middleware.js:40` | `req.cookies[env.cookieName]` is the only source of a session token |
| 2 | `auth.controller.js#login` | issues the session via `res.cookie(...)`; body carries no token |
| 3 | `auth.controller.js#issueSession` (used by `verifyTwoFactor`) | same — cookie only |
| 4 | `auth.controller.js#logout` | `res.clearCookie(env.cookieName)`; nothing server-side to revoke |
| 5 | `auth.controller.js#login` | reads the trusted-device token from `req.cookies[trustedDeviceCookieName]` |
| 6 | `issueTrustedDeviceCookie` / `clearTrustedDeviceCookie` | trusted-device token lives only in a cookie |
| 7 | `auth.service.js#getAuthCookieOptions/getAuthCookieMaxAgeMs` | cookie lifetime is coupled to `JWT_EXPIRES_IN` |
| 8 | `app.js` — `cookieParser()`, `cors({ credentials: true })` | cookie transport wiring (harmless to mobile; stays) |

Frontend (unchanged by this plan, listed for completeness): `services/apiClient.js` sets
`withCredentials: true`; `store/sessionStore.js` establishes the session from `GET /auth/me` on
boot and redirects on `SESSION_EXPIRED`. Backend tests use supertest agents that carry cookies
(`tests/helpers/authHelpers.js#loginAsAgent`) — new tests for the Bearer path use a plain
`request(app).set("Authorization", …)` instead; the existing tests are untouched.

**Nothing else reads cookies.** `grep -rn "req.cookies"` returns the auth controller only. The
customer portal, location, attendance and every other module rely solely on `authenticate`.

### 1.3 The plan

**a. `authenticate` accepts either — cookie first, Bearer only when there is no cookie.**

```
token = req.cookies[env.cookieName]
     ?? bearerFrom(req.headers.authorization)   // NEW: only consulted when no cookie
```

Everything after that line is byte-identical: same `jwt.verify`, same `pre_auth` rejection, same
user lookup, same `isActive` check, same `SESSION_EXPIRED` code. A web browser always has the
cookie, so the new branch is never reached by the web app. Additive by construction.

A mobile access token is a JWT of the **same shape** as the web session token (`{ userId }`) with
a shorter `expiresIn`, so the verification path is shared. One optional hardening: add
`aud: "mobile"` to mobile access tokens so a log line can tell them apart; the middleware does
not need to branch on it.

**b. New mobile auth routes, beside the web ones — the web routes stay byte-identical.**

| Route | Purpose | Response body |
|---|---|---|
| `POST /auth/mobile/login` | password (+ optional `X-Trusted-Device` header) | `{ user, accessToken, accessExpiresIn, refreshToken }` — or the existing `{ requiresTwoFactor, preAuthToken, … }` shape when a second factor is outstanding |
| `POST /auth/mobile/2fa/verify` | `Authorization: Bearer <preAuthToken>` (reuses `authenticatePreAuth` as-is) | `{ user, accessToken, accessExpiresIn, refreshToken, trustedDeviceToken? }` |
| `POST /auth/mobile/refresh` | `{ refreshToken }` | `{ accessToken, accessExpiresIn, refreshToken }` (rotated) |
| `POST /auth/mobile/logout` | Bearer access + `{ refreshToken }` | revokes that refresh token (and the device's FCM token, §2) |

Why new routes rather than a `client: "mobile"` flag on the existing ones: a flag would put a
conditional into `login` and `verifyTwoFactor`, which is exactly the "modify existing behaviour"
the constraint forbids, even if the default branch were identical. Sibling routes cost four small
controller functions that call the **same** `loginUser`/`verifySecondFactor`/`rememberDevice`
service functions the web uses — the service layer is not duplicated, only the transport.

`loginUser` already takes `trustedDeviceToken` as a parameter; the mobile controller passes the
header value where the web controller passes the cookie value. `rememberDevice` already returns the
raw token; the mobile 2FA controller returns it in the body instead of setting a cookie. No service
change.

**c. Refresh flow.**

- **Access token:** JWT, `expiresIn: 15m` (new env `MOBILE_ACCESS_TOKEN_TTL`, default `15m`).
- **Refresh token:** 32 random bytes, base64url, `expiresIn: 30d` (new env
  `MOBILE_REFRESH_TOKEN_TTL_DAYS`, default 30). **Never a JWT** — it must be revocable, so it is
  a server-side record.
- **Storage — a new collection `RefreshToken`, not an array on `User`.** The trusted-device
  precedent embeds tokens on `User` and compares with bcrypt across the array; that is fine for a
  handful of remembered browsers and wrong for refresh tokens, which rotate on every use and must
  be found by value. Fields: `userId`, `tokenHash` (SHA-256, `unique` index — bcrypt cannot be
  indexed), `deviceId` (app-generated, stable per install), `deviceLabel`, `expiresAt` (TTL
  index), `revokedAt`, `replacedByHash`, `lastUsedAt`. New collection = additive.
- **Rotation:** every `/refresh` issues a new pair and marks the old record `replacedByHash`.
  **Reuse detection:** presenting an already-replaced token means it was stolen or the app lost
  its write — revoke every token for that `deviceId` and return `SESSION_EXPIRED` so the app
  goes to login.
- **Revocation on logout:** `POST /auth/mobile/logout` sets `revokedAt` on the presented refresh
  token. The access token keeps working for up to 15 minutes; that is the accepted trade-off of
  stateless access tokens and the reason the TTL is short.
- **Revocation on password change and account deactivation:** `revokeAllRefreshTokens(userId)`
  called from `changeOwnPassword`, the admin password-reset path, and the deactivate path. These
  are one-line additions inside existing functions that change nothing about their existing
  behaviour or responses (the web has no refresh tokens to revoke; the call is a no-op for it).
- **A refresh token is never accepted as a session credential** and an access token is never
  accepted by `/refresh` — the two are different formats, so there is nothing to confuse.

**d. What happens to an existing web session: nothing.** The cookie branch runs first and is
unchanged; `JWT_EXPIRES_IN` still governs web token life; login, logout and 2FA on the web keep
their routes, cookies and response bodies. A user logged in on the web today stays logged in
through the deploy.

**Effort: 2–3 days** — model, service (issue/rotate/revoke/reuse-detect), four controllers and
routes, the two-line middleware change, ~25 tests (Bearer accepted; cookie still preferred when
both present; refresh rotates; reuse revokes the device; logout revokes; password change revokes
all; web login/logout/2FA tests unchanged and green).

---

## 2. FCM push, alongside Web Push (VAPID)

### 2.1 What the code does today

- `PushSubscription` is a Web Push record: `userId`, `endpoint` (**required, unique**), `keys.p256dh`
  and `keys.auth` (**both required**), `isActive`. Registered by `POST /notifications/subscribe`,
  whose validator requires all of them.
- `createNotification` writes the `Notification`, then loads every active `PushSubscription` for
  the user and calls `attemptPush` per row → `webPush.sendNotification`. A 404/410 from the push
  service deactivates the row. Callers (Leads, Attendance, Leave, …) never touch push directly.
- Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — all present in Vercel production.

### 2.2 Storage — recommendation: a **separate collection**, `DeviceToken`

Extending `PushSubscription` with a `transport` field was the first idea and it fails the
constraint: an FCM registration has a token and no `endpoint`/`keys`, so `keys.p256dh`,
`keys.auth` and `endpoint` would have to stop being `required` — that is a change to existing
model fields, and a `unique` index on `endpoint` that FCM rows would leave null would need
`sparse` added. Beyond the constraint, the two are different things with different lifecycles:
FCM tokens rotate silently on the device and must be refreshed by the app; their invalidation
signal is an error *code* (`messaging/registration-token-not-registered`), not an HTTP status; and
their payload is FCM's `notification`/`data` envelope, not a JSON blob for a service worker.

`DeviceToken`: `userId`, `token` (unique), `transport: "fcm"` (enum, room for `"apns"` later),
`platform: "android"`, `deviceId` (the same app-generated id as the refresh token — so logout can
find both), `appVersion`, `isActive`, `lastSeenAt`. Timestamps.

### 2.3 One send helper

`services/push.service.js#dispatchPush(userId, payload)`:

1. `PushSubscription.find({ userId, isActive: true })` → the **existing** `attemptPush`, unchanged.
2. `DeviceToken.find({ userId, isActive: true })` → new `attemptFcm`: `firebase-admin`'s
   `messaging().send({ token, notification: { title, body }, data: { type, relatedEntity… } })`.
   `messaging/registration-token-not-registered` and `messaging/invalid-argument` → `isActive:
   false`, mirroring the web path. Never throws.
3. Both lists in one `Promise.all`; the caller gets nothing back it did not get before.

`createNotification` swaps its inline loop for the one call. That is the single touch to an
existing function, and the web-push branch inside it is the same code moved, not rewritten — the
existing push tests keep passing against it. Callers are untouched.

New routes beside the web ones: `POST /notifications/devices` (register `{ token, platform,
deviceId, appVersion }` — re-registering an existing token re-activates it and refreshes
`lastSeenAt`, the same idempotent behaviour `subscribe` has for an endpoint), and
`DELETE /notifications/devices/:token` (called by the app on logout, and by
`/auth/mobile/logout` via `deviceId`).

### 2.4 Env vars FCM needs

Using the Firebase Admin SDK with a service account (the HTTP v1 API; the legacy server key is
deprecated), and no file path because Vercel has no filesystem for one:

| Var | What |
|---|---|
| `FIREBASE_PROJECT_ID` | from the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | from the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | from the service-account JSON; contains literal `\n` — must be unescaped on read (`replace(/\\n/g, "\n")`), which is the one Vercel gotcha to write down |

Added to `env.js`'s required list **only when** `FCM_ENABLED=true` (a fourth var), so a
deployment without Firebase configured boots exactly as today; `dispatchPush` skips the FCM branch
when disabled. New dependency: `firebase-admin`. The app side (`google-services.json`) is not
backend and not in this plan.

### 2.5 Note only — web push is not functioning today

Per the brief, `VITE_VAPID_PUBLIC_KEY` is **unset** in the frontend's Vercel production
environment, so `PushNotificationToggle` renders its "not configured" state and no browser can
subscribe. **I could not verify this independently** — the frontend Vercel project is not linked
in this checkout (`vercel env ls` refuses) — so it is carried here as reported. Not fixed, not in
this plan's scope; it does not affect the FCM path.

**Effort: 1–1.5 days** of code — model, `push.service.js`, `attemptFcm`, two routes and
validators, env gating, ~12 tests (dispatch calls both transports; FCM invalid token deactivates;
web-push behaviour unchanged with `FCM_ENABLED` off; register is idempotent). Plus Firebase
project setup, which is outside the repo.

---

## 3. Batched location pings + accuracy

**Status: BUILT — commit `c949c71` (2026-09-21).** `POST /location/pings` accepts `{ pings: [...] }`
(cap 500) beside the unchanged single form; §3.4's faithful reading is the one built (a ping is
accepted into any of that user's shifts covering its `capturedAt`, closed shifts included; the
single form keeps its literal rule); `clientPingId` is unique per employee through a **partial**
unique index (a sparse compound index would still collide web pings on `null`); `coords.accuracy`
persists on pings and on `checkIn`/`checkOut`; the geofence skips fixes worse than
`GEOFENCE_MAX_ACCURACY_METERS` (default 100) and tests `distance − accuracy > radius`; TTL stays
on `createdAt` (§3.5, up to 47 days after capture for a late batch). 19 tests; the existing 34
location tests untouched.

### 3.1 What the code does today

- `POST /location/pings` takes **one** `{ coords: { lat, lng }, capturedAt }`; `validatePingInput`
  reads `req.body.coords` directly, so an array body fails with 400 before reaching the service.
- `submitPing` requires an **open** attendance record for the requesting user *at upload time*
  (409 otherwise), creates the `LocationPing`, then runs `applyGeofenceCheck` against
  `checkIn.coords` with `GEOFENCE_RADIUS_METERS` (default 500) — a fix is a violation when its
  distance exceeds the radius, full stop.
- `LocationPing`: `employeeId`, `attendanceId`, `coords.lat/lng`, `capturedAt`; TTL index on
  **`createdAt`**, 45 days. No uniqueness, no client id — a retried request creates a second
  document.
- `coords.accuracy` is not captured anywhere: not on the ping, not on `Attendance.checkIn/checkOut`.

### 3.2 Accept an array — same route, new branch, single form untouched

The request body gains a second accepted shape:

```
{ pings: [ { clientPingId, coords: { lat, lng, accuracy? }, capturedAt }, … ] }   // NEW
{ coords: { lat, lng, accuracy? }, capturedAt }                                  // unchanged
```

An envelope (`{ pings }`) rather than a bare array, so a batch can carry metadata later
(`batchId`, `appVersion`) without another shape change. `validatePingInput` branches on
`Array.isArray(req.body.pings)`: the batch branch validates each element with the **same**
`validateCoords`/`capturedAt` rules and caps the batch (`MAX_PING_BATCH = 500`, 400 above it);
the existing branch is the existing code. The single form keeps returning the created ping; the
batch form returns `{ accepted, duplicates, rejected: [{ index, reason }] }` — a partial failure
is a 200 with a report, because "3 of 200 rejected" is normal for a phone that was offline
across a check-out and the app must not re-send the whole batch on a 4xx.

The web frontend only ever sends the single form (`useCheckedInHeartbeatLoop#sendPing`), so its
path is unchanged.

### 3.3 Idempotency — the app WILL retry, and a retry must not multiply documents

- **`clientPingId`** — a UUID minted by the app per captured fix, stored on `LocationPing`.
  **Required in the batch form, optional in the single form** (the web sends none; existing
  documents have none).
- **Sparse unique index** `{ employeeId: 1, clientPingId: 1 }`. Sparse, so the existing
  documents and every future web ping (no id) are unaffected — additive.
- Batch insert with `insertMany(docs, { ordered: false })`; `E11000` errors are counted as
  `duplicates`, not failures. A batch retried after a timeout therefore inserts zero new rows and
  reports them all as duplicates — which is the point.
- Not planned: a natural-key index on `{ attendanceId, capturedAt }`. Two genuine fixes can share
  a second; the client id is the honest key.

### 3.4 The open-shift requirement — applies, with the one judgement call in this plan

The invariant the rule protects is *tracking only happens during a shift*. A batch changes
**when** the server sees a ping, not when it was captured, and that exposes two readings:

- **Literal — "the user has an open shift at upload time":** a phone that lost signal at 10:00,
  regained it at 12:40 after the employee checked out at 12:30, uploads a batch whose every ping
  was captured during the shift — and the literal rule rejects all of them. That discards the
  exact data batching exists to preserve.
- **Faithful — "each ping's `capturedAt` falls inside a shift of this user":** resolve, per ping,
  the attendance record where `checkIn.time ≤ capturedAt` and (`checkOut.time` is null or
  `≥ capturedAt`); attach it as `attendanceId`; reject pings that match no shift (`rejected`, reason
  `no shift at capturedAt`). The invariant holds exactly, late uploads survive, and a ping can
  never be attributed to a shift it was not captured in.

**The plan recommends the faithful reading and asks for a yes on it before build.** The single
form keeps the literal rule unchanged (it is a live ping; "now" is its capture time). Two small
bounds go with it: reject `capturedAt` in the future by more than a minute, and older than the
TTL (nothing that old could be stored anyway).

Geofence for a batch: `applyGeofenceCheck(attendance, coords, capturedAt)` per ping, in
`capturedAt` order — the function already takes the timestamp as a parameter, so violation
windows land where the employee actually was, not at upload time. `lastHeartbeatAt` is **not**
bumped by a batch; it means "device reached us", and it did not.

### 3.5 TTL — unchanged, with one nuance worth writing down

The index is on `createdAt` (server receipt). A batch uploaded two days after capture is purged
45 days after **upload**, so those documents live up to 47 days after capture. That is the existing
rule applied unchanged, and it is fine — the cap exists to bound storage, not to guarantee a
capture-relative window. Not planned: re-keying the TTL on `capturedAt` (that would change the
existing documents' expiry and is not additive).

### 3.6 Accuracy

- **Store it:** `coords.accuracy` — optional `Number`, metres, `min: 0` — added to `LocationPing`
  and to `Attendance.checkIn.coords` / `checkOut.coords`. New optional subfield on existing
  sub-documents: additive; existing documents simply lack it. Validation (`validateCoords`, shared
  by ping and check-in/out) accepts it when present. The multipart check-in path already parses
  `coords` from a JSON string; nothing changes there.
- **Use it in the geofence check — only when present.** Today a 2 km fix 600 m from the site and
  a 5 m fix 600 m out are the same violation. Two additions to `applyGeofenceCheck`, both no-ops
  when `accuracy` is undefined (which is every web ping, so the web path is unchanged):
  1. `GEOFENCE_MAX_ACCURACY_METERS` (new env, default 100): a fix less precise than this is
     **not evaluated** — it cannot say where the person is.
  2. Breach test becomes `distance − accuracy > radius`: the nearest position consistent with the
     fix must itself be outside the fence. A 60 m-accurate fix 520 m out is *not* a breach; a 5 m
     fix 520 m out is.
- **Responses:** wherever `coords` is returned (live map entries, history pings and endpoints,
  team attendance for a viewer with `view_location`), `accuracy` rides inside the same `coords`
  object when stored. An added optional field, never a changed one; `applyVisibilityRules` strips
  `coords` wholesale for viewers without the grant, so nothing new leaks.

**Effort: ~2 days** — validator branch, batch service (shift resolution, insertMany, geofence per
ping, report), sparse index, two schema fields, geofence gating, ~20 tests (single form byte-for-byte
unchanged; batch of N inserts N; retry inserts 0 and reports N duplicates; ping outside any shift
rejected with index; late upload after check-out accepted under the faithful rule; accuracy over
the max skips evaluation; `distance − accuracy` rule; web ping with no accuracy behaves as before;
TTL index still present).

---

## Anything that cannot be done additively

**Nothing in scope.** Checked item by item:

- Bearer branch — reached only when there is no cookie. Additive.
- Mobile auth routes — siblings; the web routes and their bodies are untouched. Additive.
- Refresh tokens — new collection; the revoke-all calls added inside password-change/deactivate
  are no-ops for web users. Additive.
- `DeviceToken` — new collection, chosen precisely because extending `PushSubscription` was not.
- `dispatchPush` — the existing web-push loop moves into it unchanged; callers unchanged.
- Batch pings — a second body shape on the same route; the first is untouched.
- `clientPingId` + sparse unique index — invisible to documents without the field.
- `coords.accuracy` — optional subfield; geofence changes gate on its presence.

Two things are deliberately **not** proposed because they would not be additive: re-keying the
ping TTL on `capturedAt` (§3.5), and folding FCM into `PushSubscription` (§2.2).

## Effort summary

| Item | Estimate | Needs a decision first |
|---|---|---|
| 1. Bearer + refresh | 2–3 days | no |
| 2. FCM alongside VAPID | 1–1.5 days + Firebase project setup | no |
| 3. Batched pings + accuracy | ~2 days | **yes — §3.4 open-shift reading** |

Build order as specified: 1 → 2 → 3. Item 3 does not depend on 1 or 2, but a batch upload from a
device is only testable end-to-end once the device can authenticate.

## Not in scope — tracked separately

- **The React Native app itself** — every screen, the local ping queue, `google-services.json`,
  secure token storage on the device.
- **The consent flow** for location and photo capture — still outstanding, still ahead of any
  further location work, unchanged by this plan.
- **The dev/prod database split** — the local backend still points at the production Atlas
  cluster; every verification in this repo's recent history has had to clean up after itself for
  that reason.
- The CARTO basemap "API KEY REQUIRED" watermark and the unset `VITE_VAPID_PUBLIC_KEY` — both
  observed, both reported, neither part of this plan.
