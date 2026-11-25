import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  deliverNotificationRequestSchema,
  notificationIdParamsSchema,
} from "../../validators/notification.validator.js";
import {
  deliverNotificationHandler,
  listNotificationsHandler,
  markNotificationReadHandler,
  streamNotificationsHandler,
} from "./notification.controller.js";

const router = Router();

router.get("/", authenticate, listNotificationsHandler);
router.get("/stream", authenticate, streamNotificationsHandler);
router.post(
  "/:notificationId/deliver",
  authenticate,
  validateRequest(deliverNotificationRequestSchema),
  deliverNotificationHandler
);
router.patch(
  "/:notificationId/read",
  authenticate,
  validateRequest(notificationIdParamsSchema),
  markNotificationReadHandler
);

export default router;
