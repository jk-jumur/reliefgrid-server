import type { Response } from "express";

import type { ExtendedRequest } from "../../types/request.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  deliverNotificationRequestSchema,
  notificationIdParamsSchema,
} from "../../validators/notification.validator.js";
import {
  deliverNotificationToSelf,
  listNotifications,
  markNotificationRead,
  streamNotifications,
} from "./notification.service.js";

export const listNotificationsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const notifications = await listNotifications(req.user);
  res.status(200).json({ success: true, data: notifications });
};

export const markNotificationReadHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { notificationId } = notificationIdParamsSchema.shape.params.parse(
    req.params
  );
  const receipt = await markNotificationRead(notificationId, req.user);
  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: receipt,
  });
};

export const deliverNotificationHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const {
    params: { notificationId },
    body: { channels },
  } = deliverNotificationRequestSchema.parse({
    params: req.params,
    body: req.body,
  });
  const results = await deliverNotificationToSelf(
    notificationId,
    channels,
    req.user
  );
  const hasFailure = results.some((result) => result.status === "failed");
  res.status(hasFailure ? 207 : 200).json({
    success: !hasFailure,
    message: hasFailure
      ? "One or more notification channels failed"
      : "Notification delivered successfully",
    data: results,
  });
};

export const streamNotificationsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  await streamNotifications(req.user, res);
};