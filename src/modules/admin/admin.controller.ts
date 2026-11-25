import type { Request, Response } from "express";

import {
  getPlatformConfiguration,
  updatePlatformConfiguration,
} from "../../config/platform-configuration.js";
import { HttpError } from "../../utils/http-error.js";
import {
  adminUserIdParamsSchema,
  listAdminUsersSchema,
  updatePlatformConfigurationSchema,
  updateAdminUserSchema,
} from "../../validators/admin.validator.js";
import {
  getAdminUserById,
  listAdminUsers,
  updateAdminUser,
} from "./admin.service.js";

export const listAdminUsersHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listAdminUsersSchema.shape.query.parse(req.validatedQuery);
  const result = await listAdminUsers(query);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getAdminUserHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId } = adminUserIdParamsSchema.shape.params.parse(req.params);
  const user = await getAdminUserById(userId);
  res.status(200).json({ success: true, data: user });
};

export const updateAdminUserHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { userId } = adminUserIdParamsSchema.shape.params.parse(req.params);
  const data = updateAdminUserSchema.shape.body.parse(req.body);
  const user = await updateAdminUser(userId, data, req.user.id);
  res.status(200).json({
    success: true,
    message: "User access updated successfully",
    data: user,
  });
};

export const getPlatformConfigurationHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const configuration = await getPlatformConfiguration();
  res.status(200).json({ success: true, data: configuration });
};

export const updatePlatformConfigurationHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const data = updatePlatformConfigurationSchema.shape.body.parse(req.body);
  const configuration = await updatePlatformConfiguration(data, req.user.id);
  res.status(200).json({
    success: true,
    message: "Platform configuration updated successfully",
    data: configuration,
  });
};
