
import { z } from "zod";

// Shelter Status
export const shelterStatusEnum = z.enum([
  "active",
  "inactive",
  "full",
  "under_maintenance",
]);

// Create Shelter Validation
export const createShelterSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(3, "Shelter name must be at least 3 characters")
      .max(150, "Shelter name cannot exceed 150 characters"),

    location: z
      .string()
      .trim()
      .min(3, "Shelter location is required")
      .max(300, "Location cannot exceed 300 characters"),

    coordinates: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),

    totalCapacity: z
      .number()
      .int("Total capacity must be a whole number")
      .positive("Total capacity must be greater than zero"),

    facilities: z
      .array(
        z.string()
          .trim()
          .min(1, "Facility name cannot be empty")
      )
      .default([]),
    shelterManagerId: z.string().trim().min(1).max(128).optional(),
  }),
});

export const listSheltersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: shelterStatusEnum.optional(),
  }),
});

export const nearestShelterSchema = z.object({
  query: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    people: z.coerce.number().int().min(1).default(1),
  }),
});

export const shelterIdParamsSchema = z.object({
  params: z.object({
    shelterId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid shelter ID"),
  }),
});

export const updateShelterSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(150).optional(),
    location: z.string().trim().min(3).max(300).optional(),
    coordinates: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).optional(),
    totalCapacity: z.number().int().positive().optional(),
    facilities: z.array(z.string().trim().min(1)).optional(),
    shelterManagerId: z.string().trim().min(1).max(128).nullable().optional(),
    status: z.enum(["active", "inactive", "under_maintenance"]).optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one shelter field must be provided",
  }),
});

export const updateShelterRequestSchema = z.object({
  params: shelterIdParamsSchema.shape.params,
  body: updateShelterSchema.shape.body,
});

export const updateShelterOccupancySchema = z.object({
  body: z.object({
    occupancyChange: z.number().int().refine((value) => value !== 0, {
      message: "Occupancy change cannot be zero",
    }),
    reason: z.string().trim().min(3).max(500),
  }),
});

export const updateShelterOccupancyRequestSchema = z.object({
  params: shelterIdParamsSchema.shape.params,
  body: updateShelterOccupancySchema.shape.body,
});
