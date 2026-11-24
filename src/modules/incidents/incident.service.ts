
import { connectDB } from "../../config/database.js";
import type { IncidentDocument } from "./incident.model.js";
import type { z } from "zod";
import type { createIncidentSchema } from "../../validators/incident.validator.js";

type CreateIncidentInput = z.infer<
  typeof createIncidentSchema
>["body"];

export const createIncident = async (
  data: CreateIncidentInput
) => {
  const db = await connectDB();

  const incidents = db.collection<IncidentDocument>("incidents");

  const now = new Date();

  const incident: IncidentDocument = {
    ...data,
    priority: data.severity,
    status: "reported",
    assignedCoordinator: null,
    reportedBy: null,
    incidentHistory: [
      {
        action: "incident_reported",
        status: "reported",
        timestamp: now,
        changedBy: null,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const result = await incidents.insertOne(incident);

  return {
    ...incident,
    _id: result.insertedId,
  };
};
