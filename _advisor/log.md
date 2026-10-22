# Log

One section per instruction number, append-only. Format and protocol: `_advisor/README.md`.

## Instruction #1 — Overnight build brief
Started: 2026-10-22 17:40 IST
Status: in progress (this section is updated as work proceeds; the final report is at the end)

### Progress
- 17:35 Stopped the local backend: it was still connected to the PRODUCTION cluster from the
  earlier "run it locally" request. Nothing connects to production from here on.
- 17:38 `backend/.env.local` now points `MONGODB_URI` at `mongodb://127.0.0.1:27017/smartrays_dev`
  (one key edited in place; no values displayed). `backend/.env` still holds the Vercel pull and
  is overridden by `.env.local`; the startup guard below makes a fallback to it impossible.
- 17:40 Machine check: no Docker; not an administrator; 7.7 GB RAM; Windows Hypervisor Platform
  not active (HypervisorPresent=False) — see "Blocked" for what this means for the emulator.

### Phase 1 — Local database: DONE (18:00)
- **Local MongoDB 8.0.17** (Community Server zip, checksum verified, no installer/admin needed) at
  `D:\Tools\mongodb`, data in `D:\Tools\mongodb-data`, bound to 127.0.0.1:27017 only.
  It runs as a background process of this session; to start it yourself:
  `D:\Tools\mongodb\bin\mongod.exe --dbpath D:\Tools\mongodb-data --bind_ip 127.0.0.1 --port 27017`
- **Startup guard** `4b2eae4`: outside production, `connectDatabase()` refuses any non-localhost
  `MONGODB_URI` unless `ALLOW_REMOTE_DB=true`. Covers server, Vercel entry and every script.
  20 tests, all failing before the guard existed; end-to-end check refuses in 1 ms, before any
  connection attempt. Error message never contains the URI.
- **Seed** `ae71fab`: `npm run seed:demo -- --reset` — 9 fake accounts (admin Arjun Mehra;
  managers Neha Arora / Sandeep Rana; 3 field employees each), 2 teams, 21 leads (3 per stage),
  8 Delhi NCR customers with contacts, contracts, owner + project manager, 13 payments,
  10 services with subtasks, 6 leave requests (approved / pending / rejected / half day),
  198 attendance days + 21,486 pings over 30 days; 3 people on shift now. Password `Demo@1234`
  for all, emails `@demo.smartrays.test`. Refuses non-local databases even with ALLOW_REMOTE_DB.
- Verified in real Chrome (Playwright driving the installed Chrome): demo admin signs in;
  dashboard and attendance render at 1280 and 390 with no console errors and no sideways scroll.

### Test-suite fixes found on the way (18:10)
- `cf46312` Backend tests read the developer's `.env.local` (dotenv `override: true` ran under
  Vitest): 11 lead-intake tests failed here, and test runs loaded real keys. Now hermetic.
- `46496fd` Frontend push tests read `VITE_VAPID_PUBLIC_KEY` from the local env; now stub their own.
- Baseline before any of my changes: backend 1150/1161 (the 11 above). After: backend **1191/1191**.

### Phase 5 — project stages design: DONE (18:05, `13e153d`)
`.context/project-stages-plan.md` — design only. Its §9 holds **15 questions for you**
(payment split, subsidy pricing, DISCOM paperwork owner, PM Surya Ghar filing, WhatsApp budget, …).

### Phase 2 — Customer complaint link: web + backend DONE and verified (18:30); app next
**Reused** from the Tickets backend: the Ticket model (customer, assignee, status, history,
comments), `PATCH /tickets/:id/status`, `/assign`, `/comments`, the scope rules (admin/manager see
all, employees see assigned) and the existing assignment push. **Added**: complaint fields on
Ticket (number, source, callback time, private photos, acknowledged/resolved times, escalation
record), a per-customer link, public endpoints, routing, escalation, daily summary, ticket detail.
No permission templates changed.

What the owner gets:
- **Link**: "Complaint link" on each customer page and each row of the customers table. One click
  copies it and offers **Share on WhatsApp** (free wa.me link, ready English + Hindi message) and
  **Make a new link** (kills the old one).
- **Customer page** `/c/<token>`: name only, four big problem tiles, one text box, up to 3 photos
  (shrunk on the phone before upload), callback time, Hindi lines under each label. Then
  "Complaint no. 1004", and later the same link shows **Received / In progress / Resolved**.
- **Routing**: Billing and Something else → account owner; Not working and Installation → project
  manager; inactive → the other one → admin. Assignee gets a push + bell + sidebar badge. Admin does not.
- **Complaints page** (sidebar): Waiting / In progress / Resolved, overdue first in red; open one →
  one-tap **Call**, the customer's words and photos, **I'm on it** → **Mark resolved**; admin/manager
  can hand it to someone else.
- **Escalation**: not picked up in 4 h → assignee's manager; still not, 4 h later → admins. Not
  resolved in 48 h → same ladder. Admin otherwise gets only one summary a day (from 9 AM IST).
  On Vercel: runs on activity (complaint page, complaint list, the bell's poll) + a daily Vercel Cron
  backstop at 09:00 IST (`/api/v1/tickets/escalations/run`, same credential as attendance cleanup).
  Times are env-configurable (`COMPLAINT_ACKNOWLEDGE_HOURS` / `_RESOLVE_HOURS` / `_ADMIN_AFTER_HOURS`).
- **Security**: 192-bit token stored only as a hash + an encrypted copy; one identical 404 for every
  wrong link; no internal ids in any public response; photos checked by content (JPG/PNG/WebP,
  ≤5 MB, ≤3) and kept private (signed 5-minute links for staff); rate limits in MongoDB (works across
  Vercel instances): 60 page loads / 15 min and 5 complaints / hour per address, 20 / day per link.

Tests: backend 30 new (all failing before), frontend 13 new (failing without the components).
Real-browser run (Chrome, local DB): admin copies link (clipboard checked) → customer on 390 px
raises "Not working" with a photo → No. 1002 → Deepak (project manager) sees it, photo loads, call
button dials the contact, taps I'm on it → customer's page shows "In progress". Escalation: a
complaint aged 5 h → Sandeep (Deepak's manager) alerted, admin not. 0 px sideways scroll at 390.
Screenshots: `_advisor/screenshots/phase2-complaints/`.

**Bug found and fixed** `9241406` (HIGH, likely live): signed-out visitors were redirected from
`/forgot-password` and `/reset-password` to the login page — the emailed password-reset link
could never be used. Reproduced in Chrome, fixed, 3 tests.

**Needs from you / notes**
- Test photos go to the production Cloudinary account (no separate dev account exists); local
  uploads use folder `smartrays-dev/` and I delete each one by id after verifying. A free separate
  Cloudinary account for development would be cleaner — your call.
- Hindi: I added one short Hindi line under each label on the customer page; easy to remove.
- `backend/vercel.json` already had `open-shift-reminders` **hourly**; Vercel's Hobby plan allows
  only daily crons (noted in §7.74). The new complaint cron is daily. Check the plan before deploying.

### Phase 3 — Verified site visits: DONE on backend + web + app (19:05); emulator blocked
**Reused, not duplicated**: a visit **is a Service** (created through `createService` → assignee
check, push, Services list; scope and "only the assignee" from Services — **no new permission
keys**); the geofence test is the attendance rule, moved unchanged into
`geo.service#evaluateFixAgainstFence` (attendance+location tests 199/199); the route is the
existing location pings / history endpoint; photos use the same private-Cloudinary helper as complaints.

What it does:
- **Assign** (web, admin/manager): customer → what for (chips) → who → day → where exactly (the
  customer's saved site, or "Find" the address on OpenStreetMap, or tap the map). The spot is saved
  on the customer. A manager can pick customers their team owns **or project-manages** (the normal
  customer list is by owner only, which showed the installation manager zero customers).
- **App**: on that Service's screen — **I've arrived** → **Take a site photo** (back camera only,
  no gallery) → **Mark visit done** (+ notes). Each press takes a fresh GPS fix; the server accepts
  only inside the site's fence (`VISIT_RADIUS_METERS`, default 200 m; fixes vaguer than ±100 m
  refused), Arrived only during an open shift, photos only if taken in the last 15 min, Done only
  with ≥1 photo. Refusals read like "You are 19.3 km from the site. You can tap Arrived only at the
  site." "Mark complete" can no longer finish a visit's Service from anywhere (server refuses too).
- **Office view** `/visits` (sidebar "Site visits"): one day at a time, problems first, each with one
  word and one sentence — **Verified** (arrived + done at site, route stayed), **Left early** (two
  consecutive pings outside between Arrived and Done, or no Done by end of day), **Not at site**
  (day passed with no Arrived — the app allows Arrived only at the site), **At site now**,
  **Not started**. Opening a visit shows the site circle, that day's route, Arrived/Done/photo points,
  the photos stamped with time and distance, and notes.

Tests: backend 23 (all failing before), web 4, app 7 (all failing without the code). Suites:
backend 1214 / web (complaint+visit+touched files) green / app 156/156.
Real Chrome (local DB): seeded week shows Verified ×4, Left early ("phone left the site at 11:47"),
Not at site (route went to Connaught Place instead of DLF Phase 3), At site, Not started; route
drawn; assigning a visit through the form works for the installation manager; 0 px sideways scroll
at 390. The app's calls run against the local backend as Deepak: photo at site accepted, Done from
Delhi refused ("17.2 km from the site"), Done at site → Verified; web shows the stamped photo.
Screenshots: `_advisor/screenshots/phase3-visits/`.

**Blocked — emulator**: this laptop has no hypervisor enabled (HypervisorPresent=False), I am not an
administrator, and there is no JDK/Android SDK. Running the app needs you (admin) to: install JDK 17
and Android Studio (SDK + emulator), enable "Windows Hypervisor Platform" (Windows Features) and
reboot. RAM is 7.7 GB — an emulator will be tight; a real Android phone over USB is the better
test. All app changes tonight are covered by Jest only.

### Phase 4 — Find and fix issues: DONE (19:45)
Walked every page as **admin** (18 pages), **manager** (13) and **employee** (13), each at 1280 and
390 px in real Chrome, recording console errors, failed API calls and sideways scroll; then
exercised the main actions (complaint flow, visits, pay run, reports PDF/Excel for all 6 modules,
live map/history, new-lead form, leave approval). Admin and manager: **0 console errors, 0 failed
API calls, 0 px sideways scroll on every page.** The app was not walked (no emulator).

| # | Sev | Issue | Status |
|---|---|---|---|
| 1 | HIGH | Signed-out visitors were bounced from `/forgot-password` and `/reset-password` to login — the emailed reset link could not be used (likely live in production) | **Fixed** `9241406` |
| 2 | HIGH | Backend tests read the developer's `.env.local` (11 failures here; real keys loaded in tests) | **Fixed** `cf46312` |
| 3 | HIGH (product) | Managers see customers by **owner** only: the installation manager (whose team are project managers) sees **zero** customers | **Question for you** (Q4) — not changed (permissions) |
| 4 | MED | Payroll "Run payroll" for the **current, unfinished** month pays every day of the month (only marked absences deduct); no warning | **Not changed** (payroll) — recommend a warning |
| 5 | MED | Attendance "Attendance Rate (of 22 working days)" divides the records in view by the month's weekdays — in the org-wide "Today" view 3 people present shows **13.6 %** | **Not changed** (attendance figure) — recommend hiding it unless one person/month is selected |
| 6 | MED | Header check-in / break / check-out were icon-only (meaning only in a hover tooltip) | **Fixed** `d2e1cb6` |
| 7 | MED | Leave Approve/Decline were a bare tick and cross | **Fixed** `defcad5` |
| 8 | MED | Dashboard "Open Tickets" widget pointed nowhere and counted "unassigned" | **Fixed** `eef9ef9` → "Customer complaints": Waiting / Overdue / link |
| 9 | LOW | Employee opening `/payments` by address: uncaught 403 error behind "Not authorized" | **Fixed** `444ac57` |
| 10 | LOW | Employee opening `/customers` by address: two 403 API calls (page itself fine) | Open |
| 11 | LOW | Dates use the browser's locale (`toLocaleString()` in ~20 places): a US-English browser shows 10/23/2026, 1:00:00 PM | Open — one shared en-IN formatter recommended |
| 12 | LOW | Leads page on a phone: 9 "Needs attention" cards before the table | Open |
| 13 | LOW | Frontend tests near the 5 s timeout are flaky on this laptop (customer wizard, lead call log) | Open — raise `testTimeout` |
| 14 | LOW | ESLint `react-hooks/set-state-in-effect` fails across existing hooks (and new code following them) | Open — repo-wide decision |
| 15 | LOW | Unused, end-of-life `mongodb@3.7` dependency in backend `package.json` (nothing imports it) | Open — remove with your OK (changes the lockfile) |
| 16 | INFO | `vercel.json` already had an **hourly** cron; Vercel Hobby allows only daily | Open (deploy-time) |
| 17 | INFO | Live map base layer shows "API KEY REQUIRED" (CARTO) | Left open as you instructed |
| 18 | INFO | Global gotcha: antd's unlayered reset beats Tailwind on `<button>` text colour and `<p>` margins | Worked around in new code; noted |

Test photos uploaded to the production Cloudinary account during verification (3, all under
`smartrays-dev/`) were **deleted by id**; the folder is empty.
