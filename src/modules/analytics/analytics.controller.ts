import type { Request, Response } from "express";

import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  analyticsOverviewSchema,
  demandForecastSchema,
} from "../../validators/analytics.validator.js";
import {
  getAnalyticsOverview,
} from "./analytics.service.js";
import { getDemandForecast } from "./demand-forecast.service.js";

type ExtendedRequest = Request & {
  user?: AuthenticatedUser;
  validatedQuery?: unknown;
};

export const analyticsOverviewHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = analyticsOverviewSchema.shape.query.parse(req.validatedQuery);
  const overview = await getAnalyticsOverview(query);
  res.status(200).json({ success: true, data: overview });
};

export const demandForecastHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = demandForecastSchema.shape.query.parse(req.validatedQuery);
  const forecast = await getDemandForecast(query, req.user);
  res.status(200).json({ success: true, data: forecast });
};