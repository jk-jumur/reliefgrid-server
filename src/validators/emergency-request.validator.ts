
import { z } from "zod";
import { incidentLocationRiskEnum } from "./incident.validator.js";

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

const requestCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Create Emergency Request Validation
export const createEmergencyRequestSchema = z.object({
  body: z.object({
    requestType: emergencyRequestCategoryEnum,

    requiredQuantity: z.number().positive("Required quantity must be greater than zero"),

    location: z
      .string()
      .trim()
      .min(3, "Location is required")
      .max(300, "Location cannot exceed 300 characters"),

    coordinates: requestCoordinatesSchema,

    affectedPeople: z
      .number()
      .int("Affected people must be a whole number")
      .min(1, "At least one affected person is required"),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(2000, "Description cannot exceed 2000 characters"),

    urgency: emergencyRequestPriorityEnum.default("medium"),
    locationRisk: incidentLocationRiskEnum.default("medium"),
    incidentId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid incident ID").optional(),
  }),
});

export const listEmergencyRequestsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    requestType: emergencyRequestCategoryEnum.optional(),
    priority: emergencyRequestPriorityEnum.optional(),
    status: emergencyRequestStatusEnum.optional(),
  }),
});

export const emergencyRequestIdParamsSchema = z.object({
  params: z.object({
    requestId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid emergency request ID"),
  }),
});

export const updateEmergencyRequestSchema = z.object({
  body: z.object({
    status: emergencyRequestStatusEnum.optional(),
    priority: emergencyRequestPriorityEnum.optional(),
    urgency: emergencyRequestPriorityEnum.optional(),
    requiredQuantity: z.number().positive().optional(),
    affectedPeople: z.number().int().min(1).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    assignedOrganizationId: z.string().trim().min(1).max(128).nullable().optional(),
    assignedCoordinator: z.string().trim().min(1).max(128).nullable().optional(),
    rejectionReason: z.string().trim().min(5).max(1000).optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one request field must be provided",
  }),
});

export const updateEmergencyRequestRequestSchema = z.object({
  params: emergencyRequestIdParamsSchema.shape.params,
  body: updateEmergencyRequestSchema.shape.body,
});
