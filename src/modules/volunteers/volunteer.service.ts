import { ObjectId, type Filter, type UpdateFilter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { assertActiveUserRole } from "../../utils/user-validation.js";
import {
  createVolunteerSchema,
  listVolunteersSchema,
  updateVolunteerSchema,
} from "../../validators/volunteer.validator.js";
import type {
  VolunteerDocument,
  VolunteerHistoryEntry,
} from "./volunteer.model.js";

type CreateVolunteerInput = z.infer<typeof createVolunteerSchema>["body"];
type ListVolunteersQuery = z.infer<typeof listVolunteersSchema>["query"];
type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>["body"];

let indexesPromise: Promise<void> | null = null;

const getVolunteersCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<VolunteerDocument>("volunteers");
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ userId: 1 }, { unique: true }),
      collection.createIndex({ email: 1 }, { unique: true }),
      collection.createIndex({ availability: 1 }),
      collection.createIndex({ availability: 1, skills: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
  return collection;
};

export const listEligibleVolunteerAccounts = async () => {
  const db = await connectDB();
  return db.collection("user").aggregate<{
    id: string;
    name?: string;
    email?: string;
  }>([
    {
      $match: {
        role: "volunteer",
        isActive: { $ne: false },
      },
    },
    {
      $addFields: {
        accountId: { $toString: { $ifNull: ["$id", "$_id"] } },
      },
    },
    {
      $lookup: {
        from: "volunteers",
        localField: "accountId",
        foreignField: "userId",
        as: "profiles",
      },
    },
    { $match: { profiles: { $eq: [] } } },
    { $sort: { name: 1, email: 1 } },
    { $limit: 100 },
    {
      $project: {
        _id: 0,
        id: "$accountId",
        name: 1,
        email: 1,
      },
    },
  ]).toArray();
};

const getReadScope = (user: AuthenticatedUser): Filter<VolunteerDocument> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "volunteer") return { userId: user.id };
  return { _id: { $exists: false } };
};

const escapeRegex = (value: string): RegExp =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const duplicateError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const createVolunteer = async (
  data: CreateVolunteerInput,
  actor: AuthenticatedUser
) => {
  let userId: string;
  if (actor.role === "volunteer") {
    if (data.userId && data.userId !== actor.id) {
      throw new HttpError(403, "Volunteers can only register their own profile");
    }
    if (data.email !== actor.email.toLowerCase()) {
      throw new HttpError(422, "Profile email must match the authenticated account");
    }
    userId = actor.id;
  } else {
    if (!data.userId) {
      throw new HttpError(422, "An active volunteer account userId is required");
    }
    userId = data.userId;
  }
  const account = await assertActiveUserRole(
    userId,
    "volunteer",
    "Volunteer account is not active"
  );
  if (account.email && account.email.toLowerCase() !== data.email) {
    throw new HttpError(422, "Profile email must match the volunteer account");
  }
  if (data.availability === "assigned") {
    throw new HttpError(422, "New volunteer profiles cannot start as assigned");
  }

  const collection = await getVolunteersCollection();
  const now = new Date();
  const volunteer: VolunteerDocument = {
    userId,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    skills: data.skills,
    availability: data.availability,
    history: [
      {
        action: "registered",
        timestamp: now,
        changedBy: actor.id,
        details: "Volunteer profile created",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  try {
    const result = await collection.insertOne(volunteer);
    return { ...volunteer, _id: result.insertedId };
  } catch (error) {
    if (duplicateError(error)) {
      throw new HttpError(409, "A volunteer profile already exists for this account or email");
    }
    throw error;
  }
};

export const listVolunteers = async (
  query: ListVolunteersQuery,
  user: AuthenticatedUser
) => {
  const collection = await getVolunteersCollection();
  const filters: Filter<VolunteerDocument>[] = [getReadScope(user)];
  if (query.availability) filters.push({ availability: query.availability });
  if (query.skill) filters.push({ skills: escapeRegex(query.skill) });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({ $or: [{ fullName: pattern }, { email: pattern }] });
  }
  const filter: Filter<VolunteerDocument> = { $and: filters };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ fullName: 1 }).skip(skip).limit(query.limit).toArray(),
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

export const getVolunteerById = async (
  volunteerId: string,
  user: AuthenticatedUser
) => {
  const collection = await getVolunteersCollection();
  const volunteer = await collection.findOne({
    _id: new ObjectId(volunteerId),
    ...getReadScope(user),
  });
  if (!volunteer) throw new HttpError(404, "Volunteer not found");
  return volunteer;
};

export const updateVolunteer = async (
  volunteerId: string,
  data: UpdateVolunteerInput,
  actor: AuthenticatedUser
) => {
  const collection = await getVolunteersCollection();
  const _id = new ObjectId(volunteerId);
  const current = await collection.findOne({ _id });
  if (!current) throw new HttpError(404, "Volunteer not found");
  const canManage =
    actor.role === "system_admin" ||
    actor.role === "emergency_coordinator";
  if (!canManage && current.userId !== actor.id) {
    throw new HttpError(404, "Volunteer not found");
  }
  if (data.availability && current.availability === "assigned") {
    throw new HttpError(409, "Availability cannot change while the volunteer is assigned");
  }

  const now = new Date();
  const actions: VolunteerHistoryEntry[] = [];
  if (data.availability && data.availability !== current.availability) {
    actions.push({
      action: "availability_changed",
      timestamp: now,
      changedBy: actor.id,
      details: `Availability changed from ${current.availability} to ${data.availability}`,
    });
  }
  if (data.phone || data.skills) {
    actions.push({
      action: "profile_updated",
      timestamp: now,
      changedBy: actor.id,
      details: "Volunteer profile details updated",
    });
  }
  const update: UpdateFilter<VolunteerDocument> = {
    $set: { ...data, updatedAt: now },
    ...(actions.length ? { $push: { history: { $each: actions } } } : {}),
  };
  const result = await collection.updateOne(
    { _id, updatedAt: current.updatedAt },
    update
  );
  if (!result.matchedCount) {
    throw new HttpError(409, "Volunteer profile changed; refresh and try again");
  }
  return collection.findOne({ _id });
};

export const getVolunteerByUserId = async (userId: string) => {
  const collection = await getVolunteersCollection();
  return collection.findOne({ userId });
};
