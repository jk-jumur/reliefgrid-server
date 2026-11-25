import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createEmergencyRequestSchema,
  emergencyRequestIdParamsSchema,
  listEmergencyRequestsSchema,
  updateEmergencyRequestRequestSchema,
} from "../../validators/emergency-request.validator.js";
import {
  createEmergencyRequestHandler,
  getEmergencyRequestHandler,
  listEmergencyRequestsHandler,
  updateEmergencyRequestHandler,
} from "./emergency-request.controller.js";

const requestReaders = [
  "citizen",
  "relief_organization",
  "emergency_coordinator",
  "system_admin",
] as const;

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles(...requestReaders),
  validateRequest(listEmergencyRequestsSchema),
  listEmergencyRequestsHandler
);

router.post(
  "/",
  authenticate,
  authorizeRoles(...requestReaders),
  validateRequest(createEmergencyRequestSchema),
  createEmergencyRequestHandler
);

router.get(
  "/:requestId",
  authenticate,
  authorizeRoles(...requestReaders),
  validateRequest(emergencyRequestIdParamsSchema),
  getEmergencyRequestHandler
);

router.patch(
  "/:requestId",
  authenticate,
  authorizeRoles(
    "relief_organization",
    "emergency_coordinator",
    "system_admin"
  ),
  validateRequest(updateEmergencyRequestRequestSchema),
  updateEmergencyRequestHandler
);

export default router;
