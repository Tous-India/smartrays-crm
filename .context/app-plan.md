# Smartrays CRM — React Native Android app plan (2026-09-19)

**Status (2026-10-22): phases 1–5 of §6 built, verified on the emulator (Pixel 8, Android 17)
against the local backend; phase 6 (store) not started.** Employee and manager only. No physical
device run yet — see §5 item 9.

| Phase (§6) | State |
|---|---|
| 1 — Foundation | **Built, verified.** Sign-in + 2FA + remember-device, per-role navigation, keychain tokens, silent refresh, profile, FCM registration and tap routing. **Not built:** the in-app notifications list (`GET /notifications`). |
| 2 — Shift core | **Built, verified.** Camera check-in/out, the native Kotlin foreground service with its own SQLite queue and batch flush (§1.3, `final-plan.md` §7.73), OEM battery screen, prominent disclosure with consent recorded on the server (app `8a316f7`, backend `1c05581`, web `852a7ff`), reboot receiver and server re-check (app `2bbfb86`), tracking stop on a long-open shift (`final-plan.md` §7.74). |
| 3 — Employee self-service | **Built, verified:** leave (balance, apply, my requests), attendance history, payslips. **Not built:** the offline read cache and the offline leave draft (§3.3) — offline, actions stay visible and disabled with *No connection*. |
| 4 — Manager layer | **Built, verified.** Team tab: Today, Map, Services, Leave. |
| 5 — Tasks | **Built, verified.** My Services (To Do / Completed) and the manager's create/assign — on the Services module (`final-plan.md` §7.72). |
| 6 — Store | **Not started.** Needs the privacy policy (§4.3) first. |

Builds on `.context/mobile-backend-plan.md` (bearer auth + refresh, FCM, batched pings with
accuracy) — those three are assumed, not re-planned. `final-plan.md` carries one cross-reference
line to this file and nothing more.

## Rule on where things live

**Business rules live in `final-plan.md` only.** This document describes *screens* and
*app-specific concerns* and points at the section that owns each rule. It restates no rule. Where
a screen depends on a rule, the pointer is the rule:

| Rule | Owner in `final-plan.md` |
|---|---|
| Roles, permission matrix, own/team/all tiers | §5, §7.12, §7.41 |
| Leave policy, balance, approval, the monthly free day | §7.5, §7.56 |
| Payroll calculation, pay-run states, payslip | §7.7, §7.53, §7.54, §7.57 |
| Check-in/out, breaks, heartbeat, connectivity gaps | §6.5, §7.4, §7.4c, §7.33, §7.36 |
| Live tracking, ping cadence, staleness, geofence | §7.4b, §7.4b addendum, §7.67, §7.68, §7.71 |
| Retention — pings (45 days), photos, attendance records | §6.5 addendum, §7.4c, §7.68 |
| Photo access (authenticated delivery, signed URLs) | §7.69 |
| Two-factor, remember-this-device | §7.38, §7.38b, §7.40 |
| Bearer/refresh, FCM, batched pings, accuracy | `mobile-backend-plan.md` §1–§3 |

If a screen below seems to describe a rule, read it as "the screen shows whatever that section
says" — the section wins.

## Scope decision — employee and manager only

Admin and sales-associate parity is **out**, deliberately. Almost everything an admin does in this
CRM is a wide table with money in it: pay-run review (11 columns, 1145px by measurement), the
permissions matrix, payments with audit trails, reports and exports, user management. Those
belong on a desk. A phone version would be a worse tool for the same job, and the web app already
exists for it. Sales-associate work (leads pipeline, customer wizards) is table- and form-heavy in
the same way and is not what the phone is for.

The phone is for the two things a desk cannot do: **be at the site** (check in with a photo,
track the shift, work offline) and **be reachable** (push, approve a leave request from wherever
you are). That is the employee app, plus the manager layer over their own team.

---

## 1. Employee app

### 1.0 Sign in

- Email + password → `POST /auth/mobile/login` (backend plan §1.3b). If the response carries
  `requiresTwoFactor`, a **TOTP screen** (6 digits, or a recovery code) → `POST /auth/mobile/2fa/verify`
  with the pre-auth token as Bearer. "Remember this device" is a checkbox on that screen; the
  returned trusted-device token is stored (§3.2) and sent as `X-Trusted-Device` on later logins.
- 2FA **enrolment and disabling stay on the web.** The app consumes a second factor; it does not
  manage one. Reasoning: §7.38b's opt-in flow is a settings task, not a field task.
- Forgot password: opens the web reset page in the browser. Not re-implemented.

### 1.1 Home — today's shift card

The first screen after sign-in, and the one an employee sees most.

- State comes from `GET /attendance/me?month=<current>` — the same source the web header uses to
  derive "am I checked in" (§7.71 explains why the app must derive tracking state from this and
  nothing else).
- Shows: checked-in-since and elapsed; break state; **tracking status** — one of *Active*
  (foreground service running, last upload N min ago), *Queued* (offline, N fixes waiting),
  *Paused by the system* (§1.4 — with the fix-it action), *Not tracking* (not checked in).
- Actions: **Check in** / **Break** / **Resume** / **Check out** — the same state machine the web's
  header control renders; which are enabled is decided by the record, the section that owns it is
  §7.4c.

### 1.2 Check in / check out — live camera photo + coords

- **Photo:** the in-app camera, front-facing by default, capture only — **no gallery picker**. The
  photo's purpose (§7.4) is proof of presence; a gallery would defeat it. Sent as multipart
  (`photo` file + `coords` JSON string), which `POST /attendance/check-in` and `/check-out`
  already accept — no backend change.
- **Coords:** one fresh fix with a hard timeout; `accuracy` sent alongside `lat`/`lng` (backend
  plan §3.6). If the best fix in 20 s is worse than the app's own threshold, the screen says so and
  offers *Try again* / *Check in anyway* — the server records what it gets and the geofence rule
  in §7.4b decides what it means.
- **Permission denial handling — each permission, each outcome:**

  | Permission | Denied once | Denied permanently ("don't ask again") |
  |---|---|---|
  | Camera | explain, re-ask | screen explains the photo is required and deep-links to app settings; check-in stays blocked |
  | Location (fine, while-in-use) | explain, re-ask | same pattern; check-in blocked |
  | Background location ("all the time") | **not needed to check in** — tracking degrades (§1.3); the shift card shows *Tracking will stop when the app closes* with the fix-it action | same, permanently shown |
  | Notifications (Android 13+) | foreground service still runs; the persistent notification shows regardless (the OS exempts it) — push (§3.4) does not | same |

  Check-in **must be online** — it uploads a photo and the server has to accept it. There is no
  offline check-in queue; the button is disabled offline with the reason shown. Check-out the same.

### 1.3 Background location while checked in

The single hardest thing in this app, and the reason it is a bare React Native project with a
native module rather than an Expo-Go project.

- **Mechanism:** an Android **foreground service** of type `location`
  (`FOREGROUND_SERVICE_LOCATION` on Android 14+), started at check-in and stopped at check-out.
  It requests fixes on the cadence from `GET /location/config` and hands each to the offline
  queue (§1.5). A **persistent notification** ("Smartrays — tracking your shift · Checked in
  3h 12m") is mandatory for a foreground service and is also the honest signal to the employee
  that tracking is on. Tapping it opens the shift card.
- **Recommended library:** `react-native-background-geolocation` (Transistorsoft). It owns the
  foreground service, motion-based duty cycling, the OEM quirks in §1.4, and a built-in SQLite
  queue with batch sync — which maps onto the backend's batch endpoint directly. It requires a
  **commercial licence for Android release builds**; that is a purchase to record as a
  prerequisite. The alternative is a hand-written Kotlin service + `react-native-background-actions`,
  roughly two extra weeks and every OEM lesson learned the hard way.
- **Behaviour by situation:**

  | Situation | What happens |
  |---|---|
  | Screen locked | service keeps running; fixes continue at cadence |
  | App swiped from recents | service **survives on stock Android**; on several OEMs it is killed unless the app is whitelisted (§1.4) |
  | App force-stopped from settings | service dies and **cannot restart itself** — Android forbids it. The next app open re-checks the shift and restarts tracking; the gap is recorded server-side as a connectivity gap (§6.5) and shows on the manager's map as *silent* (§7.68) |
  | Device reboot | a `BOOT_COMPLETED` receiver reads a locally-persisted "shift open" flag, confirms against `GET /attendance/me` once network is up, and restarts the service if the shift is still open |
  | Battery saver on | fixes may thin out; the app shows *Tracking may be reduced* on the shift card |
  | Network lost | tracking continues; fixes queue (§1.5) |
  | Token expires mid-shift | §3.2 |
  | Check-out | service stops, notification clears, final queue flush |

- **What the app can't promise:** when the OS kills the process, nothing ends the shift and
  nothing tells the server. That case is exactly what the *silent* warning on the Live Map
  represents (§7.68, confirmed §7.71). The app's job is to make it rare (§1.4) and visible.

### 1.4 OEM battery-optimisation handling

Xiaomi (MIUI/HyperOS), Oppo/Realme (ColorOS), Vivo (FuntouchOS/OriginOS), and to a lesser degree
Samsung and Huawei, kill background services that stock Android would keep. Each has its own
switch, its own name for it, and its own settings screen. Reference: dontkillmyapp.com — the app's
per-OEM copy is maintained against it.

- **Detection:** `Build.MANUFACTURER` / `Build.BRAND` for the OEM; `PowerManager
  .isIgnoringBatteryOptimizations()` for the standard Doze exemption; for the OEM-specific
  autostart switches there is **no API to read the state** — the app can only open the right
  settings screen and ask.
- **When it appears:** a one-time **"Keep tracking alive on this phone"** screen right after the
  first successful check-in on a flagged OEM (not before — an employee who has never tracked a
  shift has no reason to care yet). It lists the steps for that specific OEM with the exact menu
  names, one *Open settings* button per step (the known OEM intents; falls back to app info when
  an intent is missing on that firmware version), and a *Done* that records the date.
- **Re-prompting:** the server already knows when tracking failed — a shift whose heartbeat kept
  arriving but whose pings did not, or a long connectivity gap. If the last completed shift had
  one and the OEM is flagged, the shift card shows a *Tracking stopped last shift — check your
  battery settings* banner linking back to the same screen. Never more than once per shift.
- **What the user is asked:** to (1) exempt the app from battery optimisation (the standard
  dialog), (2) enable autostart / allow background activity in the OEM's own screen, and (3) lock
  the app in recents where the OEM supports it. Each step says why in one line. None is enforced —
  the app cannot verify them — but the manager's map shows the result.

### 1.5 Offline queue

- Every fix is written locally first — SQLite via the tracking library, with a `clientPingId`
  (UUID) minted at capture, `capturedAt`, `lat`, `lng`, `accuracy`. Upload is a separate concern.
- **Flush** when connectivity returns and every cadence tick while online: `POST /location/pings`
  with `{ pings: [...] }` (backend plan §3.2), batches capped at the server's limit, oldest first.
  Rows are deleted locally only on a 200; `duplicates` in the response count as delivered;
  `rejected` rows are dropped with the reason logged (typically *no shift at capturedAt* — the
  employee checked out before the batch went up, backend plan §3.4).
- **Retry:** exponential backoff on network failure, capped; a 401 stops flushing until §3.2
  resolves it; a 409 on the single form is not used here — batches never 409.
- **Cap:** the local queue keeps at most the TTL window of fixes (§6.5 addendum); anything older
  is dropped unsent, since the server would purge it on arrival anyway.
- The queue survives app restarts and reboots; it is the same store the foreground service
  writes to.

### 1.6 The rest of the employee screens

| Screen | Backing endpoint(s) | Notes |
|---|---|---|
| **My services / tasks** | *none yet* — the Services module is **unbuilt** (audit 2026-09-19) | Two lists, *To do* / *Completed*, mark-complete. Screen is planned; it ships when the module does (§5) |
| **Leave** — balance, apply, my requests | `GET /leave/balance`, `POST /leave/request`, `GET /leave?scope=own`, `DELETE /leave/:id` | Balance and statuses render whatever §7.5 says; the app adds nothing |
| **Attendance history** | `GET /attendance/me?month=` | Month picker, one row per day; tap → that day (times, breaks, gaps). Own photos/coords are never shown — §7.4c's own-record rule, enforced server-side |
| **Payslip** | `GET /payroll/:id/payslip` (own, self-scoped `payroll.view`) | List by month, PDF-style detail; figures are the calculator's (§7.53) |
| **Profile** | `GET /auth/me`, `PATCH /users/me`, `GET /users/me/permissions` | View; edit only the fields §7.0b lets a user edit about themselves. 2FA management: web (§1.0) |
| **Notifications** | `GET /notifications`, `PATCH /notifications/:id/read`, `/read-all` | In-app list; push delivery is §3.4 |

---

## 2. Manager layer

A manager **checks in too** — everything in §1 applies unchanged. On top:

| Screen | Backing endpoint(s) | Notes |
|---|---|---|
| **Team live map** | `GET /location/live` → `{ entries, unlocatable, openShiftCount }` (§7.68) | The three states the web renders: nobody on shift / on shift but silent (named, with duration — the amber list) / markers. Trails: `GET /location/history` for one tapped person. Map tiles: same provider decision as the web (§7.66/§7.67 note the CARTO key issue) |
| **Team attendance today** | `GET /attendance/team?month=` filtered client-side to today | Who's in, who's on break, who's not checked in. Photos: only if the manager holds `attendance.view_photos` (§7.4c) — the server decides, the app renders `photoUrl` when present (signed, §7.69) |
| **Create / assign a service** | *none yet* — Services module unbuilt | Assignee picker limited to the manager's own team (the scoping the Services audit specifies) |
| **Team leave requests** | `GET /leave?scope=team`, `PATCH /leave/:id/approve` (approve/decline), `GET /leave/pending-count` | Badge on the tab from the pending count; approve/decline with a reason where §7.5 requires one |

Visibility everywhere is the server's: the app sends the request and renders the answer. It does
not hold a copy of the matrix (§5); it reads `GET /users/me/permissions` once per session to
decide which tabs to show and re-reads it on resume.

---

## 3. App-specific concerns

### 3.1 Navigation structure per role

Bottom tabs, decided at sign-in from `GET /users/me/permissions`:

- **Employee:** Home (shift card) · Tasks · Leave · More (attendance history, payslips, profile,
  notifications).
- **Manager:** Home · Team (live map, today's attendance, leave requests — segmented) · Tasks
  (mine + assign) · Leave · More.

A user whose permissions change mid-session sees the change on next resume (§4.1's "no re-login
needed" applies to the app exactly as to the web). Deep links (§3.4) land on the tab that owns the
entity.

### 3.2 Token storage, and expiry mid-shift

- **Storage:** `react-native-keychain` → Android Keystore-backed. Access token in memory only;
  refresh token and trusted-device token in the keychain; never `AsyncStorage`, never a plain
  file. Cleared on logout together with the device's FCM registration (backend plan §2.3).
- **Mid-shift expiry:** the access token lives 15 minutes (backend plan §1.3c), so it expires
  many times per shift by design. The API client refreshes it **silently** on the first 401 and
  replays the request; the foreground service and the queue flush go through the same client, so
  tracking never notices. Refresh tokens rotate on every use.
- **Refresh fails** (revoked, reuse-detected, 30-day idle): the app keeps **tracking and queuing
  locally** — the fixes are not lost — and shows a persistent *Sign in again to keep uploading*
  notification. On re-login the queue flushes; the server's open-shift rule (backend plan §3.4)
  decides what it accepts. The shift is not ended by the app: it does not know whether the user
  meant to end it.
- **Account deactivated:** the server answers 403 (not `SESSION_EXPIRED`); the app stops
  tracking, clears the queue, signs out, and says why.

### 3.3 With no network at all

- **Works:** the shift card from the last-known record (marked *as of hh:mm*), tracking and
  queuing, reading anything already fetched (cached per screen, last-fetched time shown),
  drafting a leave request (held locally, submitted when online — one draft, not a queue).
- **Does not work, and says so:** check-in, check-out, break in/out (server state changes with a
  photo or a time the server must stamp), approving leave, assigning a task, the live map.
  Buttons stay visible and disabled with *No connection* beneath them — a control that vanishes
  leaves the user wondering what they did wrong (the same reasoning the web's header control
  documents).
- **Never:** invents a check-in time, marks a task complete offline, or shows a stale live map as
  live.

### 3.4 Push notification handling

Registration: on sign-in and on every FCM token refresh → `POST /notifications/devices`
(backend plan §2.3); on sign-out → `DELETE /notifications/devices/:token`.

| App state | Behaviour |
|---|---|
| **Foreground** | no system notification; an in-app banner at the top for ~4 s; the Notifications tab badge and list update; a *leave decision* or *task assigned* also refreshes the relevant screen if it is open |
| **Background** | the system notification, title/body from the FCM `notification` payload; the `data` payload carries `type` and `relatedEntity` |
| **Tapped** | deep-links by `type`: leave request → that request (manager) or my leave (employee); task → that task; attendance events → the shift card; anything else → the Notifications tab. Marks it read via `PATCH /notifications/:id/read` |

The tracking foreground-service notification is a different channel from push and is never
dismissable while tracking is on. Push uses its own channel with the default importance; the
employee can silence it in system settings without affecting tracking.

---

## 4. Play Store requirements

These are review gates, not nice-to-haves. Apps requesting background location are rejected
without them.

### 4.1 Prominent in-app disclosure — required

Shown **before** the OS permission dialog for background location, on its own screen, in the
app's own words, with an explicit accept action. Not a toast, not a settings page, not the
permission dialog itself. Planned wording (final copy to be reviewed with the privacy policy):

> **Smartrays tracks your location during your shift.** While you are checked in, this app
> collects your device's location in the background — including when the app is closed or not in
> use — so your manager can see where the team is and so your attendance record is accurate.
> Tracking starts when you check in and stops when you check out. Your location is kept for 45
> days and then deleted. It is never collected when you are not checked in.
> [ Continue ] [ Not now ]

- **When it appears:** the first time the employee taps *Check in* — once, before the
  while-in-use prompt; the background ("all the time") prompt follows from the same flow on
  Android 10, and on Android 11+ hands off to the system settings page the OS mandates.
- *Not now* leaves check-in available with degraded tracking (§1.2) and re-offers the disclosure
  on the next check-in. It is not a dark pattern: the shift card states plainly that tracking
  stops when the app closes.
- The retention figure in the disclosure is a **quote of §6.5 addendum**, not a second copy of
  the rule; if the rule changes, the copy changes with it.

### 4.2 The background-location declaration form

Play Console requires, for `ACCESS_BACKGROUND_LOCATION`: the feature that needs it, why
foreground-only is insufficient, a **video** showing the disclosure → permission flow and the
feature in use, and a link to the privacy policy. Planned answers: use case *employee time and
location tracking during work shifts, initiated by the employee's own check-in*; foreground-only
is insufficient because the phone is in a pocket at a site, screen off, for hours; the video is
the §4.1 flow followed by a shift on the manager's map. Also declared: `FOREGROUND_SERVICE` and
`FOREGROUND_SERVICE_LOCATION`, with the service type in the manifest (Android 14).

### 4.3 Privacy policy URL — required

There is **no privacy policy today**, on the website or in the repo. One is required in the store
listing, in the declaration form, and linked from the disclosure and the consent flow. It must
state what is collected (location during shifts, check-in/out photos, device push token), why,
retention (pointing at the same figures as §6.5 addendum and §7.4c), and how to request deletion.
Writing it is a prerequisite (§5), not an app task.

### 4.4 The consent flow — BUILT (2026-09-21/22, `final-plan.md` §7.73)

Raised in the 2026-08 location/photo audit and carried as out-of-scope through every location
task since; until 2026-09-21 the only trace was conversation history. Now recorded and built —
the rule and the design live in `final-plan.md` §7.73, this is only the pointer:

- backend `1c05581` — `LocationConsent` (append-only; decision, disclosure version, app version,
  device id), `POST /location/consent`, `GET /location/consent/me`, `GET /location/consent`;
- web `852a7ff` — the latest decision per employee under Attendance → Live Map;
- app `8a316f7` — Continue / Not now on the §4.1 disclosure record the decision on the server
  and cache it; the server's answer is re-read on every sign-in and launch; the disclosure text
  is versioned, and a new version asks everyone again;
- app `2bbfb86` — the reboot receiver from §1.3's table, plus the headless flush re-checking the
  server before it uploads.

What §4.1's disclosure covers is location tracking. **Photo capture at check-in/out has no
consent record of its own** — the audit named both; the privacy policy (§4.3) is where the
photo is disclosed, and whether it also needs a recorded answer is an open question for
whoever owns the policy wording, not something this plan decides.

---

## 5. Prerequisites — explicit

| # | Prerequisite | State | Why it blocks |
|---|---|---|---|
| 1 | **Dev/prod database split** | not done — the local backend points at the production Atlas cluster; every verification this year has had to delete its own records afterwards | the app's development sessions would check in, ping and upload photos against live records daily. Non-negotiable before a single device build |
| 2 | **Consent flow** (§4.4) | **built** — `1c05581`, `852a7ff`, `8a316f7`, `2bbfb86`; `final-plan.md` §7.73 | Play Store review and the honesty of §4.1 |
| 3 | **Bearer auth + refresh** | planned, `mobile-backend-plan.md` §1 | nothing in the app can call the API without it |
| 4 | **FCM push** | planned, `mobile-backend-plan.md` §2 | §3.4; also the launch-time reason to open the app |
| 5 | **Batched pings + accuracy** | planned, `mobile-backend-plan.md` §3 | §1.5 has nothing to flush to without it; §1.2 sends accuracy for nothing |
| 6 | **Services module** | **built** — `final-plan.md` §7.72 (2026-09-19) | the Tasks tab on both roles and the manager's assign screen |
| 7 | **Privacy policy URL** (§4.3) | none exists | store listing, declaration form, disclosure link |
| 8 | Firebase project + `google-services.json` | **done** — FCM verified end to end 2026-09-22 (`mobile-backend-plan.md` §2); `google-services.json` is gitignored and restored on each machine | §3.4 |
| 9 | **Does the free tracking engine survive OEM battery managers over a full shift?** | **open** — verified on the emulator only; needs real Xiaomi, Oppo/Realme, Vivo and Samsung devices through a whole shift | §1.3, §1.4. No licence is needed: the paid Transistorsoft SDK was considered and **rejected**; the app runs its own native Kotlin foreground service with its own SQLite queue (`final-plan.md` §7.73). If that engine does not survive, revisiting the paid SDK (~$399, perpetual, one app) is the fallback |

1 and 2 are independent of the app and should start first; 3–5 are the backend plan in its stated
order; 6 can run in parallel with the app's early phases; 7 needs whoever owns the company's
legal wording.

---

## 6. Phased build order

Single React Native developer; the estimates assume prerequisites 1, 3 and 4 are done before
Phase 1 starts and 5 before Phase 2.

| Phase | Contents | Effort |
|---|---|---|
| **0 — Prerequisites** | §5 items 1–5, 7, 8 | backend plan: ~6–7 days; DB split, consent flow, policy: separate tracks |
| **1 — Foundation** | bare RN project, navigation shell per role, keychain token storage, API client with silent refresh, sign-in + 2FA + remember-device, profile, notifications list, FCM registration and tap-routing | 2 weeks |
| **2 — Shift core** | shift card, camera check-in/out with permissions handling, foreground-service tracking, persistent notification, reboot receiver, offline queue + batch flush, OEM battery screen, prominent disclosure (§4.1) | **3–4 weeks** — the risk sits here; budget a device matrix of at least Xiaomi, Oppo/Realme, Vivo, Samsung and one stock Pixel |
| **3 — Employee self-service** | leave (balance, apply, status), attendance history, payslips, offline read cache | 1.5 weeks |
| **4 — Manager layer** | team live map with the three states, team attendance today, team leave approve/decline with badge | 1.5–2 weeks |
| **5 — Tasks** | employee To do / Completed, manager create/assign — **only once the Services module exists** | 1 week, after prerequisite 6 |
| **6 — Store** | declaration form + video, listing, privacy policy link, internal → closed testing tracks, review lead time (typically 1–2 weeks and often a second round for background location) | 1–2 weeks elapsed |

Roughly **10–13 weeks** of app work end to end, plus prerequisite tracks. Phase 2 is the one to
protect: everything else is forms over existing endpoints.

---

## 7. Not in scope, and why

- **Admin and sales-associate features** — the scope decision above: wide tables and money belong
  on a desk, and the web app is that desk.
- **iOS** — Android only, as briefed. iOS background location has different rules (no foreground
  service; `Always` authorisation with its own disclosure) and would be its own plan.
- **2FA enrolment/disable, password change, trusted-device management** — settings tasks; web.
- **Offline check-in/check-out** — a check-in is a server event with a photo; queuing it would
  let the app invent an attendance time. Tracking is queued; state changes are not.
- **A local copy of the permission matrix** — the app asks the server what it may do (§3.1) and
  never decides for itself.
- **Business rules of any kind** — leave policy, payroll, geofence thresholds, retention, photo
  visibility. They live in `final-plan.md`; this document only points at them.
- **The three backend items** — planned in `mobile-backend-plan.md`, assumed here, not repeated.
