import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createResourceSchema,
  listResourcesSchema,
  resourceIdParamsSchema,
  resourceMovementRequestSchema,
  updateResourceRequestSchema,
} from "../../validators/resource.validator.js";
import {
  createResourceHandler,
  getResourceHandler,
  listResourcesHandler,
  moveResourceStockHandler,
  updateResourceHandler,
} from "./resource.controller.js";

const resourceReaders = [
  "relief_organization",
  "emergency_coordinator",
  "system_admin",
] as const;
const resourceManagers = ["relief_organization", "system_admin"] as const;

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles(...resourceReaders),
  validateRequest(listResourcesSchema),
  listResourcesHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles(...resourceManagers),
  validateRequest(createResourceSchema),
  createResourceHandler
);
router.get(
  "/:resourceId",
  authenticate,
  authorizeRoles(...resourceReaders),
  validateRequest(resourceIdParamsSchema),
  getResourceHandler
);
router.patch(
  "/:resourceId",
  authenticate,
  authorizeRoles(...resourceManagers),
  validateRequest(updateResourceRequestSchema),
  updateResourceHandler
);
router.post(
  "/:resourceId/movements",
  authenticate,
  authorizeRoles(...resourceManagers),
  validateRequest(resourceMovementRequestSchema),
  moveResourceStockHandler
);

export default router;
