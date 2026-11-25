import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  analyticsOverviewSchema,
  demandForecastSchema,
} from "../../validators/analytics.validator.js";
import {
  analyticsOverviewHandler,
  demandForecastHandler,
} from "./analytics.controller.js";

const router = Router();

router.get(
  "/overview",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(analyticsOverviewSchema),
  analyticsOverviewHandler
);
router.get(
  "/demand-forecast",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(demandForecastSchema),
  demandForecastHandler
);

export default router;
