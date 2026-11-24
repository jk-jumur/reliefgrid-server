
import { z } from "zod";

// Emergency Request Categories
export const emergencyRequestCategoryEnum = z.enum([
  "food",
  "drinking_water",
  "medical_supply",
  "shelter",
  "rescue",
  "transportation",
]);

// Emergency Request Priority
export const emergencyRequestPriorityEnum = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

// Emergency Request Status
export const emergencyRequestStatusEnum = z.enum([
  "pending",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
  "completed",
  "rejected",
]);

// Create Emergency Request Validation
export const createEmergencyRequestSchema = z.object({
  body: z.object({
    requestType: emergencyRequestCategoryEnum,

    requiredQuantity: z
      .number()
      .positive("Required quantity must be greater than zero"),

    location: z
      .string()
      .trim()
      .min(3, "Location is required")
      .max(300, "Location cannot exceed 300 characters"),

    coordinates: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),

    affectedPeople: z
      .number()
      .int("Affected people must be a whole number")
      .min(1, "At least one affected person is required"),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(2000, "Description cannot exceed 2000 characters"),
  }),
});
