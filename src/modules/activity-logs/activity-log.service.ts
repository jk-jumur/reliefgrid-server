import type { Document } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { listActivityLogsSchema } from "../../validators/activity.validator.js";

type ActivityQuery = z.infer<typeof listActivityLogsSchema>["query"];

interface ActivityLogRecord {
  eventId: string;
  timestamp: Date;
  action: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  details: unknown;
}

const sourcePipelines: Array<{ collection: string; pipeline: Document[] }> = [
  {
    collection: "incidents",
    pipeline: [
      { $unwind: "$incidentHistory" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "incident:",
              { $toString: "$_id" },
              ":",
              { $toString: "$incidentHistory.timestamp" },
              ":",
              "$incidentHistory.action",
            ],
          },
          timestamp: "$incidentHistory.timestamp",
          action: "$incidentHistory.action",
          actorId: "$incidentHistory.changedBy",
          entityType: { $literal: "incident" },
          entityId: { $toString: "$_id" },
          details: "$incidentHistory.details",
        },
      },
    ],
  },
  {
    collection: "emergencyRequests",
    pipeline: [
      { $unwind: "$requestHistory" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "emergency_request:",
              { $toString: "$_id" },
              ":",
              { $toString: "$requestHistory.timestamp" },
              ":",
              "$requestHistory.action",
            ],
          },
          timestamp: "$requestHistory.timestamp",
          action: "$requestHistory.action",
          actorId: "$requestHistory.changedBy",
          entityType: { $literal: "emergency_request" },
          entityId: { $toString: "$_id" },
          details: "$requestHistory.details",
        },
      },
    ],
  },
  {
    collection: "resources",
    pipeline: [
      { $unwind: "$stockHistory" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "resource:",
              { $toString: "$_id" },
              ":",
              { $toString: "$stockHistory.timestamp" },
              ":",
              "$stockHistory.action",
            ],
          },
          timestamp: "$stockHistory.timestamp",
          action: "$stockHistory.action",
          actorId: "$stockHistory.changedBy",
          entityType: { $literal: "resource" },
          entityId: { $toString: "$_id" },
          details: {
            reason: "$stockHistory.reason",
            quantityChange: "$stockHistory.quantityChange",
          },
        },
      },
    ],
  },
  {
    collection: "resourceAllocations",
    pipeline: [
      { $unwind: "$history" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "allocation:",
              { $toString: "$_id" },
              ":",
              { $toString: "$history.timestamp" },
              ":",
              "$history.status",
            ],
          },
          timestamp: "$history.timestamp",
          action: { $literal: "distribution_status_changed" },
          actorId: "$history.changedBy",
          entityType: { $literal: "allocation" },
          entityId: { $toString: "$_id" },
          details: "$history.details",
        },
      },
    ],
  },
  {
    collection: "shelters",
    pipeline: [
      { $unwind: "$activityHistory" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "shelter:",
              { $toString: "$_id" },
              ":",
              { $toString: "$activityHistory.timestamp" },
              ":",
              "$activityHistory.action",
            ],
          },
          timestamp: "$activityHistory.timestamp",
          action: "$activityHistory.action",
          actorId: "$activityHistory.changedBy",
          entityType: { $literal: "shelter" },
          entityId: { $toString: "$_id" },
          details: "$activityHistory.details",
        },
      },
    ],
  },
  {
    collection: "volunteers",
    pipeline: [
      { $unwind: "$history" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "volunteer:",
              { $toString: "$_id" },
              ":",
              { $toString: "$history.timestamp" },
              ":",
              "$history.action",
            ],
          },
          timestamp: "$history.timestamp",
          action: "$history.action",
          actorId: "$history.changedBy",
          entityType: { $literal: "volunteer" },
          entityId: { $toString: "$_id" },
          details: "$history.details",
        },
      },
    ],
  },
  {
    collection: "teams",
    pipeline: [
      { $unwind: "$history" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "team:",
              { $toString: "$_id" },
              ":",
              { $toString: "$history.timestamp" },
              ":",
              "$history.status",
            ],
          },
          timestamp: "$history.timestamp",
          action: { $literal: "team_status_changed" },
          actorId: "$history.changedBy",
          entityType: { $literal: "team" },
          entityId: { $toString: "$_id" },
          details: "$history.details",
        },
      },
    ],
  },
  {
    collection: "tasks",
    pipeline: [
      { $unwind: "$history" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "task:",
              { $toString: "$_id" },
              ":",
              { $toString: "$history.timestamp" },
              ":",
              "$history.status",
            ],
          },
          timestamp: "$history.timestamp",
          action: { $literal: "task_status_changed" },
          actorId: "$history.changedBy",
          entityType: { $literal: "task" },
          entityId: { $toString: "$_id" },
          details: "$history.details",
        },
      },
    ],
  },
  {
    collection: "organizations",
    pipeline: [
      { $unwind: "$history" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "organization:",
              "$_id",
              ":",
              { $toString: "$history.timestamp" },
              ":",
              "$history.action",
            ],
          },
          timestamp: "$history.timestamp",
          action: "$history.action",
          actorId: "$history.changedBy",
          entityType: { $literal: "organization" },
          entityId: "$_id",
          details: "$history.details",
        },
      },
    ],
  },
  {
    collection: "user",
    pipeline: [
      { $unwind: "$activityHistory" },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "user_access:",
              { $toString: { $ifNull: ["$id", "$_id"] } },
              ":",
              { $toString: "$activityHistory.timestamp" },
            ],
          },
          timestamp: "$activityHistory.timestamp",
          action: "$activityHistory.action",
          actorId: "$activityHistory.changedBy",
          entityType: { $literal: "user_access" },
          entityId: { $toString: { $ifNull: ["$id", "$_id"] } },
          details: "$activityHistory.details",
        },
      },
    ],
  },
  {
    collection: "tasks",
    pipeline: [
      { $unwind: "$fieldReports" },
      {
        $lookup: {
          from: "volunteers",
          localField: "fieldReports.volunteerId",
          foreignField: "_id",
          as: "volunteerProfile",
        },
      },
      { $unwind: { path: "$volunteerProfile", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          eventId: {
            $concat: [
              "field_report:",
              { $toString: "$_id" },
              ":",
              { $toString: "$fieldReports.createdAt" },
            ],
          },
          timestamp: "$fieldReports.createdAt",
          action: { $literal: "field_report_submitted" },
          actorId: {
            $ifNull: [
              "$volunteerProfile.userId",
              { $toString: "$fieldReports.volunteerId" },
            ],
          },
          entityType: { $literal: "field_report" },
          entityId: { $toString: "$_id" },
          details: {
            taskTitle: "$title",
            photoCount: {
              $size: { $ifNull: ["$fieldReports.photoUrls", []] },
            },
          },
        },
      },
    ],
  },
];

export const listActivityLogs = async (
  query: ActivityQuery,
  user: AuthenticatedUser
) => {
  if (user.role !== "system_admin" && user.role !== "emergency_coordinator") {
    throw new HttpError(403, "Only emergency coordinators and system admins can view activity logs");
  }
  const db = await connectDB();
  const skip = (query.page - 1) * query.limit;
  const limit = skip + query.limit;
  const match: Document = {};
  if (query.entityType) match.entityType = query.entityType;
  if (query.actorId) match.actorId = query.actorId;
  if (query.from || query.to) {
    match.timestamp = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to ? { $lte: new Date(query.to) } : {}),
    };
  }

  const perSource = await Promise.all(
    sourcePipelines.map(async ({ collection, pipeline }) => {
      const base = db.collection(collection);
      const filtered = [...pipeline, { $match: match }];
      const [items, totals] = await Promise.all([
        base.aggregate<ActivityLogRecord>([
          ...filtered,
          { $sort: { timestamp: -1, eventId: -1 } },
          { $limit: limit },
        ]).toArray(),
        base.aggregate<{ total: number }>([
          ...filtered,
          { $count: "total" },
        ]).toArray(),
      ]);
      return { items, total: totals[0]?.total ?? 0 };
    })
  );

  const records = perSource.flatMap((source) => source.items);
  records.sort((first, second) =>
    second.timestamp.getTime() - first.timestamp.getTime() ||
    second.eventId.localeCompare(first.eventId)
  );
  const total = perSource.reduce((sum, source) => sum + source.total, 0);
  return {
    items: records.slice(skip, limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};
