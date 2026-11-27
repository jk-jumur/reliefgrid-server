import type { Request, Response } from "express";

import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  incidentIdParamsSchema,
  listIncidentsSchema,
  updateIncidentSchema,
} from "../../validators/incident.validator.js";
import {
  createIncident,
  getIncidentById,
  listIncidents,
  updateIncident,
} from "./incident.service.js";

type ExtendedRequest = Request & {
  user?: AuthenticatedUser;
  validatedQuery?: unknown;
};

export const createIncidentHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const incident = await createIncident(req.body, req.user);

  res.status(201).json({
    success: true,
    message: "Incident reported successfully",
    data: incident,
  });
};

export const listIncidentsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  const query = listIncidentsSchema.shape.query.parse(req.validatedQuery);
  const result = await listIncidents(query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getIncidentHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  const { incidentId } = incidentIdParamsSchema.shape.params.parse(req.params);
  const incident = await getIncidentById(incidentId);

  res.status(200).json({
    success: true,
    data: incident,
  });
};

export const updateIncidentHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  const { incidentId } = incidentIdParamsSchema.shape.params.parse(req.params);
  const data = updateIncidentSchema.shape.body.parse(req.body);
  const incident = await updateIncident(incidentId, data, req.user);

  res.status(200).json({
    success: true,
    message: "Incident updated successfully",
    data: incident,
  });
};