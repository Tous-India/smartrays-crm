import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  submitPing,
  submitPingBatch,
  getLiveLocations,
  getLocationHistory,
  getPingIntervalConfig,
  resolveVisibleEmployeeIds,
} from "./location.service.js";
import { recordLocationConsent, getMyLatestConsent, listLatestConsents } from "./locationConsent.service.js";
import { getDayTimeline, getMyLiveStatus, getTeamLiveStatus, kickLiveAlerts, recordStatusEvents } from "./liveStatus.service.js";
import ApiError from "../../utils/ApiError.js";

export const create = asyncWrapper(async (req, res) => {
  // The batch form (mobile-backend-plan.md §3.2): a 200 with a per-ping
  // report, because a partial result is the normal outcome, not an error.
  if (Array.isArray(req.body.pings)) {
    const report = await submitPingBatch(req.body.pings, req.user);

    res.status(200).json(new ApiResponse(200, report, "Location pings processed"));
    return;
  }

  const { coords, capturedAt, speed, device } = req.body;

  const ping = await submitPing({ coords, capturedAt, speed, device }, req.user);

  res.status(201).json(new ApiResponse(201, ping, "Location ping recorded"));
});

export const live = asyncWrapper(async (req, res) => {
  const liveLocations = await getLiveLocations(req.user);

  res.status(200).json(new ApiResponse(200, liveLocations, "Live locations fetched successfully"));
});

export const history = asyncWrapper(async (req, res) => {
  const { employeeId, employeeIds, date, from, to } = req.query;

  // `date` is the original single-day parameter and still works; `from`/`to`
  // and `employeeIds` are the range/multi-employee additions (§7.67).
  const history = await getLocationHistory({ employeeId, employeeIds, date, from, to }, req.user);

  res.status(200).json(new ApiResponse(200, history, "Location history fetched successfully"));
});

export const config = asyncWrapper(async (req, res) => {
  const pingConfig = getPingIntervalConfig();

  res.status(200).json(new ApiResponse(200, pingConfig, "Location config fetched successfully"));
});

// --- Location consent (final-plan.md §7.73) ---

export const recordConsent = asyncWrapper(async (req, res) => {
  const record = await recordLocationConsent(req.user, req.body);

  res.status(201).json(new ApiResponse(201, record, "Location consent recorded"));
});

export const myConsent = asyncWrapper(async (req, res) => {
  const record = await getMyLatestConsent(req.user);

  res.status(200).json(new ApiResponse(200, record, "Location consent fetched successfully"));
});

export const consentList = asyncWrapper(async (req, res) => {
  const rows = await listLatestConsents(req.user);

  res.status(200).json(new ApiResponse(200, rows, "Location consents fetched successfully"));
});

// --- Live employee status (2026-10-23) ---
export const statusEvents = asyncWrapper(async (req, res) => {
  const result = await recordStatusEvents(req.body.events, req.user);
  kickLiveAlerts();

  res.status(200).json(new ApiResponse(200, result, "Status events recorded"));
});

export const liveStatus = asyncWrapper(async (req, res) => {
  const team = await getTeamLiveStatus(await resolveVisibleEmployeeIds(req.user));
  kickLiveAlerts();

  res.status(200).json(new ApiResponse(200, team, "Live status fetched successfully"));
});

export const myStatus = asyncWrapper(async (req, res) => {
  const mine = await getMyLiveStatus(req.user);

  res.status(200).json(new ApiResponse(200, mine, "Your status fetched successfully"));
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /location/timeline?employeeId=&date=YYYY-MM-DD — one person's day; the live map's visibility. */
export const timeline = asyncWrapper(async (req, res) => {
  const employeeId = req.query.employeeId || String(req.user._id);
  const date = req.query.date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (!DATE_KEY.test(date)) throw new ApiError(400, "date must be YYYY-MM-DD");
  const visible = await resolveVisibleEmployeeIds(req.user);
  if (visible !== null && !visible.includes(String(employeeId))) {
    throw new ApiError(403, "You cannot see this person's day");
  }
  const day = await getDayTimeline(employeeId, date);

  res.status(200).json(new ApiResponse(200, day, "Timeline fetched successfully"));
});
