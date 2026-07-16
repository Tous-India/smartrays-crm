import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny } from "../../middlewares/authorize.middleware.js";
import {
  checkIn,
  checkOut,
  heartbeat,
  myAttendance,
  teamAttendance,
  report,
} from "./attendance.controller.js";
import {
  validateCheckInInput,
  validateCheckOutInput,
  validateMonthQuery,
  validateReportQuery,
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

export default attendanceRouter;
