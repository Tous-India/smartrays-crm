import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize, authorizeAny, requireAdmin } from "../../middlewares/authorize.middleware.js";
import { generate } from "./report.controller.js";
import { validateGenerateReportInput } from "./report.validation.js";
import {
  leadsPipeline,
  leadsConversion,
  leadsBySource,
  leadsByClientType,
  customersGrowth,
  customersStatusSplit,
  customersContractValue,
  paymentsTrend,
  amcRenewalsUpcoming,
  attendanceTrend,
  payrollCostTrend,
} from "./analytics.controller.js";

const reportRouter = Router();

// No route-level module-permission gate, and deliberately no new
// `reports.generate` permission either — access is resolved per requested
// `module` inside generateReport itself, reusing can() against that
// module's own existing actions (§7.11). A single fixed authorize() call
// here couldn't express "which permission" ahead of knowing the body.
reportRouter.post("/generate", authenticate, validateGenerateReportInput, generate);

// Analytics endpoints backing the Reports page's charts — each gated with
// the SAME permission each module's own existing list/report endpoint
// already uses (§5's matrix), not a new "reports.*" permission. Scoping
// (admin/manager/owner) is resolved inside analytics.service.js by reusing
// each module's own ownership-filter helper, not re-derived here.
reportRouter.get("/analytics/leads-pipeline", authenticate, authorize("leads", "view"), leadsPipeline);
reportRouter.get("/analytics/leads-conversion", authenticate, authorize("leads", "view"), leadsConversion);
reportRouter.get("/analytics/leads-by-source", authenticate, authorize("leads", "view"), leadsBySource);
reportRouter.get("/analytics/leads-by-client-type", authenticate, authorize("leads", "view"), leadsByClientType);

reportRouter.get("/analytics/customers-growth", authenticate, authorize("customers", "view"), customersGrowth);
reportRouter.get(
  "/analytics/customers-status-split",
  authenticate,
  authorize("customers", "view"),
  customersStatusSplit,
);
reportRouter.get(
  "/analytics/customers-contract-value",
  authenticate,
  authorize("customers", "view"),
  customersContractValue,
);

reportRouter.get("/analytics/payments-trend", authenticate, authorize("payments", "view"), paymentsTrend);

reportRouter.get("/analytics/amc-renewals-upcoming", authenticate, authorize("amc", "view"), amcRenewalsUpcoming);

reportRouter.get(
  "/analytics/attendance-trend",
  authenticate,
  authorizeAny("attendance", ["view_team", "view_all"]),
  attendanceTrend,
);

reportRouter.get("/analytics/payroll-cost-trend", authenticate, requireAdmin, payrollCostTrend);

export default reportRouter;
