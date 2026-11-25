import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type { distributionStatusEnum } from "../../validators/resource-allocation.validator.js";

export type DistributionStatus = z.infer<typeof distributionStatusEnum>;

export interface AllocationHistoryEntry {
  status: DistributionStatus;
  timestamp: Date;
  changedBy: string;
  details?: string;
}

export interface ResourceAllocationDocument {
  _id?: ObjectId;
  emergencyRequestId: ObjectId;
  resourceId: ObjectId;
  organizationId: string;
  allocationQuantity: number;
  status: DistributionStatus;
  allocatedBy: string;
  history: AllocationHistoryEntry[];
  verifiedAt?: Date;
  verifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DistributionVerificationDocument {
  _id?: ObjectId;
  tokenHash: string;
  allocationId: ObjectId;
  issuedBy: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedBy?: string;
}
