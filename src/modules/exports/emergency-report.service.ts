import type { z } from "zod";

import { getAnalyticsOverview } from "../analytics/analytics.service.js";
import { createEmergencyReportPdf } from "./emergency-report.pdf.js";
import { emergencyReportSchema } from "../../validators/export.validator.js";

type EmergencyReportQuery = z.infer<typeof emergencyReportSchema>["query"];

export const generateEmergencyReport = async (
  query: EmergencyReportQuery
): Promise<Buffer> => {
  const overview = await getAnalyticsOverview({ days: query.days });
  return createEmergencyReportPdf(overview);
};
