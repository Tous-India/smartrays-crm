import cron from "node-cron";
import { sendDueFollowUpReminders } from "../modules/lead/lead.service.js";

/**
 * Registered from server.js after the database connects, alongside
 * `payrollCron.js`. Runs every 5 minutes — much more frequent than the
 * monthly payroll job, since "24h before" and "15min before" are both
 * precise-ish moments in time, not a once-a-day batch window. 5 minutes is
 * fine-grained enough that neither reminder is ever more than ~5 minutes
 * late without needing per-minute polling; see
 * `lead.service.js#sendDueFollowUpReminders` for why the window check
 * itself doesn't need to be exact.
 */
export function registerLeadFollowUpReminderCron() {
  cron.schedule("*/5 * * * *", () => runLeadFollowUpReminderJob());
}

/**
 * The job body itself, exported separately so a test can call it directly
 * with a fixed reference date instead of waiting on a real cron fire — same
 * pattern as `payrollCron.js#runMonthlyPayrollJob`.
 */
export async function runLeadFollowUpReminderJob(referenceDate = new Date()) {
  try {
    const result = await sendDueFollowUpReminders(referenceDate);

    console.log(
      `[leadFollowUpReminderCron] Sent ${result.reminders24h} 24h-window and ${result.reminders15m} 15m-window follow-up reminders`
    );

    return result;
  } catch (error) {
    console.error("[leadFollowUpReminderCron] Failed to send follow-up reminders:", error);

    return null;
  }
}
