import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  emergencyRequestIdParamsSchema,
  listEmergencyRequestsSchema,
  updateEmergencyRequestSchema,
} from "../../validators/emergency-request.validator.js";
import {
  createEmergencyRequest,
  getEmergencyRequestById,
  listEmergencyRequests,
  updateEmergencyRequest,
} from "./emergency-request.service.js";

export const createEmergencyRequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const request = await createEmergencyRequest(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Emergency request submitted successfully",
    data: request,
  });
};

export const listEmergencyRequestsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const query = listEmergencyRequestsSchema.shape.query.parse(req.validatedQuery);
  const result = await listEmergencyRequests(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getEmergencyRequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const { requestId } = emergencyRequestIdParamsSchema.shape.params.parse(req.params);
  const request = await getEmergencyRequestById(requestId, req.user);
  res.status(200).json({
    success: true,
    data: request,
  });
};

export const updateEmergencyRequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const { requestId } = emergencyRequestIdParamsSchema.shape.params.parse(req.params);
  const data = updateEmergencyRequestSchema.shape.body.parse(req.body);
  const request = await updateEmergencyRequest(requestId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Emergency request updated successfully",
    data: request,
  });
};
