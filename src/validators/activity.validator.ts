import { z } from "zod";

export const activityEntityTypeEnum = z.enum([
  "incident",
  "emergency_request",
  "resource",
  "allocation",
  "shelter",
  "volunteer",
  "team",
  "task",
  "field_report",
  "organization",
  "user_access",
]);

export const listActivityLogsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    entityType: activityEntityTypeEnum.optional(),
    actorId: z.string().trim().min(1).max(128).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }).refine(
    ({ from, to }) => !from || !to || new Date(from) <= new Date(to),
    { message: "'from' must be earlier than or equal to 'to'" }
  ),
});
