import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  listTeamsSchema,
  teamIdParamsSchema,
  updateTeamSchema,
} from "../../validators/team.validator.js";
import {
  createTeam,
  getTeamById,
  listTeams,
  updateTeam,
} from "./team.service.js";

export const createTeamHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const team = await createTeam(req.body, req.user);
  res.status(201).json({
    success: true,
    message: "Team created and volunteers assigned successfully",
    data: team,
  });
};

export const listTeamsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listTeamsSchema.shape.query.parse(req.validatedQuery);
  const result = await listTeams(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getTeamHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { teamId } = teamIdParamsSchema.shape.params.parse(req.params);
  const team = await getTeamById(teamId, req.user);
  res.status(200).json({ success: true, data: team });
};

export const updateTeamHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { teamId } = teamIdParamsSchema.shape.params.parse(req.params);
  const data = updateTeamSchema.shape.body.parse(req.body);
  const team = await updateTeam(teamId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Team updated successfully",
    data: team,
  });
};
