import { ObjectId, type Filter, type UpdateFilter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import { HttpError } from "../../utils/http-error.js";
import {
  assertActiveOrganization,
} from "../../utils/user-validation.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import {
  createResourceSchema,
  listResourcesSchema,
  resourceMovementSchema,
  updateResourceSchema,
} from "../../validators/resource.validator.js";
import type {
  ResourceDocument,
  StockHistoryEntry,
} from "./resource.model.js";
import { calculateResourceAvailability } from "./resource.inventory.js";

type CreateResourceInput = z.infer<typeof createResourceSchema>["body"];
type ListResourcesQuery = z.infer<typeof listResourcesSchema>["query"];
type UpdateResourceInput = z.infer<typeof updateResourceSchema>["body"];
type ResourceMovementInput = z.infer<typeof resourceMovementSchema>["body"];

let indexesPromise: Promise<void> | null = null;

const getResourcesCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<ResourceDocument>("resources");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ organizationId: 1, category: 1 }),
      collection.createIndex({ organizationId: 1, availability: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }

  await indexesPromise;
  return collection;
};

const escapeRegex = (value: string): RegExp =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const getReadScope = (user: AuthenticatedUser): Filter<ResourceDocument> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "relief_organization" && user.organizationId) {
    return { organizationId: user.organizationId };
  }
  return { _id: { $exists: false } };
};

const assertCanManage = (
  resource: ResourceDocument,
  user: AuthenticatedUser
): void => {
  if (user.role === "system_admin") return;
  if (
    user.role === "relief_organization" &&
    user.organizationId === resource.organizationId
  ) {
    return;
  }
  throw new HttpError(404, "Resource not found");
};

export const createResource = async (
  data: CreateResourceInput,
  user: AuthenticatedUser
) => {
  const collection = await getResourcesCollection();
  const organizationId =
    user.role === "relief_organization"
      ? user.organizationId
      : data.organizationId;

  if (!organizationId) {
    throw new HttpError(422, "An organization must be assigned to this resource");
  }
  await assertActiveOrganization(organizationId);

  const now = new Date();
  const availability = calculateResourceAvailability(data.availableQuantity, 0, 0);
  const resource: ResourceDocument = {
    name: data.name,
    category: data.category,
    availableQuantity: data.availableQuantity,
    allocatedQuantity: 0,
    distributedQuantity: 0,
    storageLocation: data.storageLocation,
    organizationId,
    availability,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
    stockHistory: [
      {
        action: "resource_registered",
        quantityChange: data.availableQuantity,
        availableQuantity: data.availableQuantity,
        allocatedQuantity: 0,
        timestamp: now,
        changedBy: user.id,
      },
    ],
  };
  const result = await collection.insertOne(resource);

  return { ...resource, _id: result.insertedId };
};

export const listResources = async (
  query: ListResourcesQuery,
  user: AuthenticatedUser
) => {
  const collection = await getResourcesCollection();
  const filters: Filter<ResourceDocument>[] = [getReadScope(user)];

  if (query.category) filters.push({ category: query.category });
  if (query.availability) filters.push({ availability: query.availability });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({
      $or: [{ name: pattern }, { storageLocation: pattern }],
    });
  }

  const filter: Filter<ResourceDocument> = { $and: filters };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter)
      .sort({ availability: 1, updatedAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .toArray(),
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

export const getResourceById = async (
  resourceId: string,
  user: AuthenticatedUser
) => {
  const collection = await getResourcesCollection();
  const resource = await collection.findOne({
    _id: new ObjectId(resourceId),
    ...getReadScope(user),
  });

  if (!resource) {
    throw new HttpError(404, "Resource not found");
  }
  return resource;
};

export const updateResource = async (
  resourceId: string,
  data: UpdateResourceInput,
  user: AuthenticatedUser
) => {
  const collection = await getResourcesCollection();
  const _id = new ObjectId(resourceId);
  const current = await collection.findOne({ _id });

  if (!current) {
    throw new HttpError(404, "Resource not found");
  }
  assertCanManage(current, user);

  const now = new Date();
  const history: StockHistoryEntry = {
    action: "resource_updated",
    quantityChange: 0,
    availableQuantity: current.availableQuantity,
    allocatedQuantity: current.allocatedQuantity,
    timestamp: now,
    changedBy: user.id,
    reason: `Updated ${Object.keys(data).join(", ")}`,
  };
  const update: UpdateFilter<ResourceDocument> = {
    $set: { ...data, updatedAt: now },
    $push: { stockHistory: history },
  };
  const result = await collection.updateOne(
    { _id, updatedAt: current.updatedAt },
    update
  );

  if (result.matchedCount === 0) {
    throw new HttpError(409, "Resource changed during this update; reload and try again");
  }
  return collection.findOne({ _id });
};

export const moveResourceStock = async (
  resourceId: string,
  data: ResourceMovementInput,
  user: AuthenticatedUser
) => {
  const collection = await getResourcesCollection();
  const _id = new ObjectId(resourceId);
  const current = await collection.findOne({ _id });

  if (!current) {
    throw new HttpError(404, "Resource not found");
  }
  assertCanManage(current, user);

  if (
    data.movementType === "withdrawal" &&
    current.availableQuantity < data.quantity
  ) {
    throw new HttpError(409, "Withdrawal exceeds available resource stock");
  }

  const quantityChange =
    data.movementType === "restock" ? data.quantity : -data.quantity;
  const availableQuantity = current.availableQuantity + quantityChange;
  const availability = calculateResourceAvailability(
    availableQuantity,
    current.allocatedQuantity,
    current.distributedQuantity
  );
  const now = new Date();
  const history: StockHistoryEntry = {
    action: data.movementType === "restock" ? "restocked" : "withdrawn",
    quantityChange,
    availableQuantity,
    allocatedQuantity: current.allocatedQuantity,
    timestamp: now,
    changedBy: user.id,
    reason: data.reason,
  };
  const update: UpdateFilter<ResourceDocument> = {
    $inc: { availableQuantity: quantityChange },
    $set: { availability, updatedAt: now },
    $push: { stockHistory: history },
  };
  const result = await collection.updateOne(
    {
      _id,
      updatedAt: current.updatedAt,
      ...(quantityChange < 0
        ? { availableQuantity: { $gte: data.quantity } }
        : {}),
    },
    update
  );

  if (result.matchedCount === 0) {
    throw new HttpError(409, "Resource stock changed; refresh and try again");
  }
  return collection.findOne({ _id });
};
