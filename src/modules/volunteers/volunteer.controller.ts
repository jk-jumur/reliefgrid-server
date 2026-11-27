import type { Response } from "express";

import type { ExtendedRequest } from "../../types/request.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listVolunteersSchema,
  updateVolunteerSchema,
  volunteerIdParamsSchema,
} from "../../validators/volunteer.validator.js";
import {
  listEligibleVolunteerAccounts,
  createVolunteer,
  getVolunteerById,
  listVolunteers,
  updateVolunteer,
} from "./volunteer.service.js";

export const listEligibleVolunteerAccountsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const accounts = await listEligibleVolunteerAccounts();
  res.status(200).json({ success: true, data: accounts });
};

export const createVolunteerHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const volunteer = await createVolunteer(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Volunteer profile created successfully",
    data: volunteer,
  });
};

export const listVolunteersHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listVolunteersSchema.shape.query.parse(req.validatedQuery);
  const result = await listVolunteers(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getVolunteerHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { volunteerId } = volunteerIdParamsSchema.shape.params.parse(req.params);
  const volunteer = await getVolunteerById(volunteerId, req.user);
  res.status(200).json({ success: true, data: volunteer });
};

export const updateVolunteerHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { volunteerId } = volunteerIdParamsSchema.shape.params.parse(req.params);
  const data = updateVolunteerSchema.shape.body.parse(req.body);
  const volunteer = await updateVolunteer(volunteerId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Volunteer profile updated successfully",
    data: volunteer,
  });
};