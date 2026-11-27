import type { Request, Response } from "express";

import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { listActivityLogsSchema } from "../../validators/activity.validator.js";
import { listActivityLogs } from "./activity-log.service.js";

type ExtendedRequest = Request & {
  user?: AuthenticatedUser;
  validatedQuery?: unknown;
};

export const listActivityLogsHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listActivityLogsSchema.shape.query.parse(req.validatedQuery);
  const result = await listActivityLogs(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};