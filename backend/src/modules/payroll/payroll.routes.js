import { Router } from "express";
import ApiError from "../../utils/ApiError.js";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize, requireAdmin } from "../../middlewares/authorize.middleware.js";
import {
  run,
  list,
  payslip,
  monthlyReport,
  periodReview,
  submitForReview,
  approve,
  markPaid,
  createAdjustment,
  cronRun,
  periods,
} from "./payroll.controller.js";
import { validateRunQuery, validateListQuery, validatePayslipQuery } from "./payroll.validation.js";

const payrollRouter = Router();

/**
 * Machine-only pay-run trigger (§7.54) — VERCEL CRON, never node-cron.
 *
 * `node-cron` does not execute on Vercel at all, which is the entire reason
 * payroll has never fired in production: the job was registered and simply
 * never ran. This endpoint is what a Vercel Cron entry calls.
 *
 * Accepts GET as well as POST because Vercel Cron issues GET, and reads
 * `CRON_SECRET` from `process.env` at REQUEST time rather than the import-time
 * `env` snapshot — a serverless invocation can be handed its environment
 * per-request, and reading live keeps the guard independent of module import
 * order. Identical reasoning to /attendance/cleanup, deliberately.
 *
 * 503 when the secret is unset, never "open to everyone". CRON_SECRET is NOT
 * currently set in Vercel production, so this WILL 503 there until it is —
 * which is correct fail-closed behaviour for an endpoint that writes payroll.
 */
function verifyPayrollCronToken(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new ApiError(503, "Payroll cron is not configured");
  }

  const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");

  if (bearer !== cronSecret) {
    throw new ApiError(401, "Invalid or missing cron token");
  }

  next();
}

payrollRouter.post("/cron/run", verifyPayrollCronToken, cronRun);
payrollRouter.get("/cron/run", verifyPayrollCronToken, cronRun);

// Admin-only per §5's matrix — Payroll is the one workforce module where
// Manager gets no grant at all, so this is a plain requireAdmin gate rather
// than a `payroll.run` authorize() check (which would be redundant: only
// admin ever holds that grant anyway). The monthly cron (§7.7 STEP 3) calls
// payroll.service.js#runPayroll directly, bypassing this route/auth layer
// entirely — the same cross-module direct-call pattern used elsewhere.
payrollRouter.post("/run", authenticate, requireAdmin, validateRunQuery, run);

// Permission checked inside listPayroll per the requested ?scope=, not at the
// route level — same reasoning as GET /leave and GET /travel-logs.
/**
 * §7.47 — the monthly leave-and-attendance report. Gated on the EXISTING
 * `payroll.run` key, no new key invented.
 *
 * NOT `payroll.view`, which was the obvious choice and is wrong: `view` means
 * "own payslip only" (§5's matrix) and is in the DEFAULT employee template
 * (permission.service.js). This route returns EVERY employee's base salary in
 * one response, so gating it on `view` would publish the whole company's
 * salaries to every employee. `run` is this module's existing "see everyone's
 * payroll" gate — the same one GET /payroll?scope=all uses, and the registry
 * documents it as such precisely because §5 never gave payroll a view_all
 * tier. Caught by the access test below, which returned 200.
 */
payrollRouter.get("/monthly-report", authenticate, authorize("payroll", "run"), monthlyReport);

/**
 * The pay run's period endpoints (§7.54), all gated on `payroll.run` — the
 * see-everyone tier. NEVER `payroll.view`: that means "own payslip only" and
 * sits in the default employee template, so gating any company-wide action on
 * it would hand every employee the whole company's pay.
 */
payrollRouter.get("/periods", authenticate, authorize("payroll", "run"), periods);
payrollRouter.get("/period/review", authenticate, authorize("payroll", "run"), periodReview);
payrollRouter.post("/period/submit", authenticate, authorize("payroll", "run"), submitForReview);
payrollRouter.post("/period/approve", authenticate, authorize("payroll", "run"), approve);
payrollRouter.post("/period/paid", authenticate, authorize("payroll", "run"), markPaid);
payrollRouter.post("/period/adjustments", authenticate, authorize("payroll", "run"), createAdjustment);

payrollRouter.get("/", authenticate, validateListQuery, list);

// Permission checked inside getPayslip (self-scoped `payroll.view`, or the
// `payroll.run` broad grant) — same self-or-broad-grant shape as
// user.service.js#getUserById, not expressible as a single route middleware.
payrollRouter.get("/:id/payslip", authenticate, validatePayslipQuery, payslip);

export default payrollRouter;
