import app from "./app.js";
import { connectDatabase } from "./src/database/connection.js";
import { env } from "./src/config/env.js";
import { registerPayrollCron } from "./src/cron/payrollCron.js";
import { registerLeadFollowUpReminderCron } from "./src/cron/leadFollowUpReminderCron.js";

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

  // node-cron relies on a long-lived process to fire on schedule — true for
  // this file (a persistent server), but NOT true on Vercel's serverless
  // runtime (backend/api/index.js), where nothing stays alive between
  // requests. `VERCEL` is a platform-injected env var, so this only ever
  // skips registration when actually running there; this file's own local/
  // traditional-hosting behavior is unchanged. Known limitation, documented
  // in backend/README.md and the root README's Deployment section — payroll
  // and lead follow-up reminders need a real answer (e.g. Vercel Cron hitting
  // a dedicated endpoint) before this app can rely on crons in production.
  if (process.env.VERCEL !== "1") {
    registerPayrollCron();
    registerLeadFollowUpReminderCron();
  }

  app.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
  });
}

startServer();
