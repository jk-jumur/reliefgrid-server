import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { listActivityLogsSchema } from "../../validators/activity.validator.js";
import { listActivityLogsHandler } from "./activity-log.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(listActivityLogsSchema),
  listActivityLogsHandler
);

export default router;
