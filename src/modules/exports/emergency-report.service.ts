import type { z } from "zod";

import type { AuthenticatedUser } from "../../types/auth.types.js";
import { getAnalyticsOverview } from "../analytics/analytics.service.js";
import { createEmergencyReportPdf } from "./emergency-report.pdf.js";
import { emergencyReportSchema } from "../../validators/export.validator.js";

type EmergencyReportQuery = z.infer<typeof emergencyReportSchema>["query"];

export const generateEmergencyReport = async (
  query: EmergencyReportQuery,
  user: AuthenticatedUser
): Promise<Buffer> => {
  const overview = await getAnalyticsOverview({ days: query.days }, user);
  return createEmergencyReportPdf(overview);
};
