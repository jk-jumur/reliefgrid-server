import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  adminUserIdParamsSchema,
  listAdminUsersSchema,
  updatePlatformConfigurationSchema,
  updateAdminUserRequestSchema,
} from "../../validators/admin.validator.js";
import {
  getPlatformConfigurationHandler,
  getAdminUserHandler,
  listAdminUsersHandler,
  updateAdminUserHandler,
  updatePlatformConfigurationHandler,
} from "./admin.controller.js";

const router = Router();

router.get(
  "/configurations",
  authenticate,
  authorizeRoles("system_admin"),
  getPlatformConfigurationHandler
);
router.patch(
  "/configurations",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(updatePlatformConfigurationSchema),
  updatePlatformConfigurationHandler
);
router.get(
  "/users",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(listAdminUsersSchema),
  listAdminUsersHandler
);
router.get(
  "/users/:userId",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(adminUserIdParamsSchema),
  getAdminUserHandler
);
router.patch(
  "/users/:userId",
  authenticate,
  authorizeRoles("system_admin"),
  validateRequest(updateAdminUserRequestSchema),
  updateAdminUserHandler
);

export default router;
