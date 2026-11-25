import { ObjectId, type Document } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import type { EmergencyRequestDocument } from "../emergency-requests/emergency-request.model.js";
import type { IncidentDocument } from "../incidents/incident.model.js";
import type { ShelterDocument } from "../shelters/shelter.model.js";
import type { TaskDocument } from "../tasks/task.model.js";
import type { VolunteerDocument } from "../volunteers/volunteer.model.js";
import { mapOperationsSchema } from "../../validators/map.validator.js";

type MapQuery = z.infer<typeof mapOperationsSchema>["query"];

interface MapCoordinates {
  latitude: number;
  longitude: number;
}

const withinBounds = (
  coordinates: MapCoordinates,
  query: MapQuery
): boolean =>
  query.south === undefined ||
  query.north === undefined ||
  query.west === undefined ||
  query.east === undefined ||
  (
    coordinates.latitude >= query.south &&
    coordinates.latitude <= query.north &&
    coordinates.longitude >= query.west &&
    coordinates.longitude <= query.east
  );

export const getMapOperations = async (
  query: MapQuery,
  user: AuthenticatedUser
) => {
  if (![
    "citizen",
    "relief_organization",
    "volunteer",
    "shelter_manager",
    "emergency_coordinator",
    "system_admin",
  ].includes(user.role)) {
    throw new HttpError(403, "You cannot access map operations");
  }
  const db = await connectDB();
  const incidentFilter: Document = { status: { $nin: ["resolved", "closed"] } };
  const requestFilter: Document = { status: { $nin: ["completed", "rejected"] } };
  const taskFilter: Document = { status: { $in: ["assigned", "in_progress"] } };
  const shelterFilter: Document = { status: { $in: ["active", "full"] } };

  if (user.role === "citizen") {
    requestFilter.requestedBy = user.id;
  } else if (user.role === "relief_organization" && user.organizationId) {
    incidentFilter.$or = [
      { organizationId: user.organizationId },
      { reportedBy: user.id },
    ];
    requestFilter.$or = [
      { organizationId: user.organizationId },
      { assignedOrganizationId: user.organizationId },
    ];
  } else if (user.role === "volunteer") {
    const profile = await db.collection<VolunteerDocument>("volunteers")
      .findOne({ userId: user.id });
    taskFilter.volunteerIds = profile?._id ?? { $exists: false };
    incidentFilter._id = { $exists: false };
    requestFilter._id = { $exists: false };
  } else if (user.role === "shelter_manager") {
    shelterFilter.shelterManagerId = user.id;
    incidentFilter._id = { $exists: false };
    requestFilter._id = { $exists: false };
    taskFilter._id = { $exists: false };
  }

  const coordinateFilter: Document = query.south === undefined
    ? {}
    : {
        "coordinates.latitude": { $gte: query.south, $lte: query.north },
        "coordinates.longitude": { $gte: query.west, $lte: query.east },
      };

  const [incidents, requests, shelters, tasks] = await Promise.all([
    db.collection<IncidentDocument>("incidents").find({
      ...incidentFilter,
      ...coordinateFilter,
    }).sort({ priority: -1, createdAt: -1 }).limit(query.limit).toArray(),
    db.collection<EmergencyRequestDocument>("emergencyRequests").find({
      ...requestFilter,
      ...coordinateFilter,
    }).sort({ priority: -1, submittedAt: -1 }).limit(query.limit).toArray(),
    db.collection<ShelterDocument>("shelters").find({
      ...shelterFilter,
      ...coordinateFilter,
    }).sort({ status: 1, availableCapacity: -1 }).limit(query.limit).toArray(),
    db.collection<TaskDocument>("tasks").find({
      ...taskFilter,
      ...coordinateFilter,
    }).sort({ updatedAt: -1 }).limit(query.limit).toArray(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    incidents: incidents.filter((item) => withinBounds(item.coordinates, query)),
    emergencyRequests: requests.filter((item) => withinBounds(item.coordinates, query)),
    shelters: shelters.filter((item) => withinBounds(item.coordinates, query)),
    tasks: tasks.filter((item) => withinBounds(item.coordinates, query)),
  };
};
