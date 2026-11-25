import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createShelterSchema,
  listSheltersSchema,
  nearestShelterSchema,
  shelterIdParamsSchema,
  updateShelterOccupancyRequestSchema,
  updateShelterRequestSchema,
} from "../../validators/shelter.validator.js";
import {
  createShelterHandler,
  getShelterHandler,
  getShelterReportsHandler,
  findNearestSheltersHandler,
  listSheltersHandler,
  updateShelterHandler,
  updateShelterOccupancyHandler,
} from "./shelter.controller.js";

const shelterReaders = [
  "shelter_manager",
  "emergency_coordinator",
  "system_admin",
] as const;
const shelterManagers = [
  "shelter_manager",
  "emergency_coordinator",
  "system_admin",
] as const;

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles(...shelterReaders),
  validateRequest(listSheltersSchema),
  listSheltersHandler
);
router.get(
  "/reports",
  authenticate,
  authorizeRoles(...shelterReaders),
  getShelterReportsHandler
);
router.get(
  "/nearest",
  authenticate,
  authorizeRoles(
    "citizen",
    "relief_organization",
    "shelter_manager",
    "emergency_coordinator",
    "system_admin"
  ),
  validateRequest(nearestShelterSchema),
  findNearestSheltersHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles(...shelterManagers),
  validateRequest(createShelterSchema),
  createShelterHandler
);
router.get(
  "/:shelterId",
  authenticate,
  authorizeRoles(...shelterReaders),
  validateRequest(shelterIdParamsSchema),
  getShelterHandler
);
router.patch(
  "/:shelterId",
  authenticate,
  authorizeRoles(...shelterManagers),
  validateRequest(updateShelterRequestSchema),
  updateShelterHandler
);
router.post(
  "/:shelterId/occupancy",
  authenticate,
  authorizeRoles(...shelterManagers),
  validateRequest(updateShelterOccupancyRequestSchema),
  updateShelterOccupancyHandler
);

export default router;
