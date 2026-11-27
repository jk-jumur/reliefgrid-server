import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createVolunteerSchema,
  listVolunteersSchema,
  updateVolunteerRequestSchema,
  volunteerIdParamsSchema,
} from "../../validators/volunteer.validator.js";
import {
  listEligibleVolunteerAccountsHandler,
  createVolunteerHandler,
  getVolunteerHandler,
  listVolunteersHandler,
  updateVolunteerHandler,
} from "./volunteer.controller.js";

const volunteerReaders = ["volunteer", "emergency_coordinator", "system_admin"] as const;
const router = Router();

router.get(
  "/eligible-accounts",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  listEligibleVolunteerAccountsHandler
);
router.get(
  "/",
  authenticate,
  authorizeRoles(...volunteerReaders),
  validateRequest(listVolunteersSchema),
  listVolunteersHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles("volunteer", "emergency_coordinator", "system_admin"),
  validateRequest(createVolunteerSchema),
  createVolunteerHandler
);
router.get(
  "/:volunteerId",
  authenticate,
  authorizeRoles(...volunteerReaders),
  validateRequest(volunteerIdParamsSchema),
  getVolunteerHandler
);
router.patch(
  "/:volunteerId",
  authenticate,
  authorizeRoles(...volunteerReaders),
  validateRequest(updateVolunteerRequestSchema),
  updateVolunteerHandler
);

export default router;
