import { z } from "zod";

export const organizationStatusEnum = z.enum(["active", "suspended"]);

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).optional(),
    region: z.string().trim().min(2).max(160),
  }),
});

export const listOrganizationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: organizationStatusEnum.optional(),
  }),
});

export const organizationIdParamsSchema = z.object({
  params: z.object({
    organizationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid organization ID"),
  }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    region: z.string().trim().min(2).max(160).optional(),
    status: organizationStatusEnum.optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one organization field must be provided",
  }),
});

export const updateOrganizationRequestSchema = z.object({
  params: organizationIdParamsSchema.shape.params,
  body: updateOrganizationSchema.shape.body,
});
