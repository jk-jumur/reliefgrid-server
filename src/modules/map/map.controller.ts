import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import { mapOperationsSchema } from "../../validators/map.validator.js";
import { getMapOperations } from "./map.service.js";

export const mapOperationsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = mapOperationsSchema.shape.query.parse(req.validatedQuery);
  const operations = await getMapOperations(query, req.user);
  res.status(200).json({ success: true, data: operations });
};
