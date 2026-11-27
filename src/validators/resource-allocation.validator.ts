
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
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid emergency request ID"),

    resourceId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid resource ID"),

    organizationId: z
      .string()
      .trim()
      .min(1, "Organization ID is required"),

    allocationQuantity: z
      .number()
      .int("Allocation quantity must be a whole number")
      .positive("Allocation quantity must be greater than zero"),
  }),
});

export const listResourceAllocationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: distributionStatusEnum.optional(),
    emergencyRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    resourceId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  }),
});

export const resourceAllocationIdParamsSchema = z.object({
  params: z.object({
    allocationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid allocation ID"),
  }),
});

export const updateResourceAllocationSchema = z.object({
  body: z.object({
    status: distributionStatusEnum,
  }),
});

export const updateResourceAllocationRequestSchema = z.object({
  params: resourceAllocationIdParamsSchema.shape.params,
  body: updateResourceAllocationSchema.shape.body,
});

export const verifyAllocationDeliverySchema = z.object({
  body: z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid delivery QR token"),
  }),
});
