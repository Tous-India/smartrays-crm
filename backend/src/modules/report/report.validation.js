import ApiError from "../../utils/ApiError.js";
import { validateReportQuery as validateAttendanceReportQuery } from "../attendance/attendance.validation.js";
import { validateReportQuery as validateTransportReportQuery } from "../transport/travelLog.validation.js";
import { validateScopeQuery as validateLeaveScopeQuery } from "../leave/leave.validation.js";
import { validateListQuery as validatePayrollListQuery } from "../payroll/payroll.validation.js";
import { LEAD_STATUSES } from "../lead/lead.model.js";
import { CUSTOMER_STATUSES } from "../customer/customer.model.js";

// The exact six values §7.11 names — attendance, leave, payroll, transport
// (TravelLog's module key, matching its folder name), leads, customers.
const SUPPORTED_MODULES = ["attendance", "leave", "payroll", "transport", "leads", "customers"];
const SUPPORTED_FORMATS = ["pdf", "xlsx"];

const noop = () => {};

/**
 * Per-module `filters` shape checks. Each of these reuses the SAME validator
 * function already guarding that module's own list/report query params,
 * called as a plain function against a `{ query: filters }` stand-in — the
 * same "call the existing middleware directly rather than duplicate its
 * checks" pattern amc.validation.js already uses for
 * `customer.validation.js#validateCreateCustomerInput`. attendance/transport
 * reuse their own `validateReportQuery` (the exact validator their
 * now-migrated `/report` endpoints always used); leave/payroll reuse the
 * scope/list-query validators their normal list endpoints use. leads/
 * customers have no dedicated query-validator middleware of their own to
 * reuse (their list endpoints run unvalidated today), so their status filter
 * is checked directly against each model's own exported status enum — the
 * same source `lead.validation.js`/`customer.validation.js` reuse for their
 * body validators — rather than inventing a parallel hardcoded list.
 */
const FILTER_VALIDATORS = {
  attendance: (filters) => validateAttendanceReportQuery({ query: filters }, null, noop),
  transport: (filters) => validateTransportReportQuery({ query: filters }, null, noop),
  leave: (filters) => validateLeaveScopeQuery({ query: filters }, null, noop),
  payroll: (filters) => validatePayrollListQuery({ query: filters }, null, noop),
  leads: (filters) => {
    if (filters.status && !LEAD_STATUSES.includes(filters.status)) {
      throw new ApiError(400, `filters.status must be one of: ${LEAD_STATUSES.join(", ")}`);
    }
  },
  customers: (filters) => {
    if (filters.status && !CUSTOMER_STATUSES.includes(filters.status)) {
      throw new ApiError(400, `filters.status must be one of: ${CUSTOMER_STATUSES.join(", ")}`);
    }
  },
};

export function validateGenerateReportInput(req, res, next) {
  const { module, format, filters } = req.body;

  if (!module || !SUPPORTED_MODULES.includes(module)) {
    throw new ApiError(400, `module must be one of: ${SUPPORTED_MODULES.join(", ")}`);
  }

  if (format !== undefined && !SUPPORTED_FORMATS.includes(format)) {
    throw new ApiError(400, `format must be one of: ${SUPPORTED_FORMATS.join(", ")}`);
  }

  if (filters !== undefined && (typeof filters !== "object" || Array.isArray(filters))) {
    throw new ApiError(400, "filters must be an object");
  }

  FILTER_VALIDATORS[module](filters || {});

  next();
}
