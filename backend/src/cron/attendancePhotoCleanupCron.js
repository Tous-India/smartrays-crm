import cron from "node-cron";
import { cleanupOldAttendancePhotos } from "../modules/attendance/attendance.service.js";

/**
 * Registered from server.js after the database connects, alongside
 * `payrollCron.js`/`leadFollowUpReminderCron.js` — same file layout/
 * registration pattern exactly (§7.4c, 2026-07-31). Runs once daily at
 * 00:15 (a few minutes past midnight, same "avoid clashing with anything
 * scheduled for exactly midnight" reasoning as `payrollCron.js`'s own 00:05,
 * offset slightly further so the two don't collide with each other either).
 *
 * IMPORTANT — same known limitation as the other two crons in this
 * directory: this does NOT actually run in production today. See
 * `server.js`'s own `VERCEL` guard comment and `backend/README.md`'s
 * Deployment section — node-cron needs a long-lived process, which the
 * Vercel serverless function this backend actually runs as (`api/index.js`)
 * is not. Registered here anyway, mirroring the existing pattern exactly as
 * this task asked, rather than inventing a different (and inconsistent)
 * answer for just this one cron — but this is now a THIRD scheduled job
 * that silently never fires in production, not a new problem introduced by
 * this feature. See the Deployment section for the real fix this needs
 * before ANY of these three crons can be relied on.
 */
export function registerAttendancePhotoCleanupCron() {
  cron.schedule("15 0 * * *", () => runAttendancePhotoCleanupJob());
}

/**
 * The job body itself, exported separately so a test can call it directly
 * with a fixed reference date instead of waiting on a real cron fire — same
 * pattern as `payrollCron.js#runMonthlyPayrollJob`/
 * `leadFollowUpReminderCron.js#runLeadFollowUpReminderJob`. Never throws —
 * `cleanupOldAttendancePhotos` itself already survives a single record's
 * failure; this outer try/catch only guards against something failing
 * before that (e.g. the initial query itself).
 */
export async function runAttendancePhotoCleanupJob(referenceDate = new Date()) {
  try {
    const result = await cleanupOldAttendancePhotos(referenceDate);

    console.log(
      `[attendancePhotoCleanupCron] Checked ${result.checked} eligible record(s): ${result.cleaned} cleaned, ${result.failed} failed`
    );

    return result;
  } catch (error) {
    console.error("[attendancePhotoCleanupCron] Failed to run photo cleanup:", error);

    return null;
  }
}
