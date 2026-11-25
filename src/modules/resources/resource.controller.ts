import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  listResourcesSchema,
  resourceIdParamsSchema,
  resourceMovementSchema,
  updateResourceSchema,
} from "../../validators/resource.validator.js";
import {
  createResource,
  getResourceById,
  listResources,
  moveResourceStock,
  updateResource,
} from "./resource.service.js";

export const createResourceHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const resource = await createResource(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Resource registered successfully",
    data: resource,
  });
};

export const listResourcesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listResourcesSchema.shape.query.parse(req.validatedQuery);
  const result = await listResources(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getResourceHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { resourceId } = resourceIdParamsSchema.shape.params.parse(req.params);
  const resource = await getResourceById(resourceId, req.user);
  res.status(200).json({ success: true, data: resource });
};

export const updateResourceHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { resourceId } = resourceIdParamsSchema.shape.params.parse(req.params);
  const data = updateResourceSchema.shape.body.parse(req.body);
  const resource = await updateResource(resourceId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Resource updated successfully",
    data: resource,
  });
};

export const moveResourceStockHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { resourceId } = resourceIdParamsSchema.shape.params.parse(req.params);
  const data = resourceMovementSchema.shape.body.parse(req.body);
  const resource = await moveResourceStock(resourceId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Stock movement recorded successfully",
    data: resource,
  });
};
