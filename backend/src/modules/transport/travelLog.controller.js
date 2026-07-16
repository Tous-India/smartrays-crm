import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createManualTravelLog,
  listTravelLogs,
  approveTravelLog,
  rejectTravelLog,
} from "./travelLog.service.js";
import { generateReport } from "../report/report.service.js";

export const create = asyncWrapper(async (req, res) => {
  const travelLog = await createManualTravelLog(req.body, req.user);

  res.status(201).json(new ApiResponse(201, travelLog, "Travel log created successfully"));
});

export const approve = asyncWrapper(async (req, res) => {
  const travelLog = await approveTravelLog(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, travelLog, "Travel log approved successfully"));
});

export const reject = asyncWrapper(async (req, res) => {
  const travelLog = await rejectTravelLog(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, travelLog, "Travel log rejected successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const { scope, employeeId, month } = req.query;
  const travelLogs = await listTravelLogs({ scope, employeeId, month }, req.user);

  res.status(200).json(new ApiResponse(200, travelLogs, "Travel logs fetched successfully"));
});

// Migrated onto the unified §7.11 dispatcher (Phase 8) — no longer streams
// the file itself; internally reuses generateTravelLogReport (unchanged)
// but returns { downloadUrl } after uploading to Cloudinary, same as
// POST /reports/generate with module: "transport" would.
export const report = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const format = req.query.format || "xlsx";
  const result = await generateReport({ module: "transport", filters: { from, to }, format }, req.user);

  res.status(200).json(new ApiResponse(200, result, "Report generated successfully"));
});
