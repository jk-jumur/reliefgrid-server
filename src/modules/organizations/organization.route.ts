import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createOrganizationSchema,
  listOrganizationsSchema,
  updateOrganizationRequestSchema,
} from "../../validators/organization.validator.js";
import {
  createOrganizationHandler,
  listOrganizationsHandler,
  updateOrganizationHandler,
} from "./organization.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(listOrganizationsSchema),
  listOrganizationsHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(createOrganizationSchema),
  createOrganizationHandler
);
router.patch(
  "/:organizationId",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(updateOrganizationRequestSchema),
  updateOrganizationHandler
);

export default router;
