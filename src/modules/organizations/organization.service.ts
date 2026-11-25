import { ObjectId, type Filter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createOrganizationSchema,
  listOrganizationsSchema,
  updateOrganizationSchema,
} from "../../validators/organization.validator.js";
import type { OrganizationDocument } from "./organization.model.js";

type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>["body"];
type ListOrganizationsQuery = z.infer<typeof listOrganizationsSchema>["query"];
type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>["body"];

let indexesPromise: Promise<void> | null = null;

const getOrganizationsCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<OrganizationDocument>("organizations");
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ status: 1, region: 1 }),
      collection.createIndex({ name: 1 }),
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

export const createOrganization = async (
  data: CreateOrganizationInput,
  actor: AuthenticatedUser
) => {
  const collection = await getOrganizationsCollection();
  const now = new Date();
  const organization: OrganizationDocument = {
    _id: new ObjectId().toHexString(),
    name: data.name,
    description: data.description,
    region: data.region,
    status: "active",
    history: [{
      action: "organization_created",
      timestamp: now,
      changedBy: actor.id,
      details: "Organization registered",
    }],
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(organization);
  return organization;
};

export const listOrganizations = async (query: ListOrganizationsQuery) => {
  const collection = await getOrganizationsCollection();
  const filters: Filter<OrganizationDocument>[] = [];
  if (query.status) filters.push({ status: query.status });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({ $or: [{ name: pattern }, { region: pattern }] });
  }
  const filter: Filter<OrganizationDocument> =
    filters.length ? { $and: filters } : {};
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ name: 1 }).skip(skip).limit(query.limit).toArray(),
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

export const updateOrganization = async (
  organizationId: string,
  data: UpdateOrganizationInput,
  actor: AuthenticatedUser
) => {
  const collection = await getOrganizationsCollection();
  const current = await collection.findOne({ _id: organizationId });
  if (!current) throw new HttpError(404, "Organization not found");
  const updatedAt = new Date();
  const result = await collection.updateOne(
    { _id: organizationId, updatedAt: current.updatedAt },
    {
      $set: { ...data, updatedAt },
      $push: {
        history: {
          action: "organization_updated",
          timestamp: updatedAt,
          changedBy: actor.id,
          details: `Updated ${Object.keys(data).join(", ")}`,
        },
      },
    }
  );
  if (!result.matchedCount) {
    throw new HttpError(409, "Organization changed; refresh and try again");
  }
  return collection.findOne({ _id: organizationId });
};
