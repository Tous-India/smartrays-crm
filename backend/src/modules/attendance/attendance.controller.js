import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  checkIn as checkInEmployee,
  checkOut as checkOutEmployee,
  breakIn as breakInEmployee,
  breakOut as breakOutEmployee,
  getMyAttendance,
  recordHeartbeat,
  getTeamAttendance,
  adjustAttendance,
  createManualAttendance,
} from "./attendance.service.js";
import { generateReport } from "../report/report.service.js";

// A photo can arrive as a multipart file (req.file, via multer) or as a
// base64 data URI string in a JSON body (req.body.photo) — §7.4 accepts
// either. attendance.validation.js normalizes req.body.coords for both
// transports; this just picks whichever photo source is actually present.
function extractPhoto(req) {
  if (req.file) {
    return req.file.buffer;
  }

  return req.body.photo || null;
}

export const checkIn = asyncWrapper(async (req, res) => {
  const attendance = await checkInEmployee(req.user, req.body.coords, extractPhoto(req));

  res.status(201).json(new ApiResponse(201, attendance, "Checked in successfully"));
});

export const checkOut = asyncWrapper(async (req, res) => {
  const attendance = await checkOutEmployee(req.user, req.body.coords, extractPhoto(req));

  res.status(200).json(new ApiResponse(200, attendance, "Checked out successfully"));
});

export const breakIn = asyncWrapper(async (req, res) => {
  const attendance = await breakInEmployee(req.user, req.body.coords);

  res.status(200).json(new ApiResponse(200, attendance, "Break started"));
});

export const breakOut = asyncWrapper(async (req, res) => {
  const attendance = await breakOutEmployee(req.user, req.body.coords);

  res.status(200).json(new ApiResponse(200, attendance, "Break ended"));
});

export const heartbeat = asyncWrapper(async (req, res) => {
  const attendance = await recordHeartbeat(req.user._id);

  res.status(200).json(new ApiResponse(200, attendance, "Heartbeat recorded"));
});

export const myAttendance = asyncWrapper(async (req, res) => {
  const records = await getMyAttendance(req.user._id, req.query.month);

  res.status(200).json(new ApiResponse(200, records, "Attendance history fetched successfully"));
});

export const teamAttendance = asyncWrapper(async (req, res) => {
  const records = await getTeamAttendance(req.query.month, req.user);

  res.status(200).json(new ApiResponse(200, records, "Team attendance fetched successfully"));
});

export const adjust = asyncWrapper(async (req, res) => {
  const record = await adjustAttendance(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, record, "Attendance record updated successfully"));
});

export const createManual = asyncWrapper(async (req, res) => {
  const record = await createManualAttendance(req.body, req.user);

  res.status(201).json(new ApiResponse(201, record, "Attendance record created successfully"));
});

const REPORT_CONTENT_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Migrated onto the unified §7.11 dispatcher (Phase 8) — internally reuses
// generateAttendanceReport (unchanged) via generateReport, then streams the
// resulting buffer directly (2026-08-04 — Cloudinary's upload step was
// removed from the whole dispatcher, this endpoint included), same as
// POST /reports/generate with module: "attendance" would.
export const report = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const format = req.query.format || "xlsx";
  const buffer = await generateReport({ module: "attendance", filters: { from, to }, format }, req.user);

  res.setHeader("Content-Type", REPORT_CONTENT_TYPES[format]);
  res.setHeader("Content-Disposition", `attachment; filename=attendance-report.${format}`);
  res.status(200).send(buffer);
});
