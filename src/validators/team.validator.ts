
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
