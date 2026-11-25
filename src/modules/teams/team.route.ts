import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createTeamSchema,
  listTeamsSchema,
  teamIdParamsSchema,
  updateTeamRequestSchema,
} from "../../validators/team.validator.js";
import {
  createTeamHandler,
  getTeamHandler,
  listTeamsHandler,
  updateTeamHandler,
} from "./team.controller.js";

const teamReaders = ["volunteer", "emergency_coordinator", "system_admin"] as const;
const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles(...teamReaders),
  validateRequest(listTeamsSchema),
  listTeamsHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(createTeamSchema),
  createTeamHandler
);
router.get(
  "/:teamId",
  authenticate,
  authorizeRoles(...teamReaders),
  validateRequest(teamIdParamsSchema),
  getTeamHandler
);
router.patch(
  "/:teamId",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(updateTeamRequestSchema),
  updateTeamHandler
);

export default router;
