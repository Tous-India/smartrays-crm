import ApiError from "../../utils/ApiError.js";

const MONTH_PARAM_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Validates POST /payroll/run's `?employeeId=&month=&year=&regenerate=`
 * query params. `month`/`year` are required — there is no "current month"
 * default for an explicit admin-triggered run (the cron job, which runs for
 * "the previous month" per §7.7 STEP 3, computes and passes them explicitly
 * instead of relying on this validator).
 */
export function validateRunQuery(req, res, next) {
  const { month, year, regenerate } = req.query;

  const monthNumber = Number(month);
  const yearNumber = Number(year);

  if (!month || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new ApiError(400, "month is required and must be an integer between 1 and 12");
  }

  if (!year || !Number.isInteger(yearNumber) || yearNumber < 2000) {
    throw new ApiError(400, "year is required and must be a valid 4-digit year");
  }

  if (regenerate !== undefined && !["true", "false"].includes(regenerate)) {
    throw new ApiError(400, "regenerate must be either 'true' or 'false'");
  }

  next();
}

/**
 * Validates GET /payroll's `?scope=&month=` query params. Only `own`/`all`
 * — Payroll has no `team` scope (§7.7): Manager gets no payroll grant at all.
 */
export function validateListQuery(req, res, next) {
  const { scope, month } = req.query;

  if (scope && !["own", "all"].includes(scope)) {
    throw new ApiError(400, "scope must be one of: own, all");
  }

  if (month && !MONTH_PARAM_PATTERN.test(month)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  next();
}

/**
 * Validates GET /payroll/:id/payslip's `?format=` query param — PDF only
 * (§7.7, no xlsx option unlike every other module's report endpoint).
 */
export function validatePayslipQuery(req, res, next) {
  const { format } = req.query;

  if (format !== undefined && format !== "pdf") {
    throw new ApiError(400, "format must be 'pdf' — payslips have no xlsx option");
  }

  next();
}
