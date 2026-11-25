import {
  ObjectId,
  type Document,
  type Filter,
  type UpdateFilter,
} from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import { getPlatformConfiguration } from "../../config/platform-configuration.js";
import { HttpError } from "../../utils/http-error.js";
import {
  assertActiveOrganization,
  assertActiveUserRole,
} from "../../utils/user-validation.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import {
  createEmergencyRequestSchema,
  listEmergencyRequestsSchema,
  updateEmergencyRequestSchema,
} from "../../validators/emergency-request.validator.js";
import type {
  EmergencyRequestDocument,
  EmergencyRequestHistoryEntry,
  EmergencyRequestPriority,
} from "./emergency-request.model.js";
import { calculateEmergencyRequestPriority } from "./emergency-request.priority.js";

type CreateRequestInput = z.infer<typeof createEmergencyRequestSchema>["body"];
type ListRequestsQuery = z.infer<typeof listEmergencyRequestsSchema>["query"];
type UpdateRequestInput = z.infer<typeof updateEmergencyRequestSchema>["body"];

const priorityRank: Record<EmergencyRequestPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const statusTransitions: Record<
  EmergencyRequestDocument["status"],
  EmergencyRequestDocument["status"][]
> = {
  pending: ["under_review", "rejected"],
  under_review: ["verified", "rejected"],
  verified: ["assigned", "rejected"],
  assigned: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  rejected: [],
};

let indexesPromise: Promise<void> | null = null;

const getRequestsCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<EmergencyRequestDocument>("emergencyRequests");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ requestedBy: 1, requestType: 1, submittedAt: -1 }),
      collection.createIndex({ organizationId: 1, status: 1 }),
      collection.createIndex({ assignedOrganizationId: 1, status: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }

  await indexesPromise;
  return collection;
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const distanceInMeters = (
  first: EmergencyRequestDocument["coordinates"],
  second: EmergencyRequestDocument["coordinates"]
): number => {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDifference = radians(second.latitude - first.latitude);
  const longitudeDifference = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const refreshPriority = async (
  collection: Awaited<ReturnType<typeof getRequestsCollection>>,
  request: EmergencyRequestDocument,
  now: Date
): Promise<void> => {
  if (
    !request._id ||
    request.priorityOverridden ||
    request.status === "completed" ||
    request.status === "rejected"
  ) {
    return;
  }

  const { score, priority } = calculateEmergencyRequestPriority(
    request.urgency,
    request.requestType,
    request.affectedPeople,
    request.locationRisk,
    request.submittedAt,
    now
  );

  if (score === request.priorityScore && priority === request.priority) {
    return;
  }

  const priorityChanged = priority !== request.priority;
  const update: UpdateFilter<EmergencyRequestDocument> = {
    $set: {
      priority,
      priorityScore: score,
      ...(priorityChanged ? { updatedAt: now } : {}),
    },
  };

  if (priorityChanged) {
    update.$push = {
      requestHistory: {
        action: "priority_changed",
        status: request.status,
        priority,
        timestamp: now,
        changedBy: null,
        details: [`Priority recalculated from ${request.priority} to ${priority}`],
      },
    };
  }

  await collection.updateOne(
    {
      _id: request._id,
      priority: request.priority,
      priorityScore: request.priorityScore,
      priorityOverridden: { $ne: true },
    },
    update
  );
};

const getReadScope = (user: AuthenticatedUser): Filter<EmergencyRequestDocument> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }

  if (user.role === "citizen") {
    return { requestedBy: user.id };
  }

  if (user.role === "relief_organization" && user.organizationId) {
    return {
      $or: [
        { organizationId: user.organizationId },
        { assignedOrganizationId: user.organizationId },
      ],
    };
  }

  return { _id: { $exists: false } };
};

const assertCanRead = (
  request: EmergencyRequestDocument,
  user: AuthenticatedUser
): void => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return;
  }

  if (user.role === "citizen" && request.requestedBy === user.id) {
    return;
  }

  if (
    user.role === "relief_organization" &&
    user.organizationId &&
    (request.organizationId === user.organizationId ||
      request.assignedOrganizationId === user.organizationId)
  ) {
    return;
  }

  throw new HttpError(404, "Emergency request not found");
};

export const createEmergencyRequest = async (
  data: CreateRequestInput,
  reporter: AuthenticatedUser
) => {
  const collection = await getRequestsCollection();
  const now = new Date();

  if (data.incidentId) {
    const db = await connectDB();
    const relatedIncident = await db.collection("incidents").findOne({
      _id: new ObjectId(data.incidentId),
    });
    if (!relatedIncident) {
      throw new HttpError(422, "Related incident does not exist");
    }
  }

  const platformConfiguration = await getPlatformConfiguration();
  const duplicateWindowMs =
    platformConfiguration.requestDuplicateDetection.windowMinutes * 60 * 1000;
  const duplicateRadiusMeters =
    platformConfiguration.requestDuplicateDetection.radiusMeters;
  const recentRequests = await collection.find({
    requestedBy: reporter.id,
    requestType: data.requestType,
    submittedAt: { $gte: new Date(now.getTime() - duplicateWindowMs) },
    status: { $nin: ["completed", "rejected"] },
  }).toArray();

  const duplicate = recentRequests.find((request) =>
    distanceInMeters(data.coordinates, request.coordinates) <= duplicateRadiusMeters
  );

  if (duplicate) {
    throw new HttpError(
      409,
      "A similar request was already submitted near this location in the last 30 minutes"
    );
  }

  const { score: priorityScore, priority } = calculateEmergencyRequestPriority(
    data.urgency,
    data.requestType,
    data.affectedPeople,
    data.locationRisk,
    now,
    now
  );
  const request: EmergencyRequestDocument = {
    ...data,
    incidentId: data.incidentId ?? null,
    requestedBy: reporter.id,
    organizationId: reporter.organizationId,
    assignedOrganizationId: null,
    assignedCoordinator: null,
    priority,
    priorityScore,
    priorityOverridden: false,
    status: "pending",
    submittedAt: now,
    updatedAt: now,
    requestHistory: [
      {
        action: "request_submitted",
        status: "pending",
        priority,
        timestamp: now,
        changedBy: reporter.id,
      },
    ],
  };

  const result = await collection.insertOne(request);

  return {
    ...request,
    _id: result.insertedId,
  };
};

export const listEmergencyRequests = async (
  query: ListRequestsQuery,
  user: AuthenticatedUser
) => {
  const collection = await getRequestsCollection();
  const scope = getReadScope(user);
  const now = new Date();
  const activeRequests = await collection.find({
    $and: [
      scope,
      { status: { $nin: ["completed", "rejected"] } },
      { priorityOverridden: { $ne: true } },
    ],
  }).toArray();

  await Promise.all(
    activeRequests.map((request) => refreshPriority(collection, request, now))
  );

  const filters: Filter<EmergencyRequestDocument>[] = [scope];

  if (query.requestType) filters.push({ requestType: query.requestType });
  if (query.priority) filters.push({ priority: query.priority });
  if (query.status) filters.push({ status: query.status });
  if (query.search) {
    const searchPattern = new RegExp(escapeRegex(query.search), "i");
    filters.push({
      $or: [
        { description: searchPattern },
        { location: searchPattern },
        { requestType: searchPattern },
      ],
    });
  }

  const filter: Filter<EmergencyRequestDocument> = { $and: filters };
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
    { $sort: { priorityRank: -1, submittedAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: query.limit },
    { $project: { priorityRank: 0 } },
  ];

  const [items, total] = await Promise.all([
    collection.aggregate<EmergencyRequestDocument>(pipeline).toArray(),
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

export const getEmergencyRequestById = async (
  requestId: string,
  user: AuthenticatedUser
) => {
  const collection = await getRequestsCollection();
  const _id = new ObjectId(requestId);
  const request = await collection.findOne({ _id });

  if (!request) {
    throw new HttpError(404, "Emergency request not found");
  }
  assertCanRead(request, user);

  await refreshPriority(collection, request, new Date());
  const refreshedRequest = await collection.findOne({ _id });

  if (!refreshedRequest) {
    throw new HttpError(404, "Emergency request not found");
  }

  return refreshedRequest;
};

export const updateEmergencyRequest = async (
  requestId: string,
  data: UpdateRequestInput,
  actor: AuthenticatedUser
) => {
  const collection = await getRequestsCollection();
  const _id = new ObjectId(requestId);
  const current = await collection.findOne({ _id });

  if (!current) {
    throw new HttpError(404, "Emergency request not found");
  }

  const isReliefOrganization = actor.role === "relief_organization";
  if (isReliefOrganization) {
    assertCanRead(current, actor);
    if (
      current.assignedOrganizationId !== actor.organizationId ||
      Object.keys(data).some((field) => field !== "status") ||
      (data.status !== "in_progress" && data.status !== "completed")
    ) {
      throw new HttpError(403, "Organizations may only update the progress of assigned requests");
    }
  }

  if (current.status === "completed" || current.status === "rejected") {
    throw new HttpError(409, "Completed or rejected requests cannot be changed");
  }

  const now = new Date();
  const {
    status: requestedStatus,
    priority: requestedPriority,
    assignedCoordinator,
    assignedOrganizationId,
    rejectionReason,
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
      `Request status cannot change from ${current.status} to ${requestedStatus}`
    );
  }

  if (assignedCoordinator) {
    await assertActiveUserRole(
      assignedCoordinator,
      "emergency_coordinator",
      "Assigned user must be an active emergency coordinator"
    );
  }

  if (assignedOrganizationId) {
    await assertActiveOrganization(assignedOrganizationId);
  }

  const nextOrganization =
    assignedOrganizationId === undefined
      ? current.assignedOrganizationId
      : assignedOrganizationId;
  const nextCoordinator =
    assignedCoordinator === undefined
      ? current.assignedCoordinator
      : assignedCoordinator;

  if (nextStatus === "assigned" && !nextOrganization) {
    throw new HttpError(422, "An active organization must be assigned before the request can be assigned");
  }

  if (assignedOrganizationId && nextStatus !== "assigned") {
    throw new HttpError(422, "Assigning an organization requires status 'assigned'");
  }

  if (nextStatus === "rejected" && !rejectionReason && !current.rejectionReason) {
    throw new HttpError(422, "A rejection reason is required");
  }
  if (rejectionReason && nextStatus !== "rejected") {
    throw new HttpError(422, "A rejection reason can only be set for a rejected request");
  }

  const nextUrgency = fields.urgency ?? current.urgency;
  const nextAffectedPeople = fields.affectedPeople ?? current.affectedPeople;
  let nextPriority = current.priority;
  let nextPriorityScore = current.priorityScore;
  let priorityOverridden = current.priorityOverridden;

  if (requestedPriority) {
    nextPriority = requestedPriority;
    nextPriorityScore = calculateEmergencyRequestPriority(
      nextUrgency,
      current.requestType,
      nextAffectedPeople,
      current.locationRisk,
      current.submittedAt,
      now
    ).score;
    priorityOverridden = true;
  } else if (!priorityOverridden && nextStatus !== "completed" && nextStatus !== "rejected") {
    const calculatedPriority = calculateEmergencyRequestPriority(
      nextUrgency,
      current.requestType,
      nextAffectedPeople,
      current.locationRisk,
      current.submittedAt,
      now
    );
    nextPriorityScore = calculatedPriority.score;
    nextPriority = calculatedPriority.priority;
  }

  const history: EmergencyRequestHistoryEntry[] = [];

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
    (assignedCoordinator !== undefined &&
      assignedCoordinator !== current.assignedCoordinator) ||
    (assignedOrganizationId !== undefined &&
      assignedOrganizationId !== current.assignedOrganizationId)
  ) {
    history.push({
      action: "assigned",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: [
        `Coordinator: ${nextCoordinator ?? "unassigned"}`,
        `Organization: ${nextOrganization ?? "unassigned"}`,
      ],
    });
  }

  const updatedFields = Object.keys(fields);
  if (rejectionReason) updatedFields.push("rejectionReason");
  if (updatedFields.length > 0) {
    history.push({
      action: "request_updated",
      status: nextStatus,
      priority: nextPriority,
      timestamp: now,
      changedBy: actor.id,
      details: updatedFields.map((field) => `Updated ${field}`),
    });
  }

  const update: UpdateFilter<EmergencyRequestDocument> = {
    $set: {
      ...fields,
      ...(rejectionReason ? { rejectionReason } : {}),
      status: nextStatus,
      assignedOrganizationId: nextOrganization,
      assignedCoordinator: nextCoordinator,
      priority: nextPriority,
      priorityScore: nextPriorityScore,
      priorityOverridden,
      ...(nextStatus === "assigned" && !current.assignedAt ? { assignedAt: now } : {}),
      ...(nextStatus === "completed" ? { completedAt: now } : {}),
      updatedAt: now,
    },
  };

  if (history.length > 0) {
    update.$push = { requestHistory: { $each: history } };
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
    throw new HttpError(409, "Request changed during this update; reload and try again");
  }

  return collection.findOne({ _id });
};
