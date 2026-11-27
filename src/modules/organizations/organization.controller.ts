import type { Response } from "express";

import type { ExtendedRequest } from "../../types/request.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createOrganizationSchema,
  listOrganizationsSchema,
  organizationIdParamsSchema,
  updateOrganizationSchema,
} from "../../validators/organization.validator.js";
import {
  createOrganization,
  listOrganizations,
  updateOrganization,
} from "./organization.service.js";

export const createOrganizationHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const data = createOrganizationSchema.shape.body.parse(req.body);
  const organization = await createOrganization(data, req.user);
  res.status(201).json({
    success: true,
    message: "Organization created successfully",
    data: organization,
  });
};

export const listOrganizationsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listOrganizationsSchema.shape.query.parse(req.validatedQuery);
  const result = await listOrganizations(query);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const updateOrganizationHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { organizationId } = organizationIdParamsSchema.shape.params.parse(
    req.params
  );
  const data = updateOrganizationSchema.shape.body.parse(req.body);
  const organization = await updateOrganization(organizationId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Organization updated successfully",
    data: organization,
  });
};