import type { Request, Response } from "express";

import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  emergencyReportSchema,
  exportDataSchema,
} from "../../validators/export.validator.js";
import { getExportData, toCsv } from "./export.service.js";
import { generateEmergencyReport } from "./emergency-report.service.js";

type ExtendedRequest = Request & {
  user?: AuthenticatedUser;
  validatedQuery?: unknown;
};

export const emergencyReportHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = emergencyReportSchema.shape.query.parse(req.validatedQuery);
  const report = await generateEmergencyReport(query);
  const date = new Date().toISOString().slice(0, 10);
  res
    .status(200)
    .type("application/pdf")
    .attachment(`reliefgrid-emergency-report-${date}.pdf`)
    .send(report);
};

export const exportDataHandler = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { dataset } = exportDataSchema.shape.params.parse(req.params);
  const query = exportDataSchema.shape.query.parse(req.validatedQuery);
  const items = await getExportData(dataset, query, req.user);
  const date = new Date().toISOString().slice(0, 10);

  if (query.format === "csv") {
    res
      .status(200)
      .type("text/csv")
      .attachment(`${dataset}-${date}.csv`)
      .send(toCsv(items));
    return;
  }

  res.status(200).json({
    success: true,
    dataset,
    count: items.length,
    data: items,
  });
};