import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { generate } from "./report.controller.js";
import { validateGenerateReportInput } from "./report.validation.js";

const reportRouter = Router();

// No route-level module-permission gate, and deliberately no new
// `reports.generate` permission either — access is resolved per requested
// `module` inside generateReport itself, reusing can() against that
// module's own existing actions (§7.11). A single fixed authorize() call
// here couldn't express "which permission" ahead of knowing the body.
reportRouter.post("/generate", authenticate, validateGenerateReportInput, generate);

export default reportRouter;
