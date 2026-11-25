import { z } from "zod";

const photoReferenceSchema = z.union([
  z.url().refine((value) => /^https?:\/\//i.test(value), {
    message: "Photo URLs must use HTTP or HTTPS",
  }),
  z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/i),
]);

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const taskStatusEnum = z.enum([
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);

const taskDetailsSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(2000),
  location: z.string().trim().min(3).max(300),
  coordinates: coordinatesSchema,
  incidentId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  emergencyRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

export const createTaskSchema = z.object({
  body: taskDetailsSchema.extend({
    teamId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    volunteerIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  }).refine(
    (body) => Boolean(body.teamId || (body.volunteerIds && body.volunteerIds.length)),
    { message: "Assign a team or at least one volunteer" }
  ).refine(
    (body) => new Set(body.volunteerIds ?? []).size === (body.volunteerIds ?? []).length,
    { message: "Duplicate volunteer IDs are not allowed" }
  ),
});

export const autoAssignTaskSchema = z.object({
  body: taskDetailsSchema.extend({
    requiredSkills: z.array(z.string().trim().min(2).max(100))
      .min(1)
      .max(20)
      .refine(
        (skills) => new Set(skills.map((skill) => skill.toLocaleLowerCase())).size === skills.length,
        { message: "Duplicate required skills are not allowed" }
      ),
    volunteerCount: z.number().int().min(1).max(50),
  }),
});

export const listTasksSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: taskStatusEnum.optional(),
    incidentId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    teamId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  }),
});

export const taskIdParamsSchema = z.object({
  params: z.object({
    taskId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid task ID"),
  }),
});

export const updateTaskStatusSchema = z.object({
  body: z.object({
    status: taskStatusEnum,
  }),
});

export const createFieldReportSchema = z.object({
  body: z.object({
    report: z.string().trim().min(5).max(3000),
    photoUrls: z.array(photoReferenceSchema).max(10).default([]),
  }),
});

export const updateTaskStatusRequestSchema = z.object({
  params: taskIdParamsSchema.shape.params,
  body: updateTaskStatusSchema.shape.body,
});

export const createFieldReportRequestSchema = z.object({
  params: taskIdParamsSchema.shape.params,
  body: createFieldReportSchema.shape.body,
});
