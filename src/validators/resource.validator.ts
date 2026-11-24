
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
  }),
});
