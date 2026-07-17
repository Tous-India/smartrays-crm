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

export const list = asyncWrapper(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true";
  const notifications = await listNotifications(req.user._id, unreadOnly);

  res.status(200).json(new ApiResponse(200, notifications, "Notifications fetched successfully"));
});

export const markOneRead = asyncWrapper(async (req, res) => {
  const notification = await markRead(req.params.id, req.user._id);

  res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

export const markEveryRead = asyncWrapper(async (req, res) => {
  await markAllRead(req.user._id);

  res.status(200).json(new ApiResponse(200, null, "All notifications marked as read"));
});
