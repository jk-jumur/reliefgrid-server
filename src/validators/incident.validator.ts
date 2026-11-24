
import { z } from "zod";

// Incident Categories
export const incidentCategoryEnum = z.enum([
  "flood",
  "cyclone",
  "earthquake",
  "fire",
  "landslide",
  "infrastructure_failure",
]);

// Incident Severity
export const incidentSeverityEnum = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

// Incident Priority
export const incidentPriorityEnum = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

// Incident Status
export const incidentStatusEnum = z.enum([
  "reported",
  "under_review",
  "verified",
  "in_progress",
  "resolved",
  "closed",
]);

// Create Incident Validation
export const createIncidentSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(5, "Incident title must be at least 5 characters")
      .max(150, "Incident title cannot exceed 150 characters"),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(2000, "Description cannot exceed 2000 characters"),

    category: incidentCategoryEnum,

    location: z
      .string()
      .trim()
      .min(3, "Location is required")
      .max(300, "Location cannot exceed 300 characters"),

    coordinates: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),

    severity: incidentSeverityEnum,

    affectedPopulation: z
      .number()
      .int("Affected population must be a whole number")
      .min(0, "Affected population cannot be negative"),

    imageUrl: z.string().url("Invalid image URL").optional(),
  }),
});
