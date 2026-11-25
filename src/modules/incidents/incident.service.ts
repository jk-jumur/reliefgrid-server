import {
  ObjectId,
  type Document,
  type Filter,
  type UpdateFilter,
} from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import { HttpError } from "../../utils/http-error.js";
import { assertActiveUserRole } from "../../utils/user-validation.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import {
  createIncidentSchema,
  listIncidentsSchema,
  updateIncidentSchema,
} from "../../validators/incident.validator.js";
import { calculateIncidentPriority } from "./incident.priority.js";
import type {
  IncidentDocument,
  IncidentHistoryEntry,
  IncidentPriority,
} from "./incident.model.js";

type CreateIncidentInput = z.infer<typeof createIncidentSchema>["body"];
type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>["query"];
type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>["body"];

const priorityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;

const statusTransitions: Record<
  IncidentDocument["status"],
  IncidentDocument["status"][]
> = {
  reported: ["under_review", "verified", "in_progress", "closed"],
  under_review: ["verified", "in_progress", "closed"],
  verified: ["in_progress", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getIncidentsCollection = async () => {
  const db = await connectDB();
  return db.collection<IncidentDocument>("incidents");
};

const refreshPriority = async (
  collection: Awaited<ReturnType<typeof getIncidentsCollection>>,
  incident: IncidentDocument,
  now: Date
): Promise<void> => {
  if (
    !incident._id ||
    incident.priorityOverridden ||
    incident.status === "resolved" ||
    incident.status === "closed"
  ) {
    return;
  }

  const { score, priority } = calculateIncidentPriority(
    incident.severity,
    incident.affectedPopulation,
    incident.locationRisk ?? "medium",
    incident.createdAt,
    now
  );

  if (score === incident.priorityScore && priority === incident.priority) {
    return;
  }

  const priorityChanged = priority !== incident.priority;
  const update: UpdateFilter<IncidentDocument> = {
    $set: {
      priority,
      priorityScore: score,
      ...(priorityChanged ? { updatedAt: now } : {}),
    },
  };

  if (priorityChanged) {
    update.$push = {
      incidentHistory: {
        action: "priority_changed",
        status: incident.status,
        priority,
        timestamp: now,
        changedBy: null,
        details: [`Priority recalculated from ${incident.priority} to ${priority}`],
      },
    };
  }

  await collection.updateOne(
    {
      _id: incident._id,
      priority: incident.priority,
      priorityScore: incident.priorityScore,
      priorityOverridden: { $ne: true },
    },
    update
  );
};

const refreshActivePriorities = async (
  collection: Awaited<ReturnType<typeof getIncidentsCollection>>,
  now: Date
): Promise<void> => {
  const activeIncidents = await collection.find({
    status: { $nin: ["resolved", "closed"] },
    priorityOverridden: { $ne: true },
  }).toArray();

  await Promise.all(
    activeIncidents.map((incident) => refreshPriority(collection, incident, now))
  );
};

export const createIncident = async (
  data: CreateIncidentInput,
  reporter: AuthenticatedUser
) => {
  const collection = await getIncidentsCollection();
  const now = new Date();
  const { score: priorityScore, priority } = calculateIncidentPriority(
    data.severity,
    data.affectedPopulation,
    data.locationRisk,
    now,
    now
  );

  const incident: IncidentDocument = {
    ...data,
    priority,
    priorityScore,
    priorityOverridden: false,
    status: "reported",
    assignedCoordinator: null,
    reportedBy: reporter.id,
    organizationId: reporter.organizationId,
    incidentHistory: [
      {
        action: "incident_reported",
        status: "reported",
        priority,
        timestamp: now,
        changedBy: reporter.id,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(incident);

  return {
    ...incident,
    _id: result.insertedId,
  };
};

export const listIncidents = async (query: ListIncidentsQuery) => {
  const collection = await getIncidentsCollection();
  const now = new Date();
  await refreshActivePriorities(collection, now);

  const filter: Filter<IncidentDocument> = {};

  if (query.category) filter.category = query.category;
  if (query.severity) filter.severity = query.severity;
  if (query.priority) filter.priority = query.priority;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const searchPattern = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { title: searchPattern },
      { description: searchPattern },
      { location: searchPattern },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const pipeline: Document[] = [
    { $match: filter },
    {
      $addFields: {
        priorityRank: {
          $switch: {
            branches: Object.entries(priorityRank).map(([priority, rank]) => ({
              case: { $eq: ["$priority", priority] },
              then: rank,
            })),
            default: 0,
          },
        },
      },
    },
    { $sort: { priorityRank: -1, createdAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: query.limit },
    { $project: { priorityRank: 0 } },
  ];

  const [items, total] = await Promise.all([
    collection.aggregate<IncidentDocument>(pipeline).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getIncidentById = async (incidentId: string) => {
  const collection = await getIncidentsCollection();
  const _id = new ObjectId(incidentId);
  const incident = await collection.findOne({ _id });

  if (!incident) {
    throw new HttpError(404, "Incident not found");
  }

  await refreshPriority(collection, incident, new Date());
  const refreshedIncident = await collection.findOne({ _id });

  if (!refreshedIncident) {
    throw new HttpError(404, "Incident not found");
  }

  return refreshedIncident;
};

export const updateIncident = async (
  incidentId: string,
  data: UpdateIncidentInput,
  actor: AuthenticatedUser
) => {
  const collection = await getIncidentsCollection();
  const _id = new ObjectId(incidentId);
  const current = await collection.findOne({ _id });

  if (!current) {
    throw new HttpError(404, "Incident not found");
  }

  if (current.status === "closed") {
    throw new HttpError(409, "Closed incidents cannot be changed");
  }

  const now = new Date();
  const {
    priority: requestedPriority,
    status: requestedStatus,
    assignedCoordinator,
    ...fields
  } = data;
  const nextStatus = requestedStatus ?? current.status;

  if (
    requestedStatus &&
    requestedStatus !== current.status &&
    !statusTransitions[current.status].includes(requestedStatus)
  ) {
    throw new HttpError(
      409,
      `Incident status cannot change from ${current.status} to ${requestedStatus}`
    );
  }

  if (assignedCoordinator) {
    await assertActiveUserRole(
      assignedCoordinator,
      "emergency_coordinator",
      "Assigned user must be an active emergency coordinator"
    );
  }

  const nextCoordinator =
    assignedCoordinator === undefined
      ? current.assignedCoordinator
      : assignedCoordinator;
  const nextSeverity = fields.severity ?? current.severity;
  const nextAffectedPopulation =
    fields.affectedPopulation ?? current.affectedPopulation;
  const nextLocationRisk =
    fields.locationRisk ?? current.locationRisk ?? "medium";

  let nextPriority = current.priority;
  let nextPriorityScore = current.priorityScore;
  let priorityOverridden = current.priorityOverridden ?? false;

  if (requestedPriority) {
    nextPriority = requestedPriority;
    nextPriorityScore = calculateIncidentPriority(
      nextSeverity,
      nextAffectedPopulation,
      nextLocationRisk,
      current.createdAt,
      now
    ).score;
    priorityOverridden = true;
  } else if (!priorityOverridden && nextStatus !== "resolved" && nextStatus !== "closed") {
    const calculatedPriority = calculateIncidentPriority(
      nextSeverity,
      nextAffectedPopulation,
      nextLocationRisk,
      current.createdAt,
      now
    );
    nextPriorityScore = calculatedPriority.score;
    nextPriority = calculatedPriority.priority;
  }

  const history: IncidentHistoryEntry[] = [];

  if (requestedStatus && requestedStatus !== current.status) {
    history.push({
      action: "status_changed",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: [`Status changed from ${current.status} to ${nextStatus}`],
    });
  }

  if (nextPriority !== current.priority) {
    history.push({
      action: "priority_changed",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: [`Priority changed from ${current.priority} to ${nextPriority}`],
    });
  }

  if (
    assignedCoordinator !== undefined &&
    assignedCoordinator !== current.assignedCoordinator
  ) {
    history.push({
      action: "coordinator_assigned",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: [
        assignedCoordinator
          ? `Coordinator assigned: ${assignedCoordinator}`
          : "Coordinator assignment removed",
      ],
    });
  }

  const updatedFieldNames = Object.keys(fields);

  if (updatedFieldNames.length > 0) {
    history.push({
      action: "incident_updated",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: updatedFieldNames.map((field) => `Updated ${field}`),
    });
  }

  const update: UpdateFilter<IncidentDocument> = {
    $set: {
      ...fields,
      status: nextStatus,
      assignedCoordinator: nextCoordinator,
      locationRisk: nextLocationRisk,
      priority: nextPriority,
      priorityScore: nextPriorityScore,
      priorityOverridden,
      updatedAt: now,
    },
  };

  if (history.length > 0) {
    update.$push = { incidentHistory: { $each: history } };
  }

  const result = await collection.updateOne(
    {
      _id,
      updatedAt: current.updatedAt,
      priority: current.priority,
      priorityScore: current.priorityScore,
    },
    update
  );

  if (result.matchedCount === 0) {
    throw new HttpError(409, "Incident changed during this update; reload and try again");
  }

  return collection.findOne({ _id });
};
