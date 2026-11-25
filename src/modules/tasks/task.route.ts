import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  autoAssignTaskSchema,
  createFieldReportRequestSchema,
  createTaskSchema,
  listTasksSchema,
  taskIdParamsSchema,
  updateTaskStatusRequestSchema,
} from "../../validators/task.validator.js";
import {
  autoAssignTaskHandler,
  createTaskHandler,
  getTaskHandler,
  listTasksHandler,
  submitFieldReportHandler,
  updateTaskStatusHandler,
} from "./task.controller.js";

const taskReaders = ["volunteer", "emergency_coordinator", "system_admin"] as const;
const router = Router();

router.post(
  "/auto-assign",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(autoAssignTaskSchema),
  autoAssignTaskHandler
);
router.get(
  "/",
  authenticate,
  authorizeRoles(...taskReaders),
  validateRequest(listTasksSchema),
  listTasksHandler
);
router.post(
  "/",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  validateRequest(createTaskSchema),
  createTaskHandler
);
router.get(
  "/:taskId",
  authenticate,
  authorizeRoles(...taskReaders),
  validateRequest(taskIdParamsSchema),
  getTaskHandler
);
router.patch(
  "/:taskId/status",
  authenticate,
  authorizeRoles(...taskReaders),
  validateRequest(updateTaskStatusRequestSchema),
  updateTaskStatusHandler
);
router.post(
  "/:taskId/reports",
  authenticate,
  authorizeRoles("volunteer"),
  validateRequest(createFieldReportRequestSchema),
  submitFieldReportHandler
);

export default router;
