
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
  }),
});
