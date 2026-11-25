
import { z } from "zod";

// Team Status
export const teamStatusEnum = z.enum([
  "active",
  "deployed",
  "inactive",
]);

// Create Team Validation
export const createTeamSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(3, "Team name must be at least 3 characters")
      .max(100, "Team name cannot exceed 100 characters"),

    description: z
      .string()
      .trim()
      .min(10, "Team description must be at least 10 characters")
      .max(1000, "Team description cannot exceed 1000 characters"),

    volunteerIds: z
      .array(
        z.string().regex(
          /^[0-9a-fA-F]{24}$/,
          "Invalid volunteer ID"
        )
      )
      .min(1, "At least one volunteer is required")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate volunteer IDs are not allowed"
      ),
  }),
});

export const listTeamsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: teamStatusEnum.optional(),
    search: z.string().trim().max(200).optional(),
  }),
});

export const teamIdParamsSchema = z.object({
  params: z.object({
    teamId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid team ID"),
  }),
});

export const updateTeamSchema = z.object({
  body: z.object({
    status: teamStatusEnum.optional(),
    incidentId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one team field must be provided",
  }),
});

export const updateTeamRequestSchema = z.object({
  params: teamIdParamsSchema.shape.params,
  body: updateTeamSchema.shape.body,
});
