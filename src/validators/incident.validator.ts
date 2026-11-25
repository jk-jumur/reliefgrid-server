
import { z } from "zod";

const imageReferenceSchema = z.union([
  z.url("Invalid image URL").refine((value) => /^https?:\/\//i.test(value), {
    message: "Image URLs must use HTTP or HTTPS",
  }),
  z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/i, "Invalid uploaded image path"),
]);

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

export const incidentLocationRiskEnum = z.enum([
  "low",
  "medium",
  "high",
  "critical",
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

    locationRisk: incidentLocationRiskEnum.default("medium"),

    severity: incidentSeverityEnum,

    affectedPopulation: z
      .number()
      .int("Affected population must be a whole number")
      .min(0, "Affected population cannot be negative"),

    imageUrl: imageReferenceSchema.optional(),
  }),
});

export const listIncidentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    category: incidentCategoryEnum.optional(),
    severity: incidentSeverityEnum.optional(),
    priority: incidentPriorityEnum.optional(),
    status: incidentStatusEnum.optional(),
  }),
});

export const incidentIdParamsSchema = z.object({
  params: z.object({
    incidentId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid incident ID"),
  }),
});

export const updateIncidentSchema = z.object({
  body: z.object({
    title: z.string().trim().min(5).max(150).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    category: incidentCategoryEnum.optional(),
    location: z.string().trim().min(3).max(300).optional(),
    coordinates: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).optional(),
    locationRisk: incidentLocationRiskEnum.optional(),
    severity: incidentSeverityEnum.optional(),
    affectedPopulation: z.number().int().min(0).optional(),
    imageUrl: imageReferenceSchema.optional(),
    priority: incidentPriorityEnum.optional(),
    status: incidentStatusEnum.optional(),
    assignedCoordinator: z.string().trim().min(1).max(128).nullable().optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one incident field must be provided",
  }),
});

export const updateIncidentRequestSchema = z.object({
  params: incidentIdParamsSchema.shape.params,
  body: updateIncidentSchema.shape.body,
});
