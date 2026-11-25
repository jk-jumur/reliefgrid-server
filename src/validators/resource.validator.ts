
import { z } from "zod";

// Resource Categories
export const resourceCategoryEnum = z.enum([
  "food_packages",
  "drinking_water",
  "medical_supplies",
  "emergency_kits",
  "blankets",
  "rescue_equipment",
  "transportation_resources",
]);

// Resource Availability
export const resourceAvailabilityEnum = z.enum([
  "available",
  "low_stock",
  "out_of_stock",
]);

// Create Resource Validation
export const createResourceSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Resource name must be at least 2 characters")
      .max(150, "Resource name cannot exceed 150 characters"),

    category: resourceCategoryEnum,

    availableQuantity: z
      .number()
      .int("Available quantity must be a whole number")
      .min(0, "Available quantity cannot be negative"),

    storageLocation: z
      .string()
      .trim()
      .min(3, "Storage location is required")
      .max(300, "Storage location cannot exceed 300 characters"),

    organizationId: z.string().trim().min(1).max(128).optional(),
  }),
});

export const listResourcesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    category: resourceCategoryEnum.optional(),
    availability: resourceAvailabilityEnum.optional(),
  }),
});

export const resourceIdParamsSchema = z.object({
  params: z.object({
    resourceId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid resource ID"),
  }),
});

export const updateResourceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150).optional(),
    storageLocation: z.string().trim().min(3).max(300).optional(),
  }).refine((body) => Object.keys(body).length > 0, {
    message: "At least one resource field must be provided",
  }),
});

export const updateResourceRequestSchema = z.object({
  params: resourceIdParamsSchema.shape.params,
  body: updateResourceSchema.shape.body,
});

export const resourceMovementSchema = z.object({
  body: z.object({
    movementType: z.enum(["restock", "withdrawal"]),
    quantity: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
  }),
});

export const resourceMovementRequestSchema = z.object({
  params: resourceIdParamsSchema.shape.params,
  body: resourceMovementSchema.shape.body,
});
