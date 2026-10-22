# Instructions

Newest at the bottom. Each one starts with `## Instruction #N`. Protocol: `_advisor/README.md`.

## Instruction #1 — Overnight build brief (given in chat, 2026-10-22 17:30 IST)

OVERNIGHT BUILD BRIEF — I am away until 10 AM. Work in order. Log progress,
findings and questions in _advisor/log.md as you go. Commit in small pieces.

NEVER WITHOUT MY GO (if blocked, log the question and move to the next item)
- Connecting to the PRODUCTION MongoDB cluster for any reason.
- git push, deploying, or changing Vercel settings.
- Spending money or creating paid accounts.
- Changing payroll, leave or attendance calculation rules.
- Printing the contents of any .env or credentials file.

GUIDING PRINCIPLE: make it easy to use. The users are a busy owner, field
staff on cheap phones, and customers who are not technical. Fewer fields, fewer
clicks, plain language, big tap targets, clear status words. If something is
complex, simplify it rather than document the complexity.

PHASE 1 — LOCAL DATABASE (everything depends on this)
- Set up a local MongoDB (Community Server or Docker). If it can't be installed
  without me, log exactly what is needed and do Phase 3's design work instead.
- backend/.env.local points at localhost ONLY. Add a startup guard: in
  development, refuse to boot if MONGODB_URI is not localhost unless
  ALLOW_REMOTE_DB=true is set explicitly.
- Seed script with realistic FAKE data: admin, 2 managers, 6 field employees in
  2 teams, leads in every stage, customers with contacts/contracts and an
  assigned owner and project manager, payments, services with subtasks, 30 days
  of attendance and pings around Delhi NCR, leave requests. No real people.

PHASE 2 — CUSTOMER COMPLAINT LINK (top priority — build it)
Problem: every sales and technical issue from customers goes to the owner
(admin), even though he has a team. He wants customers to raise complaints
themselves, and the right employee to handle them.
Build:
- A public complaint page, no login needed, reached by a per-customer link that
  can be shared on WhatsApp/SMS. Use an unguessable token in the link. The page
  shows the customer's name only — never any other data.
- Form: what is the problem (Sales/Billing, Technical/Not working,
  Installation, Other), short description, optional photos (size/count limits),
  preferred callback time. Big buttons, works on a cheap phone, Hindi-friendly
  wording optional (log if you think it's needed).
- On submit: create a ticket and ROUTE it automatically —
  Sales/Billing → the customer's owner (account manager);
  Technical/Installation → the customer's project manager.
  If the customer has neither, it goes to the admin.
- The assignee gets a push notification and sees it in the app and web.
- The customer sees a confirmation with a ticket number, and can reopen the
  same link to see the status (Received / In progress / Resolved).
- ESCALATION: if not acknowledged within a configurable time (default 4 hours)
  or not resolved within a configurable time (default 48 hours), notify the
  manager, then the admin. Admin should NOT be notified of every ticket — only
  escalations plus a daily summary. Remember node-cron does not run on Vercel
  serverless: use the same pattern as the shift reminder (check on activity
  plus a daily Vercel cron backstop) and document it.
- Admin page: copy/share the complaint link for any customer in one click.
- Security: rate-limit the public endpoints, validate uploads, never expose
  internal ids, and the token must not reveal anything if guessed wrong.
- Reuse the existing Tickets backend if it fits (its UI was deferred earlier);
  check it first and log what you reused.
- Tests that fail before the change; verify in a real browser and on the
  emulator; screenshots at 390px.

PHASE 3 — VERIFIED SITE VISITS (build it)
Problem: an employee said he went to Delhi for an inspection and was actually
on a family outing. Visits must be verified by the system, not reported.
Visits are ASSIGNED by admin or a manager (decided).
Build:
- A Visit linked to a customer/site with coordinates (pick the location on a
  map or from the customer's address).
- In the app, the employee can tap "Arrived" and "Done" ONLY when the phone is
  inside the site's geofence (radius from config, accuracy-aware geofence logic
  that already exists).
- Site report: live photos taken in the app only, stamped with GPS and time; a
  short notes field.
- Admin/manager view: each visit shows Verified / Not at site / Left early /
  Not started, next to that day's actual route on the map.
- Reuse tracking, pings, geofence and Services — do not duplicate them.
- Same testing standard as Phase 2.

PHASE 4 — FIND AND FIX ISSUES (end to end)
Walk every module as admin, manager and employee: leads, customers, payments,
services, attendance, leave, payroll, live map, location history, reports,
notifications, permissions — web in a real browser, app on the emulator.
Fix real bugs and confusing UI. Log every issue with severity, fixed or not.

PHASE 5 — DESIGN ONLY: installation project stages
Write .context/project-stages-plan.md: survey → design → material → install →
net meter → commissioning → subsidy (PM Surya Ghar / DISCOM), who owns each
stage, what proof each stage needs, payment milestones tied to stages, and
customer WhatsApp updates at each stage. Open questions for me at the end.
Do not build it.

FINAL REPORT in _advisor/log.md: what was built and verified, what is still
broken, questions waiting for me, and what you recommend next.

Follow-up (chat, same evening): keep running while I am away. Work the brief
continuously, do not stop between phases. Every 10 minutes check next.md for a
new instruction (highest "## Instruction #N" not yet logged); a new one takes
priority, then resume the brief. If everything is finished, keep checking
next.md every 10 minutes until 10 AM. If blocked on a question, log it and
continue with the next unblocked item. All "never without my go" rules apply.
