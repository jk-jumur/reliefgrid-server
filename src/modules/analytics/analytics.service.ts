import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { analyticsOverviewSchema } from "../../validators/analytics.validator.js";

type OverviewQuery = z.infer<typeof analyticsOverviewSchema>["query"];

export const getAnalyticsOverview = async (
  query: OverviewQuery,
  user: AuthenticatedUser
) => {
  if (user.role !== "system_admin" && user.role !== "emergency_coordinator") {
    throw new HttpError(403, "Only emergency coordinators and system admins can access analytics");
  }
  const db = await connectDB();
  const incidents = db.collection("incidents");
  const requests = db.collection("emergencyRequests");
  const resources = db.collection("resources");
  const shelters = db.collection("shelters");
  const volunteers = db.collection("volunteers");
  const startDate = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

  const [
    activeIncidentGroups,
    incidentCategories,
    pendingRequestCount,
    requestTrends,
    resourceTotals,
    activeShelterCount,
    volunteerAvailability,
    responseTime,
  ] = await Promise.all([
    incidents.aggregate<{
      count: number;
      affectedPeople: number;
    }>([
      { $match: { status: { $nin: ["resolved", "closed"] } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          affectedPeople: { $sum: "$affectedPopulation" },
        },
      },
    ]).toArray(),
    incidents.aggregate<{ category: string; count: number }>([
      { $match: { status: { $nin: ["resolved", "closed"] } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $project: { _id: 0, category: "$_id", count: 1 } },
      { $sort: { count: -1, category: 1 } },
    ]).toArray(),
    requests.countDocuments({ status: { $in: ["pending", "under_review"] } }),
    requests.aggregate<{ date: string; count: number }>([
      { $match: { submittedAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: "UTC" },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ]).toArray(),
    resources.aggregate<{
      available: number;
      distributed: number;
    }>([
      {
        $group: {
          _id: null,
          available: { $sum: "$availableQuantity" },
          distributed: { $sum: "$distributedQuantity" },
        },
      },
    ]).toArray(),
    shelters.countDocuments({ status: { $in: ["active", "full"] } }),
    volunteers.aggregate<{ availability: string; count: number }>([
      { $group: { _id: "$availability", count: { $sum: 1 } } },
      { $project: { _id: 0, availability: "$_id", count: 1 } },
    ]).toArray(),
    incidents.aggregate<{ averageMilliseconds: number }>([
      { $unwind: "$incidentHistory" },
      { $match: { "incidentHistory.status": "in_progress" } },
      {
        $group: {
          _id: "$_id",
          createdAt: { $first: "$createdAt" },
          responseStartedAt: { $min: "$incidentHistory.timestamp" },
        },
      },
      {
        $project: {
          responseMilliseconds: {
            $subtract: ["$responseStartedAt", "$createdAt"],
          },
        },
      },
      { $match: { responseMilliseconds: { $gte: 0 } } },
      {
        $group: {
          _id: null,
          averageMilliseconds: { $avg: "$responseMilliseconds" },
        },
      },
    ]).toArray(),
  ]);

  const volunteerCounts = Object.fromEntries(
    volunteerAvailability.map(({ availability, count }) => [availability, count])
  ) as Record<string, number>;
  const activeIncidents = activeIncidentGroups[0] ?? {
    count: 0,
    affectedPeople: 0,
  };

  const inventory = resourceTotals[0] ?? { available: 0, distributed: 0 };

  return {
    generatedAt: new Date().toISOString(),
    periodDays: query.days,
    summary: {
      activeIncidents: activeIncidents.count,
      totalAffectedPeople: activeIncidents.affectedPeople,
      pendingRequests: pendingRequestCount,
      availableResourceUnits: inventory.available,
      activeShelters: activeShelterCount,
      availableVolunteers: volunteerCounts.available ?? 0,
      assignedVolunteers: volunteerCounts.assigned ?? 0,
      unavailableVolunteers: volunteerCounts.unavailable ?? 0,
      resourcesDistributed: inventory.distributed,
      averageResponseTimeMinutes: responseTime[0]
        ? Math.round(responseTime[0].averageMilliseconds / 60_000)
        : null,
    },
    incidentCategories,
    emergencyRequestTrends: requestTrends,
  };
};
