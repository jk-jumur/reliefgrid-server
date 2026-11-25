import { ObjectId, type Filter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import { USER_ROLES } from "../../constants/roles.js";
import { assertActiveOrganization } from "../../utils/user-validation.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listAdminUsersSchema,
  updateAdminUserSchema,
} from "../../validators/admin.validator.js";

type ListUsersQuery = z.infer<typeof listAdminUsersSchema>["query"];
type UpdateUserInput = z.infer<typeof updateAdminUserSchema>["body"];

interface ManagedUser {
  _id?: ObjectId | string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  organizationId?: string | null;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  activityHistory?: Array<{
    action: string;
    timestamp: Date;
    changedBy: string;
    details: string;
  }>;
}

const safeUserProjection = {
  name: 1,
  email: 1,
  role: 1,
  organizationId: 1,
  isActive: 1,
  emailVerified: 1,
  createdAt: 1,
  updatedAt: 1,
  activityHistory: 1,
};

const escapeRegex = (value: string): RegExp =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const getUserCollection = async () => {
  const db = await connectDB();
  return db.collection<ManagedUser>("user");
};

const findUser = async (userId: string) => {
  const collection = await getUserCollection();
  const possibleIds: Array<{ _id: ObjectId | string } | { id: string }> = [
    { id: userId },
    { _id: userId },
  ];
  if (ObjectId.isValid(userId)) possibleIds.push({ _id: new ObjectId(userId) });
  const user = await collection.findOne(
    { $or: possibleIds },
    { projection: safeUserProjection }
  );
  return user;
};

export const listAdminUsers = async (query: ListUsersQuery) => {
  const collection = await getUserCollection();
  const filters: Filter<ManagedUser>[] = [];
  if (query.role) filters.push({ role: query.role });
  if (query.isActive !== undefined) filters.push({ isActive: query.isActive });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({ $or: [{ name: pattern }, { email: pattern }] });
  }
  const filter: Filter<ManagedUser> = filters.length ? { $and: filters } : {};
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter, { projection: safeUserProjection })
      .sort({ createdAt: -1 })
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

export const getAdminUserById = async (userId: string) => {
  const user = await findUser(userId);
  if (!user) throw new HttpError(404, "User not found");
  return user;
};

export const updateAdminUser = async (
  userId: string,
  data: UpdateUserInput,
  actorId: string
) => {
  const collection = await getUserCollection();
  const current = await findUser(userId);
  if (!current) throw new HttpError(404, "User not found");
  const currentId = String(current.id ?? current._id ?? "");
  const nextRole = data.role ?? current.role ?? "citizen";
  if (!USER_ROLES.includes(nextRole as (typeof USER_ROLES)[number])) {
    throw new HttpError(422, "Invalid user role");
  }
  if (
    currentId === actorId &&
    ((data.isActive === false) || (data.role && data.role !== "system_admin"))
  ) {
    throw new HttpError(409, "You cannot deactivate or demote your own account");
  }
  if (
    current.role === "system_admin" &&
    ((data.isActive === false) || (data.role && data.role !== "system_admin"))
  ) {
    const activeAdmins = await collection.countDocuments({
      role: "system_admin",
      isActive: { $ne: false },
    });
    if (activeAdmins <= 1) {
      throw new HttpError(409, "The last active system admin cannot be demoted or deactivated");
    }
  }

  let organizationId: string | null = null;
  if (nextRole === "relief_organization") {
    organizationId =
      data.organizationId === undefined
        ? current.organizationId ?? null
        : data.organizationId;
    if (!organizationId) {
      throw new HttpError(422, "Relief organization users must be assigned to an organization");
    }
    await assertActiveOrganization(organizationId);
  } else if (data.organizationId) {
    throw new HttpError(422, "Only relief organization users can have an organization");
  }

  const identity = current.id
    ? { id: current.id }
    : { _id: current._id };
  const updatedAt = new Date();
  const result = await collection.updateOne(
    identity,
    {
      $set: {
        role: nextRole,
        organizationId,
        isActive: data.isActive ?? current.isActive ?? true,
        updatedAt,
      },
      $push: {
        activityHistory: {
          action: "user_access_updated",
          timestamp: updatedAt,
          changedBy: actorId,
          details: `Updated ${Object.keys(data).join(", ")}`,
        },
      },
    }
  );
  if (!result.matchedCount) {
    throw new HttpError(409, "User changed; refresh and try again");
  }
  return getAdminUserById(userId);
};
