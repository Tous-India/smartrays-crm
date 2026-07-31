import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { subscribe, unsubscribe, listNotifications, markRead, markAllRead } from "./notification.service.js";

export const subscribeToPush = asyncWrapper(async (req, res) => {
  const subscription = await subscribe(req.user._id, req.body);

  res.status(201).json(new ApiResponse(201, subscription, "Subscribed to push notifications"));
});

export const unsubscribeFromPush = asyncWrapper(async (req, res) => {
  await unsubscribe(req.user._id, req.body.endpoint);

  res.status(200).json(new ApiResponse(200, null, "Unsubscribed from push notifications"));
});

// Shared by `list`/`markEveryRead` below — `?type=lead_created` or the
// comma-separated `?type=lead_created,lead_assigned` both parse to an array;
// no `type` param at all parses to `null` (no type filter applied).
function parseTypesParam(rawType) {
  if (!rawType) {
    return null;
  }

  return rawType.split(",").map((type) => type.trim()).filter(Boolean);
}

export const list = asyncWrapper(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true";
  const types = parseTypesParam(req.query.type);
  const notifications = await listNotifications(req.user._id, unreadOnly, types);

  res.status(200).json(new ApiResponse(200, notifications, "Notifications fetched successfully"));
});

export const markOneRead = asyncWrapper(async (req, res) => {
  const notification = await markRead(req.params.id, req.user._id);

  res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

export const markEveryRead = asyncWrapper(async (req, res) => {
  const types = parseTypesParam(req.query.type);
  await markAllRead(req.user._id, types);

  res.status(200).json(new ApiResponse(200, null, "All notifications marked as read"));
});
