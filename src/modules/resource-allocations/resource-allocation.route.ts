import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  createResourceAllocationSchema,
  listResourceAllocationsSchema,
  resourceAllocationIdParamsSchema,
  updateResourceAllocationRequestSchema,
  verifyAllocationDeliverySchema,
} from "../../validators/resource-allocation.validator.js";
import {
  createResourceAllocationHandler,
  getResourceAllocationHandler,
  listResourceAllocationsHandler,
  updateResourceAllocationHandler,
  createAllocationVerificationQrHandler,
  verifyAllocationDeliveryHandler,
} from "./resource-allocation.controller.js";

const allocationReaders = [
  "relief_organization",
  "emergency_coordinator",
  "system_admin",
] as const;

const router = Router();

router.post(
  "/verify-delivery",
  authenticate,
  authorizeRoles("citizen", "emergency_coordinator", "system_admin"),
  validateRequest(verifyAllocationDeliverySchema),
  verifyAllocationDeliveryHandler
);
router.post(
  "/:allocationId/verification-qr",
  authenticate,
  authorizeRoles("relief_organization", "emergency_coordinator", "system_admin"),
  validateRequest(resourceAllocationIdParamsSchema),
  createAllocationVerificationQrHandler
);
router.get(
  "/",
  authenticate,
  authorizeRoles(...allocationReaders),
  validateRequest(listResourceAllocationsSchema),
  listResourceAllocationsHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles(...allocationReaders),
  validateRequest(createResourceAllocationSchema),
  createResourceAllocationHandler
);
router.get(
  "/:allocationId",
  authenticate,
  authorizeRoles(...allocationReaders),
  validateRequest(resourceAllocationIdParamsSchema),
  getResourceAllocationHandler
);
router.patch(
  "/:allocationId",
  authenticate,
  authorizeRoles(...allocationReaders),
  validateRequest(updateResourceAllocationRequestSchema),
  updateResourceAllocationHandler
);

export default router;
