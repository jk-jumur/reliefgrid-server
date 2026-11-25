import { z } from "zod";

import { USER_ROLES } from "../constants/roles.js";

export const listAdminUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  }),
});

export const adminUserIdParamsSchema = z.object({
  params: z.object({
    userId: z.string().trim().min(1).max(128),
  }),
});

export const updateAdminUserSchema = z.object({
  body: z.object({
    role: z.enum(USER_ROLES).optional(),
    organizationId: z.string().trim().min(1).max(128).nullable().optional(),
    isActive: z.boolean().optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one user field must be provided",
  }),
});

export const updateAdminUserRequestSchema = z.object({
  params: adminUserIdParamsSchema.shape.params,
  body: updateAdminUserSchema.shape.body,
});

export const updatePlatformConfigurationSchema = z.object({
  body: z.object({
    requestDuplicateDetection: z.object({
      windowMinutes: z.number().int().min(1).max(1440).optional(),
      radiusMeters: z.number().int().min(50).max(100_000).optional(),
    }).strict().optional(),
    volunteerMatching: z.object({
      maxTeamSize: z.number().int().min(1).max(50).optional(),
      candidatePoolSize: z.number().int().min(10).max(5000).optional(),
    }).strict().optional(),
  }).strict().refine(
    (body) =>
      Boolean(
        Object.keys(body.requestDuplicateDetection ?? {}).length ||
        Object.keys(body.volunteerMatching ?? {}).length
      ),
    { message: "At least one platform setting must be provided" }
  ),
});
