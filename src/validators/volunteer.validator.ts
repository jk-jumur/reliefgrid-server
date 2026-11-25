
import { z } from "zod";

// Volunteer Availability
export const volunteerAvailabilityEnum = z.enum([
  "available",
  "unavailable",
  "assigned",
]);

// Volunteer Registration Validation
export const createVolunteerSchema = z.object({
  body: z.object({
    userId: z.string().trim().min(1).max(128).optional(),
    fullName: z
      .string()
      .trim()
      .min(3, "Full name must be at least 3 characters")
      .max(100, "Full name cannot exceed 100 characters"),

    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .toLowerCase(),

    phone: z
      .string()
      .trim()
      .regex(
        /^\+?[0-9]{7,15}$/,
        "Invalid phone number"
      ),

    skills: z
      .array(
        z.string()
          .trim()
          .min(2, "Skill must be at least 2 characters")
      )
      .min(1, "At least one skill is required"),

    availability: volunteerAvailabilityEnum,
  }),
});

export const listVolunteersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    skill: z.string().trim().min(2).max(100).optional(),
    availability: volunteerAvailabilityEnum.optional(),
  }),
});

export const volunteerIdParamsSchema = z.object({
  params: z.object({
    volunteerId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid volunteer ID"),
  }),
});

export const updateVolunteerSchema = z.object({
  body: z.object({
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/).optional(),
    skills: z.array(z.string().trim().min(2)).min(1).optional(),
    availability: z.enum(["available", "unavailable"]).optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one volunteer field must be provided",
  }),
});

export const updateVolunteerRequestSchema = z.object({
  params: volunteerIdParamsSchema.shape.params,
  body: updateVolunteerSchema.shape.body,
});
