import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny, requireAdmin } from "../../middlewares/authorize.middleware.js";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import {
  checkIn,
  checkOut,
  breakIn,
  breakOut,
  heartbeat,
  myAttendance,
  teamAttendance,
  report,
  adjust,
  correctRosterStatus,
  createManual,
  markStatus,
  cleanup,
} from "./attendance.controller.js";
import {
  validateCheckInInput,
  validateCheckOutInput,
  validateBreakInInput,
  validateBreakOutInput,
  validateMonthQuery,
  validateReportQuery,
  validateAdjustAttendanceInput,
  validateCreateManualAttendanceInput,
  validateMarkAttendanceStatusInput,
  validateRosterStatusInput,
} from "./attendance.validation.js";

const upload = multer({ storage: multer.memoryStorage() });

const attendanceRouter = Router();

// No module-permission gate on any of check-in/check-out/heartbeat — these
// are all facts about your own shift, not a "view" action, same reasoning as
// Location's POST /pings (§7.4b). upload.single("photo") is a no-op when the
// request isn't multipart/form-data, so a plain JSON body with a base64
// `photo` string still works on the same route.
attendanceRouter.post("/check-in", authenticate, upload.single("photo"), validateCheckInInput, checkIn);
attendanceRouter.post(
  "/check-out",
  authenticate,
  upload.single("photo"),
  validateCheckOutInput,
  checkOut
);
attendanceRouter.post("/heartbeat", authenticate, heartbeat);

// Break In/Out (§7.4c) — plain JSON only, no `upload.single`, since neither
// takes a photo. Same "no module-permission gate, this is a fact about your
// own shift" reasoning as check-in/check-out/heartbeat above.
attendanceRouter.post("/break-in", authenticate, validateBreakInInput, breakIn);
attendanceRouter.post("/break-out", authenticate, validateBreakOutInput, breakOut);

attendanceRouter.get("/me", authenticate, validateMonthQuery, myAttendance);

// Registered before nothing else conflicts ("team"/"report" aren't valid
// Attendance ids anyway, but kept in the same order as §7.4 for readability).
const VIEW_ACTIONS = ["view_team", "view_all"];
attendanceRouter.get(
  "/team",
  authenticate,
  authorizeAny("attendance", VIEW_ACTIONS),
  validateMonthQuery,
  teamAttendance
);
attendanceRouter.get(
  "/report",
  authenticate,
  authorizeAny("attendance", VIEW_ACTIONS),
  validateReportQuery,
  report
);

// Admin manual-correction — no `attendance.*` permission tier for this
// (view_team/view_all are both about VIEWING others' records, not editing),
// so `requireAdmin` is the gate, the same simple role-check `POST
// /payroll/run` already uses for its own genuinely admin-only action rather
// than inventing a permission that in practice only admin would ever hold.
attendanceRouter.patch("/:id", authenticate, requireAdmin, validateAdjustAttendanceInput, adjust);
attendanceRouter.post("/manual", authenticate, requireAdmin, validateCreateManualAttendanceInput, createManual);

// Gap-filling only (2026-08-05) — marks a day with NO record at all as
// absent/half_day. Explicitly NOT a reversal of the read-only decision
// above: a record that HAS check-in data is never editable through this
// path (see attendance.service.js#markAttendanceStatus for the full
// reasoning). Gated on the same view tier a manager already holds to see
// their team's attendance in the first place — the actual "is this employee
// mine?" scoping is per-record, so it lives in the service, matching the
// same split `leave.service.js#ensureCanActOnLeave` uses.
// §7.4g — correcting a previous MANUAL mark from the today's roster.
//
// ADMIN-ONLY, matching `PATCH /:id` above rather than /mark-status below.
// /mark-status can afford a manager tier because it takes an employeeId and
// scopes per-record in the service; this one takes a raw attendance id, and
// `adjustAttendance` has no per-record ownership check — opening it to
// managers would let one correct any record in the system by guessing an id.
// Managers can still MARK their own reports via /mark-status.
//
// On top of that gate the service refuses any record carrying a real
// check-in, so this path can only ever touch previous manual marks.
attendanceRouter.patch(
  "/:id/roster-status",
  authenticate,
  requireAdmin,
  validateRosterStatusInput,
  correctRosterStatus
);

attendanceRouter.post(
  "/mark-status",
  authenticate,
  authorizeAny("attendance", VIEW_ACTIONS),
  validateMarkAttendanceStatusInput,
  markStatus
);

/**
 * Data retention (§6.5, 2026-08-05) — machine-only, triggered by Vercel Cron
 * once daily. Deliberately NOT behind `authenticate`: this is not an action
 * any human performs, and putting a bulk-delete behind session auth would
 * mean one compromised admin session could wipe attendance history.
 *
 * **Registered for BOTH POST and GET, which is a platform constraint, not a
 * preference.** POST is the real interface (and what to use when invoking it
 * by hand). But Vercel Cron only ever issues a **GET**, and cannot attach
 * custom headers — so a POST-only, `x-webhook-token`-only endpoint could
 * never actually be triggered by the cron entry in `vercel.json`. The same
 * guard and handler serve both verbs; the job is idempotent, so a GET that
 * mutates is safe here in a way it normally would not be.
 *
 * Three accepted credentials, all equivalent:
 * - `x-webhook-token` header — the project's existing webhook pattern (same
 *   as the website lead intake), used for manual/scripted invocation.
 * - `?token=` query param — same secret, for callers that can't set headers.
 * - `Authorization: Bearer <CRON_SECRET>` — what Vercel Cron itself sends.
 *
 * Refuses outright (503) when NEITHER secret is configured, rather than
 * running unauthenticated: an unset secret must never mean "open to
 * everyone" on an endpoint whose entire job is deleting data.
 */
function verifyAttendanceCleanupToken(req, res, next) {
  // Read from `process.env` at REQUEST time, not from the `env` snapshot
  // taken at import time. Two reasons: a serverless invocation can be handed
  // its environment per-request, and reading live means the guard doesn't
  // depend on module import ORDER (which otherwise makes this endpoint
  // untestable — `config/env.js` would already have been imported, and
  // frozen, before a test could set the variable).
  const sharedSecret = process.env.ATTENDANCE_CLEANUP_TOKEN || env.attendanceCleanupToken;
  const cronSecret = process.env.CRON_SECRET;

  if (!sharedSecret && !cronSecret) {
    throw new ApiError(503, "Attendance cleanup is not configured");
  }

  const providedToken = req.headers["x-webhook-token"] || req.query.token;
  const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");

  const matchesShared = Boolean(sharedSecret) && providedToken === sharedSecret;
  const matchesCron = Boolean(cronSecret) && bearer === cronSecret;

  if (!matchesShared && !matchesCron) {
    throw new ApiError(401, "Invalid or missing cleanup token");
  }

  next();
}

attendanceRouter.post("/cleanup", verifyAttendanceCleanupToken, cleanup);
attendanceRouter.get("/cleanup", verifyAttendanceCleanupToken, cleanup);

export default attendanceRouter;
