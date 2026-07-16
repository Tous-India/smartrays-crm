import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";
import { run, list, payslip } from "./payroll.controller.js";
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
payrollRouter.get("/", authenticate, validateListQuery, list);

// Permission checked inside getPayslip (self-scoped `payroll.view`, or the
// `payroll.run` broad grant) — same self-or-broad-grant shape as
// user.service.js#getUserById, not expressible as a single route middleware.
payrollRouter.get("/:id/payslip", authenticate, validatePayslipQuery, payslip);

export default payrollRouter;
