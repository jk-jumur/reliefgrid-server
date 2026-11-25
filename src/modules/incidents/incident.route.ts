import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createIncidentSchema,
  incidentIdParamsSchema,
  listIncidentsSchema,
  updateIncidentRequestSchema,
} from "../../validators/incident.validator.js";
import {
  createIncidentHandler,
  getIncidentHandler,
  listIncidentsHandler,
  updateIncidentHandler,
} from "./incident.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  validateRequest(listIncidentsSchema),
  listIncidentsHandler
);

router.post(
  "/",
  authenticate,
  authorizeRoles(
    "citizen",
    "relief_organization",
    "emergency_coordinator",
    "system_admin"
  ),
  validateRequest(createIncidentSchema),
  createIncidentHandler
);

router.get(
  "/:incidentId",
  authenticate,
  validateRequest(incidentIdParamsSchema),
  getIncidentHandler
);

router.patch(
  "/:incidentId",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(updateIncidentRequestSchema),
  updateIncidentHandler
);

export default router;