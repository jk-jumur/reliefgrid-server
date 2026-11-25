import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type {
  resourceAvailabilityEnum,
  resourceCategoryEnum,
} from "../../validators/resource.validator.js";

export type ResourceCategory = z.infer<typeof resourceCategoryEnum>;
export type ResourceAvailability = z.infer<typeof resourceAvailabilityEnum>;

export interface StockHistoryEntry {
  action:
    | "resource_registered"
    | "resource_updated"
    | "restocked"
    | "withdrawn"
    | "allocated"
    | "allocation_cancelled"
    | "distributed";
  quantityChange: number;
  availableQuantity: number;
  allocatedQuantity: number;
  timestamp: Date;
  changedBy: string;
  reason?: string;
  allocationId?: string;
}

export interface ResourceDocument {
  _id?: ObjectId;
  name: string;
  category: ResourceCategory;
  availableQuantity: number;
  allocatedQuantity: number;
  distributedQuantity: number;
  storageLocation: string;
  organizationId: string;
  availability: ResourceAvailability;
  stockHistory: StockHistoryEntry[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
