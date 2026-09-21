import ApiError from "../../utils/ApiError.js";
import { CONSENT_DECISIONS } from "./locationConsent.model.js";

/**
 * The most pings one batch may carry (mobile-backend-plan.md §3.2). At the
 * default two-minute cadence 500 fixes is ~16 hours — a whole shift spent
 * offline still goes up in a single request; anything larger is split by the
 * app, which sends oldest first.
 */
export const MAX_PING_BATCH = 500;

/**
 * The one coords rule, shared by both forms. `accuracy` is optional (the web
 * never sends it) and, when present, a non-negative number of metres.
 * `where` names the field in the 400 so a batch failure points at its element.
 */
function assertCoords(coords, where) {
  if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
    throw new ApiError(400, `${where}coords.lat and coords.lng are required numbers`);
  }

  if (coords.lat < -90 || coords.lat > 90) {
    throw new ApiError(400, `${where}coords.lat must be between -90 and 90`);
  }

  if (coords.lng < -180 || coords.lng > 180) {
    throw new ApiError(400, `${where}coords.lng must be between -180 and 180`);
  }

  if (coords.accuracy !== undefined && (typeof coords.accuracy !== "number" || Number.isNaN(coords.accuracy) || coords.accuracy < 0)) {
    throw new ApiError(400, `${where}coords.accuracy must be a non-negative number of metres`);
  }
}

function assertCapturedAt(capturedAt, where) {
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    throw new ApiError(400, `${where}A valid capturedAt timestamp is required`);
  }
}

/**
 * Validates the body of POST /location/pings before the controller runs.
 *
 * Two accepted shapes (mobile-backend-plan.md §3.2):
 *   { coords, capturedAt }                              — the single form, as always
 *   { pings: [{ clientPingId, coords, capturedAt }, …] } — the batch form
 *
 * The branch is on `Array.isArray(req.body.pings)`; the single form runs the
 * same checks it always has. A malformed batch element is a 400 for the whole
 * batch, naming the element — a shape error is a client bug, not a per-ping
 * outcome (those are the service's `rejected` entries).
 */
export function validatePingInput(req, res, next) {
  if (Array.isArray(req.body.pings)) {
    validatePingBatch(req.body.pings);
    next();
    return;
  }

  const { coords, capturedAt } = req.body;

  assertCoords(coords, "");
  assertCapturedAt(capturedAt, "");

  next();
}

function validatePingBatch(pings) {
  if (pings.length === 0) {
    throw new ApiError(400, "pings must contain at least one ping");
  }

  if (pings.length > MAX_PING_BATCH) {
    throw new ApiError(400, `pings may contain at most ${MAX_PING_BATCH} pings per request`);
  }

  pings.forEach((ping, index) => {
    const where = `pings[${index}]: `;

    if (!ping || typeof ping !== "object") {
      throw new ApiError(400, `${where}each ping must be an object`);
    }

    if (typeof ping.clientPingId !== "string" || !ping.clientPingId.trim()) {
      throw new ApiError(400, `${where}clientPingId is required`);
    }

    assertCoords(ping.coords, where);
    assertCapturedAt(ping.capturedAt, where);
  });
}

/**
 * Validates the query string of GET /location/history before the controller runs.
 * Both employeeId and date are optional (default to self / today in the service).
 */
/**
 * `date` (single day, original) OR `from`/`to` (range, §7.67). Both are
 * optional; the service defaults to the last 45 days and clamps anything wider.
 *
 * The 45-day maximum is NOT enforced here as a 400 — the service clamps it and
 * reports `cappedToMaxDays` instead. Rejecting would make a bookmarked "last
 * quarter" link fail rather than quietly return what actually exists.
 */
export function validateHistoryQuery(req, res, next) {
  const { date, from, to } = req.query;

  [
    ["date", date],
    ["from", from],
    ["to", to],
  ].forEach(([name, value]) => {
    if (value && Number.isNaN(Date.parse(value))) {
      throw new ApiError(400, `${name} must be a valid date string`);
    }
  });

  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must not be after to");
  }

  next();
}

/**
 * Validates the body of POST /location/consent (final-plan.md §7.73): the
 * decision and the disclosure version it answers are required; the app
 * version and device id are optional strings.
 */
export function validateConsentInput(req, res, next) {
  const { decision, disclosureVersion, appVersion, deviceId } = req.body || {};

  if (!CONSENT_DECISIONS.includes(decision)) {
    throw new ApiError(400, `decision must be one of: ${CONSENT_DECISIONS.join(", ")}`);
  }

  if (typeof disclosureVersion !== "string" || !disclosureVersion.trim()) {
    throw new ApiError(400, "disclosureVersion is required");
  }

  [
    ["appVersion", appVersion],
    ["deviceId", deviceId],
  ].forEach(([name, value]) => {
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw new ApiError(400, `${name} must be a string`);
    }
  });

  next();
}
