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
