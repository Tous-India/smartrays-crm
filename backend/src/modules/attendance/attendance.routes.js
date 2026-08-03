import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny, requireAdmin } from "../../middlewares/authorize.middleware.js";
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
  createManual,
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

export default attendanceRouter;
