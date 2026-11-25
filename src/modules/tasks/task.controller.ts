import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  autoAssignTaskSchema,
  createFieldReportSchema,
  listTasksSchema,
  taskIdParamsSchema,
  updateTaskStatusSchema,
} from "../../validators/task.validator.js";
import {
  autoAssignTask,
  createTask,
  getTaskById,
  listTasks,
  submitFieldReport,
  updateTaskStatus,
} from "./task.service.js";

export const createTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const task = await createTask(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Volunteer task assigned successfully",
    data: task,
  });
};

export const autoAssignTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const data = autoAssignTaskSchema.shape.body.parse(req.body);
  const task = await autoAssignTask(data, req.user);
  res.status(201).json({
    success: true,
    message: "Available volunteers matched and assigned successfully",
    data: task,
  });
};

export const listTasksHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listTasksSchema.shape.query.parse(req.validatedQuery);
  const result = await listTasks(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { taskId } = taskIdParamsSchema.shape.params.parse(req.params);
  const task = await getTaskById(taskId, req.user);
  res.status(200).json({ success: true, data: task });
};

export const updateTaskStatusHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { taskId } = taskIdParamsSchema.shape.params.parse(req.params);
  const data = updateTaskStatusSchema.shape.body.parse(req.body);
  const task = await updateTaskStatus(taskId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Task status updated successfully",
    data: task,
  });
};

export const submitFieldReportHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { taskId } = taskIdParamsSchema.shape.params.parse(req.params);
  const data = createFieldReportSchema.shape.body.parse(req.body);
  const report = await submitFieldReport(taskId, data, req.user);
  res.status(201).json({
    success: true,
    message: "Field report submitted successfully",
    data: report,
  });
};
