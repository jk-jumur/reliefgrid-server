import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { mapOperationsSchema } from "../../validators/map.validator.js";
import { mapOperationsHandler } from "./map.controller.js";

const router = Router();

router.get(
  "/operations",
  authenticate,
  authorizeRoles(
    "citizen",
    "relief_organization",
    "volunteer",
    "shelter_manager",
    "emergency_coordinator",
    "system_admin"
  ),
  validateRequest(mapOperationsSchema),
  mapOperationsHandler
);

export default router;
