import { z } from "zod";

export const analyticsOverviewSchema = z.object({
  query: z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  }),
});

export const demandForecastSchema = z.object({
  query: z.object({
    lookbackDays: z.coerce.number().int().min(7).max(365).default(30),
    horizonDays: z.coerce.number().int().min(1).max(30).default(7),
  }),
});
