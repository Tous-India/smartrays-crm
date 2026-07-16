import cron from "node-cron";
import { runPayroll } from "../modules/payroll/payroll.service.js";

/**
 * Registered from server.js after the database connects — put in a new
 * `src/cron/` directory rather than `src/services/`, since scheduled-job
 * orchestration is a distinct concern from the stateless external-service
 * wrappers that already live there (cloudinary/googleMaps/etc).
 *
 * Runs at 00:05 on the 1st of every month (a few minutes past midnight, to
 * avoid clashing with anything else scheduled for exactly midnight) — see
 * `runMonthlyPayrollJob` below for what it actually does.
 */
export function registerPayrollCron() {
  cron.schedule("5 0 1 * *", () => runMonthlyPayrollJob());
}

/**
 * The job body itself, exported separately from `registerPayrollCron` so a
 * test can call it directly instead of waiting on a real cron fire or faking
 * global time. Bulk-runs Payroll for every active employee for the PREVIOUS
 * calendar month relative to `referenceDate` — matches smartrays.md's
 * "salary paid on the first day of every month" cadence and §7.7's
 * `POST /payroll/run` bulk shape (omitting `employeeId`). Calls
 * `payroll.service.js#runPayroll` directly, the same cross-module direct-call
 * pattern used elsewhere (e.g. attendance→travelLog) — there's no HTTP
 * request here to run through the admin-gated route.
 *
 * `regenerate: false` — an employee/month that already has a Payroll record
 * (e.g. an admin ran it manually earlier that day) is silently skipped, not
 * overwritten, so a server restart or a delayed cron fire on the 1st can
 * never clobber a manually-run payroll.
 */
export async function runMonthlyPayrollJob(referenceDate = new Date()) {
  const { month, year } = resolvePreviousMonth(referenceDate);

  try {
    const result = await runPayroll({ month, year, regenerate: false });

    console.log(
      `[payrollCron] Ran payroll for ${month}/${year}: ${result.generated.length} generated, ${result.skipped.length} skipped`
    );

    return result;
  } catch (error) {
    console.error(`[payrollCron] Failed to run payroll for ${month}/${year}:`, error);

    return null;
  }
}

export function resolvePreviousMonth(referenceDate) {
  let month = referenceDate.getMonth();
  let year = referenceDate.getFullYear();

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return { month, year };
}
