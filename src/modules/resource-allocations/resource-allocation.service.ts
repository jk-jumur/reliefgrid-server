import {
  ObjectId,
  type Filter,
  type UpdateFilter,
} from "mongodb";
import type { z } from "zod";

import { client, connectDB } from "../../config/database.js";
import { HttpError } from "../../utils/http-error.js";
import { assertActiveOrganization } from "../../utils/user-validation.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import {
  createResourceAllocationSchema,
  listResourceAllocationsSchema,
  updateResourceAllocationSchema,
} from "../../validators/resource-allocation.validator.js";
import type { EmergencyRequestDocument } from "../emergency-requests/emergency-request.model.js";
import type { ResourceDocument, StockHistoryEntry } from "../resources/resource.model.js";
import { calculateResourceAvailability } from "../resources/resource.inventory.js";
import type {
  DistributionVerificationDocument,
  DistributionStatus,
  ResourceAllocationDocument,
} from "./resource-allocation.model.js";

type CreateAllocationInput = z.infer<typeof createResourceAllocationSchema>["body"];
type ListAllocationsQuery = z.infer<typeof listResourceAllocationsSchema>["query"];
type UpdateAllocationInput = z.infer<typeof updateResourceAllocationSchema>["body"];

const statusTransitions: Record<DistributionStatus, DistributionStatus[]> = {
  pending: ["approved", "cancelled"],
  approved: ["preparing", "cancelled"],
  preparing: ["dispatched", "cancelled"],
  dispatched: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const compatibleCategories: Record<
  EmergencyRequestDocument["requestType"],
  ResourceDocument["category"][]
> = {
  food: ["food_packages", "emergency_kits"],
  drinking_water: ["drinking_water", "emergency_kits"],
  medical_supply: ["medical_supplies", "emergency_kits"],
  shelter: ["blankets", "emergency_kits"],
  rescue: ["rescue_equipment", "transportation_resources", "emergency_kits"],
  transportation: ["transportation_resources", "emergency_kits"],
};

let indexesPromise: Promise<void> | null = null;

const getAllocationsCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<ResourceAllocationDocument>("resourceAllocations");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ emergencyRequestId: 1, createdAt: -1 }),
      collection.createIndex({ resourceId: 1, status: 1 }),
      collection.createIndex({ organizationId: 1, status: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }

  await indexesPromise;
  return collection;
};

const getReadScope = (user: AuthenticatedUser): Filter<ResourceAllocationDocument> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "relief_organization" && user.organizationId) {
    return { organizationId: user.organizationId };
  }
  return { _id: { $exists: false } };
};

const addRequestHistory = (
  request: EmergencyRequestDocument,
  status: EmergencyRequestDocument["status"],
  changedBy: string,
  details: string,
  now: Date
) => ({
  action: "status_changed" as const,
  status,
  priority: request.priority,
  timestamp: now,
  changedBy,
  details: [details],
});

export const createResourceAllocation = async (
  data: CreateAllocationInput,
  actor: AuthenticatedUser
) => {
  if (
    actor.role === "relief_organization" &&
    actor.organizationId !== data.organizationId
  ) {
    throw new HttpError(403, "Organizations can only allocate their own resources");
  }
  await assertActiveOrganization(data.organizationId);

  const db = await connectDB();
  const resources = db.collection<ResourceDocument>("resources");
  const requests = db.collection<EmergencyRequestDocument>("emergencyRequests");
  const allocations = await getAllocationsCollection();
  const session = client.startSession();
  const now = new Date();
  const allocationId = new ObjectId();

  try {
    await session.withTransaction(async () => {
      const requestId = new ObjectId(data.emergencyRequestId);
      const resourceId = new ObjectId(data.resourceId);
      const request = await requests.findOne({ _id: requestId }, { session });

      if (!request) {
        throw new HttpError(404, "Emergency request not found");
      }
      if (request.status !== "verified" && request.status !== "assigned") {
        throw new HttpError(409, "Only verified or assigned requests can receive an allocation");
      }
      if (
        request.assignedOrganizationId &&
        request.assignedOrganizationId !== data.organizationId
      ) {
        throw new HttpError(409, "Request is already assigned to another organization");
      }
      if (
        (request.allocatedQuantity ?? 0) + data.allocationQuantity >
        request.requiredQuantity
      ) {
        throw new HttpError(409, "Allocation exceeds the request's remaining quantity");
      }

      const resource = await resources.findOne(
        { _id: resourceId, organizationId: data.organizationId },
        { session }
      );
      if (!resource) {
        throw new HttpError(404, "Resource not found for the assigned organization");
      }
      if (!compatibleCategories[request.requestType].includes(resource.category)) {
        throw new HttpError(422, "Resource category does not match the emergency request");
      }

      const remainingAvailable = resource.availableQuantity - data.allocationQuantity;
      if (remainingAvailable < 0) {
        throw new HttpError(409, "Allocation exceeds available resource stock");
      }
      const nextAllocated = resource.allocatedQuantity + data.allocationQuantity;
      const availability = calculateResourceAvailability(
        remainingAvailable,
        nextAllocated,
        resource.distributedQuantity
      );
      const stockHistory: StockHistoryEntry = {
        action: "allocated",
        quantityChange: -data.allocationQuantity,
        availableQuantity: remainingAvailable,
        allocatedQuantity: nextAllocated,
        timestamp: now,
        changedBy: actor.id,
        allocationId: allocationId.toHexString(),
      };

      const stockResult = await resources.updateOne(
        {
          _id: resourceId,
          organizationId: data.organizationId,
          availableQuantity: { $gte: data.allocationQuantity },
          updatedAt: resource.updatedAt,
        },
        {
          $inc: {
            availableQuantity: -data.allocationQuantity,
            allocatedQuantity: data.allocationQuantity,
          },
          $set: { availability, updatedAt: now },
          $push: { stockHistory: stockHistory },
        },
        { session }
      );
      if (stockResult.matchedCount !== 1) {
        throw new HttpError(409, "Resource stock changed; refresh and try again");
      }

      const requestNextStatus =
        request.status === "verified" ? "assigned" : request.status;
      const requestResult = await requests.updateOne(
        {
          _id: requestId,
          status: request.status,
          updatedAt: request.updatedAt,
          $expr: {
            $lte: [
              {
                $add: [
                  { $ifNull: ["$allocatedQuantity", 0] },
                  data.allocationQuantity,
                ],
              },
              "$requiredQuantity",
            ],
          },
        },
        {
          $inc: { allocatedQuantity: data.allocationQuantity },
          $set: {
            assignedOrganizationId: data.organizationId,
            assignedCoordinator: request.assignedCoordinator ?? actor.id,
            status: requestNextStatus,
            assignedAt: request.assignedAt ?? now,
            updatedAt: now,
          },
          $push: {
            requestHistory: addRequestHistory(
              request,
              requestNextStatus,
              actor.id,
              `Allocated ${data.allocationQuantity} units to organization ${data.organizationId}`,
              now
            ),
          },
        },
        { session }
      );
      if (requestResult.matchedCount !== 1) {
        throw new HttpError(409, "Request quantity or status changed; refresh and try again");
      }

      const allocation: ResourceAllocationDocument = {
        _id: allocationId,
        emergencyRequestId: requestId,
        resourceId,
        organizationId: data.organizationId,
        allocationQuantity: data.allocationQuantity,
        status: "pending",
        allocatedBy: actor.id,
        history: [
          {
            status: "pending",
            timestamp: now,
            changedBy: actor.id,
            details: "Resource stock reserved for a verified emergency request",
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await allocations.insertOne(allocation, { session });
    });
  } finally {
    await session.endSession();
  }

  const allocation = await allocations.findOne({ _id: allocationId });
  if (!allocation) {
    throw new Error("Resource allocation was not available after the transaction committed");
  }
  return allocation;
};

export const listResourceAllocations = async (
  query: ListAllocationsQuery,
  user: AuthenticatedUser
) => {
  const collection = await getAllocationsCollection();
  const filters: Filter<ResourceAllocationDocument>[] = [getReadScope(user)];
  if (query.status) filters.push({ status: query.status });
  if (query.emergencyRequestId) {
    filters.push({ emergencyRequestId: new ObjectId(query.emergencyRequestId) });
  }
  if (query.resourceId) {
    filters.push({ resourceId: new ObjectId(query.resourceId) });
  }
  const filter: Filter<ResourceAllocationDocument> = { $and: filters };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).toArray(),
    collection.countDocuments(filter),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getResourceAllocationById = async (
  allocationId: string,
  user: AuthenticatedUser
) => {
  const collection = await getAllocationsCollection();
  const allocation = await collection.findOne({
    _id: new ObjectId(allocationId),
    ...getReadScope(user),
  });
  if (!allocation) {
    throw new HttpError(404, "Resource allocation not found");
  }
  return allocation;
};

export const updateResourceAllocation = async (
  allocationId: string,
  data: UpdateAllocationInput,
  actor: AuthenticatedUser,
  verificationTokenHash?: string
) => {
  const allocations = await getAllocationsCollection();
  const db = await connectDB();
  const resources = db.collection<ResourceDocument>("resources");
  const requests = db.collection<EmergencyRequestDocument>("emergencyRequests");
  const _id = new ObjectId(allocationId);
  const session = client.startSession();
  const now = new Date();
  let updatedAllocation: ResourceAllocationDocument | null = null;

  try {
    await session.withTransaction(async () => {
      const allocation = await allocations.findOne({ _id }, { session });
      if (!allocation) {
        throw new HttpError(404, "Resource allocation not found");
      }
      const isCoordinator =
        actor.role === "emergency_coordinator" || actor.role === "system_admin";
      const isRequestRecipient =
        verificationTokenHash !== undefined && actor.role === "citizen";
      if (
        !isCoordinator &&
        !isRequestRecipient &&
        allocation.organizationId !== actor.organizationId
      ) {
        throw new HttpError(404, "Resource allocation not found");
      }
      if (
        !statusTransitions[allocation.status].includes(data.status)
      ) {
        throw new HttpError(
          409,
          `Distribution status cannot change from ${allocation.status} to ${data.status}`
        );
      }
      if (
        !isCoordinator &&
        (data.status === "approved" || data.status === "cancelled")
      ) {
        throw new HttpError(403, "Only coordinators can approve or cancel allocations");
      }

      const resource = await resources.findOne(
        { _id: allocation.resourceId, organizationId: allocation.organizationId },
        { session }
      );
      const request = await requests.findOne(
        { _id: allocation.emergencyRequestId },
        { session }
      );
      if (!resource || !request) {
        throw new HttpError(409, "Allocation is missing its resource or request record");
      }

      const cancelling = data.status === "cancelled";
      const delivering = data.status === "delivered";
      if (verificationTokenHash) {
        if (!delivering) {
          throw new HttpError(422, "A QR verification token can only confirm delivery");
        }
        if (actor.role === "citizen" && request.requestedBy !== actor.id) {
          throw new HttpError(404, "Delivery verification not found");
        }
        const verificationResult = await db
          .collection<DistributionVerificationDocument>("distributionVerifications")
          .updateOne(
            {
              tokenHash: verificationTokenHash,
              allocationId: _id,
              expiresAt: { $gt: now },
              consumedAt: null,
            },
            { $set: { consumedAt: now, consumedBy: actor.id } },
            { session }
          );
        if (verificationResult.matchedCount !== 1) {
          throw new HttpError(410, "Delivery QR is expired or has already been used");
        }
      }
      if (cancelling && request.status === "completed") {
        throw new HttpError(409, "A completed emergency request cannot be cancelled");
      }
      if (
        delivering &&
        request.status !== "assigned" &&
        request.status !== "in_progress"
      ) {
        throw new HttpError(409, "Only assigned or in-progress requests can be delivered");
      }
      const availabilityQuantity = cancelling
        ? resource.availableQuantity + allocation.allocationQuantity
        : resource.availableQuantity;
      const allocatedQuantity = resource.allocatedQuantity - allocation.allocationQuantity;
      const distributedQuantity = delivering
        ? resource.distributedQuantity + allocation.allocationQuantity
        : resource.distributedQuantity;

      if ((cancelling || delivering) && allocatedQuantity < 0) {
        throw new HttpError(409, "Reserved resource quantity is inconsistent");
      }

      if (cancelling || delivering) {
        const stockAction = cancelling ? "allocation_cancelled" : "distributed";
        const stockHistory: StockHistoryEntry = {
          action: stockAction,
          quantityChange: cancelling ? allocation.allocationQuantity : 0,
          availableQuantity: availabilityQuantity,
          allocatedQuantity,
          timestamp: now,
          changedBy: actor.id,
          allocationId: allocation._id?.toHexString(),
        };
        const resourceUpdate = await resources.updateOne(
          { _id: resource._id, updatedAt: resource.updatedAt },
          {
            $inc: {
              availableQuantity: cancelling ? allocation.allocationQuantity : 0,
              allocatedQuantity: -allocation.allocationQuantity,
              distributedQuantity: delivering ? allocation.allocationQuantity : 0,
            },
            $set: {
              availability: calculateResourceAvailability(
                availabilityQuantity,
                allocatedQuantity,
                distributedQuantity
              ),
              updatedAt: now,
            },
            $push: { stockHistory: stockHistory },
          },
          { session }
        );
        if (resourceUpdate.matchedCount !== 1) {
          throw new HttpError(409, "Resource changed; refresh and try again");
        }
      }

      let requestStatus = request.status;
      let deliveredQuantity = request.deliveredQuantity ?? 0;
      const requestUpdate: UpdateFilter<EmergencyRequestDocument> = {
        $set: { updatedAt: now },
      };
      if (cancelling) {
        const remainingAllocated = Math.max(
          0,
          (request.allocatedQuantity ?? 0) - allocation.allocationQuantity
        );
        requestStatus =
          remainingAllocated === 0 && request.status === "assigned"
            ? "verified"
            : request.status;
        requestUpdate.$inc = { allocatedQuantity: -allocation.allocationQuantity };
        requestUpdate.$set = {
          ...requestUpdate.$set,
          ...(requestStatus !== request.status ? { status: requestStatus } : {}),
        };
      } else if (delivering) {
        deliveredQuantity += allocation.allocationQuantity;
        requestStatus =
          deliveredQuantity >= request.requiredQuantity ? "completed" : "in_progress";
        requestUpdate.$inc = { deliveredQuantity: allocation.allocationQuantity };
        requestUpdate.$set = {
          ...requestUpdate.$set,
          status: requestStatus,
          ...(requestStatus === "completed" ? { completedAt: now } : {}),
        };
      } else if (
        ["dispatched", "in_transit"].includes(data.status) &&
        request.status === "assigned"
      ) {
        requestStatus = "in_progress";
        requestUpdate.$set = { ...requestUpdate.$set, status: requestStatus };
      }

      if (requestStatus !== request.status) {
        requestUpdate.$push = {
          requestHistory: addRequestHistory(
            request,
            requestStatus,
            actor.id,
            cancelling
              ? "Resource allocation cancelled"
              : delivering
                ? `Delivered ${allocation.allocationQuantity} units`
                : `Distribution updated to ${data.status}`,
            now
          ),
        };
      }

      const requestResult = await requests.updateOne(
        {
          _id: request._id,
          updatedAt: request.updatedAt,
          status: request.status,
        },
        requestUpdate,
        { session }
      );
      if (requestResult.matchedCount !== 1) {
        throw new HttpError(409, "Emergency request changed; refresh and try again");
      }

      const history = {
        status: data.status,
        timestamp: now,
        changedBy: actor.id,
        ...(verificationTokenHash
          ? { details: "Delivery confirmed using a one-time QR code" }
          : {}),
      };
      const allocationUpdate = await allocations.updateOne(
        { _id, updatedAt: allocation.updatedAt, status: allocation.status },
        {
          $set: {
            status: data.status,
            updatedAt: now,
            ...(verificationTokenHash
              ? { verifiedAt: now, verifiedBy: actor.id }
              : {}),
          },
          $push: { history: history },
        },
        { session }
      );
      if (allocationUpdate.matchedCount !== 1) {
        throw new HttpError(409, "Allocation changed; refresh and try again");
      }

      updatedAllocation = {
        ...allocation,
        status: data.status,
        updatedAt: now,
        ...(verificationTokenHash
          ? { verifiedAt: now, verifiedBy: actor.id }
          : {}),
        history: [...allocation.history, history],
      };
    });
  } finally {
    await session.endSession();
  }

  if (!updatedAllocation) {
    throw new Error("Resource allocation update did not complete");
  }
  return updatedAllocation;
};
