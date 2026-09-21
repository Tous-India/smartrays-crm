import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  submitPing,
  submitPingBatch,
  getLiveLocations,
  getLocationHistory,
  getPingIntervalConfig,
} from "./location.service.js";
import { recordLocationConsent, getMyLatestConsent, listLatestConsents } from "./locationConsent.service.js";

export const create = asyncWrapper(async (req, res) => {
  // The batch form (mobile-backend-plan.md §3.2): a 200 with a per-ping
  // report, because a partial result is the normal outcome, not an error.
  if (Array.isArray(req.body.pings)) {
    const report = await submitPingBatch(req.body.pings, req.user);

    res.status(200).json(new ApiResponse(200, report, "Location pings processed"));
    return;
  }

  const { coords, capturedAt } = req.body;

  const ping = await submitPing({ coords, capturedAt }, req.user);

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
