
import { z } from "zod";

// Distribution Status
export const distributionStatusEnum = z.enum([
  "pending",
  "approved",
  "preparing",
  "dispatched",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
]);

// Create Resource Allocation Validation
export const createResourceAllocationSchema = z.object({
  body: z.object({
    emergencyRequestId: z
      .string()
      .trim()
      .min(1, "Emergency request ID is required"),

    resourceId: z
      .string()
      .trim()
      .min(1, "Resource ID is required"),

    organizationId: z
      .string()
      .trim()
      .min(1, "Organization ID is required"),

    allocationQuantity: z
      .number()
      .positive("Allocation quantity must be greater than zero"),

  }),
});
