import app from "./app.js";
import { connectDatabase } from "./src/database/connection.js";
import { env } from "./src/config/env.js";
import { registerPayrollCron } from "./src/cron/payrollCron.js";
import { registerLeadFollowUpReminderCron } from "./src/cron/leadFollowUpReminderCron.js";
import { registerAttendancePhotoCleanupCron } from "./src/cron/attendancePhotoCleanupCron.js";
import { reconcileRoleTemplatesOnBoot } from "./src/modules/permission/permission.service.js";

async function startServer() {
  try {
    await connectDatabase();
  } catch {
    // connectDatabase already logged the error; this process can't run
    // without a database, same behavior as before connection.js moved to a
    // throw-on-failure contract for serverless compatibility (see
    // backend/api/index.js).
    process.exit(1);
  }

  // RolePermissionTemplate drift reconciliation (2026-08-03, §7.12b) — see
  // permission.service.js#reconcileRoleTemplatesOnBoot for the full incident
  // and reasoning. Also called from api/index.js's handler for the
  // serverless entry point; cached in both, so this only ever does real work
  // once per process.
  await reconcileRoleTemplatesOnBoot();

  // node-cron relies on a long-lived process to fire on schedule — true for
  // this file (a persistent server), but NOT true on Vercel's serverless
  // runtime (backend/api/index.js), where nothing stays alive between
  // requests. `VERCEL` is a platform-injected env var, so this only ever
  // skips registration when actually running there; this file's own local/
  // traditional-hosting behavior is unchanged. Known limitation, documented
  // in backend/README.md and the root README's Deployment section — payroll,
  // lead follow-up reminders, AND (2026-07-31, §7.4c) the attendance photo
  // cleanup cron need a real answer (e.g. Vercel Cron hitting a dedicated
  // endpoint) before this app can rely on crons in production. Confirmed
  // during §7.4c's own build: `api/index.js` (the actual Vercel entry point)
  // never calls any of these register functions at all, and never has —
  // this is a real, pre-existing gap, not something newly introduced here.
  if (process.env.VERCEL !== "1") {
    registerPayrollCron();
    registerLeadFollowUpReminderCron();
    registerAttendancePhotoCleanupCron();
  }

  app.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
  });
}

startServer();
