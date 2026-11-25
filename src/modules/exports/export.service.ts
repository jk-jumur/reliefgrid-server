import type { Document, Filter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { exportDataSchema } from "../../validators/export.validator.js";

type ExportDataset = z.infer<typeof exportDataSchema>["params"]["dataset"];
type ExportQuery = z.infer<typeof exportDataSchema>["query"];

export { toCsv } from "./export.csv.js";

const getCollectionName = (dataset: ExportDataset): string => {
  switch (dataset) {
    case "incidents":
      return "incidents";
    case "emergency-requests":
      return "emergencyRequests";
    case "resources":
      return "resources";
    case "volunteers":
      return "volunteers";
  }
};

const getAccessFilter = (
  dataset: ExportDataset,
  user: AuthenticatedUser
): Filter<Document> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role !== "relief_organization" || !user.organizationId) {
    throw new HttpError(403, "You cannot export this dataset");
  }
  if (dataset === "resources") {
    return { organizationId: user.organizationId };
  }
  if (dataset === "emergency-requests") {
    return {
      $or: [
        { organizationId: user.organizationId },
        { assignedOrganizationId: user.organizationId },
      ],
    };
  }
  if (dataset === "incidents") {
    return {
      $or: [
        { organizationId: user.organizationId },
        { reportedBy: user.id },
      ],
    };
  }
  throw new HttpError(403, "You cannot export volunteer records");
};

export const getExportData = async (
  dataset: ExportDataset,
  query: ExportQuery,
  user: AuthenticatedUser
): Promise<Document[]> => {
  const db = await connectDB();
  const collection = db.collection(getCollectionName(dataset));
  const dateField = dataset === "emergency-requests" ? "submittedAt" : "createdAt";
  const filter: Filter<Document> = { ...getAccessFilter(dataset, user) };
  const dateRange: { $gte?: Date; $lte?: Date } = {};
  if (query.from) dateRange.$gte = new Date(query.from);
  if (query.to) dateRange.$lte = new Date(query.to);
  if (Object.keys(dateRange).length) {
    filter[dateField] = dateRange;
  }
  return collection.find(filter).sort({ [dateField]: -1 }).limit(query.limit).toArray();
};
