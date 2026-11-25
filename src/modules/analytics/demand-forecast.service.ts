import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { emergencyRequestCategoryEnum } from "../../validators/emergency-request.validator.js";
import { demandForecastSchema } from "../../validators/analytics.validator.js";
import { forecastDailyDemand } from "./demand-forecast.js";

type DemandForecastQuery = z.infer<typeof demandForecastSchema>["query"];

export const getDemandForecast = async (
  query: DemandForecastQuery,
  user: AuthenticatedUser,
  now = new Date()
) => {
  if (user.role !== "system_admin" && user.role !== "emergency_coordinator") {
    throw new HttpError(403, "Only emergency coordinators and system admins can access demand forecasts");
  }

  const db = await connectDB();
  const startDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - query.lookbackDays + 1
  ));
  const dailyRows = await db.collection("emergencyRequests").aggregate<{
    date: string;
    requestType: string;
    count: number;
  }>([
    { $match: { submittedAt: { $gte: startDate, $lte: now } } },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$submittedAt",
              timezone: "UTC",
            },
          },
          requestType: "$requestType",
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id.date",
        requestType: "$_id.requestType",
        count: 1,
      },
    },
  ]).toArray();
  const dailyTotals = new Map(
    dailyRows.map(({ date, requestType, count }) => [
      `${date}:${requestType}`,
      count,
    ])
  );
  const days = Array.from({ length: query.lookbackDays }, (_, index) =>
    new Date(startDate.getTime() + index * 86_400_000).toISOString().slice(0, 10)
  );

  const byCategory = emergencyRequestCategoryEnum.options.map((requestType) => {
    const observations = days.map((date) =>
      dailyTotals.get(`${date}:${requestType}`) ?? 0
    );
    return {
      requestType,
      historyDays: observations.length,
      ...forecastDailyDemand(observations, query.horizonDays),
    };
  });

  return {
    generatedAt: now.toISOString(),
    lookbackDays: query.lookbackDays,
    horizonDays: query.horizonDays,
    forecastMethod: "daily_linear_trend",
    totalProjectedRequests: byCategory.reduce(
      (total, category) => total + category.projectedRequests,
      0
    ),
    byCategory,
  };
};
