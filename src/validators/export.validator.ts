import { z } from "zod";

export const exportDatasetEnum = z.enum([
  "incidents",
  "emergency-requests",
  "resources",
  "volunteers",
]);

export const exportDataSchema = z.object({
  params: z.object({
    dataset: exportDatasetEnum,
  }),
  query: z.object({
    format: z.enum(["json", "csv"]).default("json"),
    limit: z.coerce.number().int().min(1).max(5000).default(1000),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }).refine(
    ({ from, to }) => !from || !to || new Date(from) <= new Date(to),
    { message: "'from' must be earlier than or equal to 'to'" }
  ),
});

export const emergencyReportSchema = z.object({
  query: z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  }),
});
