import { Router } from "express";
import authRouter from "./modules/auth/auth.routes.js";
import leadRouter, { leadSourceRouter } from "./modules/lead/lead.routes.js";
import locationRouter from "./modules/location/location.routes.js";
import permissionRouter, { userPermissionRouter } from "./modules/permission/permission.routes.js";
import userRouter from "./modules/user/user.routes.js";
import attendanceRouter from "./modules/attendance/attendance.routes.js";
import customerRouter from "./modules/customer/customer.routes.js";
import projectRouter from "./modules/project/project.routes.js";
import leaveRouter from "./modules/leave/leave.routes.js";
import travelLogRouter from "./modules/transport/travelLog.routes.js";
import payrollRouter from "./modules/payroll/payroll.routes.js";
import ticketRouter from "./modules/ticket/ticket.routes.js";
import paymentRouter from "./modules/payment/payment.routes.js";
import amcRouter from "./modules/amc/amc.routes.js";
import reportRouter from "./modules/report/report.routes.js";
import notificationRouter from "./modules/notification/notification.routes.js";
import teamRouter, { teamTypeRouter } from "./modules/team/team.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/leads", leadRouter);
router.use("/lead-sources", leadSourceRouter);
router.use("/location", locationRouter);
router.use("/permissions", permissionRouter);
router.use("/attendance", attendanceRouter);
router.use("/customers", customerRouter);
router.use("/projects", projectRouter);
router.use("/leave", leaveRouter);
router.use("/travel-logs", travelLogRouter);
router.use("/payroll", payrollRouter);
router.use("/tickets", ticketRouter);
router.use("/payments", paymentRouter);
router.use("/amc", amcRouter);
router.use("/reports", reportRouter);
router.use("/notifications", notificationRouter);
router.use("/teams", teamRouter);
router.use("/team-types", teamTypeRouter);
// Two routers share the "/users" prefix: userRouter owns the core identity
// endpoints (list/get/update/deactivate/manager), userPermissionRouter (from
// the permission module) owns the nested "/:id/permissions" sub-resource.
// Their route sets don't overlap, so mounting order doesn't matter here.
router.use("/users", userRouter);
router.use("/users", userPermissionRouter);

export default router;
