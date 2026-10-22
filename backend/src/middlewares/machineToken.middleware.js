import { env } from "../config/env.js";
import ApiError from "../utils/ApiError.js";

/**
 * Guard for machine-only endpoints that Vercel Cron calls (the attendance
 * cleanup, the open-shift reminders, the complaint escalations). Moved here
 * unchanged from attendance.routes.js (2026-10-22) so every cron endpoint
 * shares one credential check.
 *
 * Registered for BOTH POST and GET by its callers: Vercel Cron only ever
 * issues a GET and cannot attach custom headers.
 *
 * Three accepted credentials, all equivalent:
 * - `x-webhook-token` header — the project's webhook pattern, for manual or
 *   scripted invocation;
 * - `?token=` query param — same secret, for callers that can't set headers;
 * - `Authorization: Bearer <CRON_SECRET>` — what Vercel Cron itself sends.
 *
 * Refuses outright (503) when NEITHER secret is configured: an unset secret
 * must never mean "open to everyone".
 *
 * Read from `process.env` at REQUEST time, not the `env` snapshot taken at
 * import: a serverless invocation can be handed its environment per request,
 * and reading live keeps the guard testable regardless of import order.
 */
export function verifyMachineToken({ notConfiguredMessage, invalidMessage }) {
  return function machineTokenMiddleware(req, res, next) {
    const sharedSecret = process.env.ATTENDANCE_CLEANUP_TOKEN || env.attendanceCleanupToken;
    const cronSecret = process.env.CRON_SECRET;

    if (!sharedSecret && !cronSecret) {
      throw new ApiError(503, notConfiguredMessage);
    }

    const providedToken = req.headers["x-webhook-token"] || req.query.token;
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");

    const matchesShared = Boolean(sharedSecret) && providedToken === sharedSecret;
    const matchesCron = Boolean(cronSecret) && bearer === cronSecret;

    if (!matchesShared && !matchesCron) {
      throw new ApiError(401, invalidMessage);
    }

    next();
  };
}
