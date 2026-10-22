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
