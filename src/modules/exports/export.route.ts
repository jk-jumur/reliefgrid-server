import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  emergencyReportSchema,
  exportDataSchema,
} from "../../validators/export.validator.js";
import {
  emergencyReportHandler,
  exportDataHandler,
} from "./export.controller.js";

const router = Router();

router.get(
  "/emergency-report.pdf",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(emergencyReportSchema),
  emergencyReportHandler
);
router.get(
  "/:dataset",
  authenticate,
  authorizeRoles(
    "relief_organization",
    "emergency_coordinator",
    "system_admin"
  ),
  validateRequest(exportDataSchema),
  exportDataHandler
);

export default router;
