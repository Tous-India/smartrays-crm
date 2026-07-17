import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import {
  subscribeToPush,
  unsubscribeFromPush,
  list,
  markOneRead,
  markEveryRead,
} from "./notification.controller.js";
import { validateSubscribeInput, validateUnsubscribeInput } from "./notification.validation.js";

const notificationRouter = Router();

// No module-permission gate anywhere here — every action is inherently
// self-scoped (your own subscriptions, your own notifications), the same
// "self data needs no grant" reasoning as GET /attendance/me / GET /auth/me.
// POST, not DELETE, for unsubscribe — this codebase avoids REST-purist
// endpoints where a body is more convenient (see PATCH /leads/:id/hot),
// and a DELETE with a body is friction for no real benefit here.
notificationRouter.post("/subscribe", authenticate, validateSubscribeInput, subscribeToPush);
notificationRouter.post("/unsubscribe", authenticate, validateUnsubscribeInput, unsubscribeFromPush);

notificationRouter.get("/", authenticate, list);
notificationRouter.patch("/read-all", authenticate, markEveryRead);
notificationRouter.patch("/:id/read", authenticate, markOneRead);

export default notificationRouter;
