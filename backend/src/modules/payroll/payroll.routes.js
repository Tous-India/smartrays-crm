import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize, requireAdmin } from "../../middlewares/authorize.middleware.js";
import { run, list, payslip, monthlyReport } from "./payroll.controller.js";
import { validateRunQuery, validateListQuery, validatePayslipQuery } from "./payroll.validation.js";

const payrollRouter = Router();

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

payrollRouter.get("/", authenticate, validateListQuery, list);

// Permission checked inside getPayslip (self-scoped `payroll.view`, or the
// `payroll.run` broad grant) — same self-or-broad-grant shape as
// user.service.js#getUserById, not expressible as a single route middleware.
payrollRouter.get("/:id/payslip", authenticate, validatePayslipQuery, payslip);

export default payrollRouter;
