import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  listSheltersSchema,
  nearestShelterSchema,
  shelterIdParamsSchema,
  updateShelterOccupancySchema,
  updateShelterSchema,
} from "../../validators/shelter.validator.js";
import {
  createShelter,
  findNearestAvailableShelters,
  getShelterById,
  getShelterReports,
  listShelters,
  updateShelter,
  updateShelterOccupancy,
} from "./shelter.service.js";

export const createShelterHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const shelter = await createShelter(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Shelter registered successfully",
    data: shelter,
  });
};

export const listSheltersHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listSheltersSchema.shape.query.parse(req.validatedQuery);
  const result = await listShelters(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getShelterReportsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reports = await getShelterReports(req.user);
  res.status(200).json({ success: true, data: reports });
};

export const findNearestSheltersHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = nearestShelterSchema.shape.query.parse(req.validatedQuery);
  const shelters = await findNearestAvailableShelters(query);
  res.status(200).json({ success: true, data: shelters });
};

export const getShelterHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { shelterId } = shelterIdParamsSchema.shape.params.parse(req.params);
  const shelter = await getShelterById(shelterId, req.user);
  res.status(200).json({ success: true, data: shelter });
};

export const updateShelterHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { shelterId } = shelterIdParamsSchema.shape.params.parse(req.params);
  const data = updateShelterSchema.shape.body.parse(req.body);
  const shelter = await updateShelter(shelterId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Shelter updated successfully",
    data: shelter,
  });
};

export const updateShelterOccupancyHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { shelterId } = shelterIdParamsSchema.shape.params.parse(req.params);
  const data = updateShelterOccupancySchema.shape.body.parse(req.body);
  const shelter = await updateShelterOccupancy(shelterId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Shelter occupancy updated successfully",
    data: shelter,
  });
};
