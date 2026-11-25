import { ObjectId, type Filter, type UpdateFilter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import { assertActiveUserRole } from "../../utils/user-validation.js";
import {
  createShelterSchema,
  listSheltersSchema,
  nearestShelterSchema,
  updateShelterOccupancySchema,
  updateShelterSchema,
} from "../../validators/shelter.validator.js";
import { calculateShelterCapacity } from "./shelter.capacity.js";
import type {
  ShelterActivityHistoryEntry,
  ShelterDocument,
  ShelterOccupancyHistoryEntry,
} from "./shelter.model.js";

type CreateShelterInput = z.infer<typeof createShelterSchema>["body"];
type ListSheltersQuery = z.infer<typeof listSheltersSchema>["query"];
type UpdateShelterInput = z.infer<typeof updateShelterSchema>["body"];
type UpdateOccupancyInput =
  z.infer<typeof updateShelterOccupancySchema>["body"];
type NearestShelterQuery = z.infer<typeof nearestShelterSchema>["query"];

let indexesPromise: Promise<void> | null = null;

const getSheltersCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<ShelterDocument>("shelters");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ status: 1, updatedAt: -1 }),
      collection.createIndex({ shelterManagerId: 1, status: 1 }),
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

const getReadScope = (user: AuthenticatedUser): Filter<ShelterDocument> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "shelter_manager") {
    return { shelterManagerId: user.id };
  }
  return { _id: { $exists: false } };
};

const assertCanManage = (
  shelter: ShelterDocument,
  user: AuthenticatedUser
): void => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return;
  }
  if (
    user.role === "shelter_manager" &&
    shelter.shelterManagerId === user.id
  ) {
    return;
  }
  throw new HttpError(404, "Shelter not found");
};

export const createShelter = async (
  data: CreateShelterInput,
  actor: AuthenticatedUser
) => {
  const collection = await getSheltersCollection();
  const shelterManagerId =
    actor.role === "shelter_manager" ? actor.id : data.shelterManagerId ?? null;

  if (shelterManagerId) {
    await assertActiveUserRole(
      shelterManagerId,
      "shelter_manager",
      "Assigned shelter manager is not active"
    );
    if (actor.role === "shelter_manager" && shelterManagerId !== actor.id) {
      throw new HttpError(403, "Shelter managers can only manage their own shelters");
    }
  }

  const now = new Date();
  const shelter: ShelterDocument = {
    name: data.name,
    location: data.location,
    coordinates: data.coordinates,
    totalCapacity: data.totalCapacity,
    currentOccupancy: 0,
    availableCapacity: calculateShelterCapacity(data.totalCapacity, 0),
    facilities: data.facilities,
    shelterManagerId,
    status: "active",
    occupancyHistory: [],
    activityHistory: [{
      action: "shelter_registered",
      timestamp: now,
      changedBy: actor.id,
      details: "Shelter registered",
    }],
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(shelter);
  return { ...shelter, _id: result.insertedId };
};

export const listShelters = async (
  query: ListSheltersQuery,
  user: AuthenticatedUser
) => {
  const collection = await getSheltersCollection();
  const filters: Filter<ShelterDocument>[] = [getReadScope(user)];
  if (query.status) filters.push({ status: query.status });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({ $or: [{ name: pattern }, { location: pattern }] });
  }
  const filter: Filter<ShelterDocument> = { $and: filters };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter)
      .sort({ status: 1, availableCapacity: -1, updatedAt: -1 })
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

export const getShelterById = async (
  shelterId: string,
  user: AuthenticatedUser
) => {
  const collection = await getSheltersCollection();
  const shelter = await collection.findOne({
    _id: new ObjectId(shelterId),
    ...getReadScope(user),
  });
  if (!shelter) throw new HttpError(404, "Shelter not found");
  return shelter;
};

export const updateShelter = async (
  shelterId: string,
  data: UpdateShelterInput,
  actor: AuthenticatedUser
) => {
  const collection = await getSheltersCollection();
  const _id = new ObjectId(shelterId);
  const current = await collection.findOne({ _id });
  if (!current) throw new HttpError(404, "Shelter not found");
  assertCanManage(current, actor);

  if (
    data.totalCapacity !== undefined &&
    data.totalCapacity < current.currentOccupancy
  ) {
    throw new HttpError(409, "Total capacity cannot be below current occupancy");
  }
  if (
    data.shelterManagerId !== undefined &&
    actor.role === "shelter_manager" &&
    data.shelterManagerId !== actor.id
  ) {
    throw new HttpError(403, "Only administrators can reassign a shelter manager");
  }
  if (data.shelterManagerId !== undefined && data.shelterManagerId !== null) {
    await assertActiveUserRole(
      data.shelterManagerId,
      "shelter_manager",
      "Assigned shelter manager is not active"
    );
  }

  const nextCapacity = data.totalCapacity ?? current.totalCapacity;
  const availableCapacity = calculateShelterCapacity(
    nextCapacity,
    current.currentOccupancy
  );
  const nextStatus =
    current.status === "full" && availableCapacity > 0
      ? "active"
      : availableCapacity === 0 && current.status === "active"
        ? "full"
        : current.status;
  const requestedStatus = data.status ?? nextStatus;
  const finalStatus =
    requestedStatus === "active" && availableCapacity === 0
      ? "full"
      : requestedStatus;
  const updatedAt = new Date();
  const update: UpdateFilter<ShelterDocument> = {
    $set: {
      ...data,
      availableCapacity,
      status: finalStatus,
      updatedAt,
    },
    $push: {
      activityHistory: {
        action: "shelter_updated",
        timestamp: updatedAt,
        changedBy: actor.id,
        details: `Updated ${Object.keys(data).join(", ")}`,
      } satisfies ShelterActivityHistoryEntry,
    },
  };
  const result = await collection.updateOne(
    { _id, updatedAt: current.updatedAt },
    update
  );
  if (!result.matchedCount) {
    throw new HttpError(409, "Shelter changed; refresh and try again");
  }
  return collection.findOne({ _id });
};

export const updateShelterOccupancy = async (
  shelterId: string,
  data: UpdateOccupancyInput,
  actor: AuthenticatedUser
) => {
  const collection = await getSheltersCollection();
  const _id = new ObjectId(shelterId);
  const current = await collection.findOne({ _id });
  if (!current) throw new HttpError(404, "Shelter not found");
  assertCanManage(current, actor);

  if (
    data.occupancyChange > 0 &&
    current.status !== "active"
  ) {
    throw new HttpError(409, "Occupancy can only increase at an active shelter");
  }
  const nextOccupancy = current.currentOccupancy + data.occupancyChange;
  const availableCapacity = calculateShelterCapacity(
    current.totalCapacity,
    nextOccupancy
  );
  const nextStatus =
    availableCapacity === 0
      ? "full"
      : current.status === "full"
        ? "active"
        : current.status;
  const now = new Date();
  const history: ShelterOccupancyHistoryEntry = {
    occupancyChange: data.occupancyChange,
    currentOccupancy: nextOccupancy,
    availableCapacity,
    timestamp: now,
    changedBy: actor.id,
    reason: data.reason,
  };
  const activityHistory: ShelterActivityHistoryEntry = {
    action: "occupancy_changed",
    timestamp: now,
    changedBy: actor.id,
    details: `Occupancy changed by ${data.occupancyChange}: ${data.reason}`,
  };
  const result = await collection.updateOne(
    {
      _id,
      currentOccupancy: current.currentOccupancy,
      totalCapacity: current.totalCapacity,
      updatedAt: current.updatedAt,
      ...(data.occupancyChange > 0 ? { status: "active" } : {}),
    },
    {
      $inc: {
        currentOccupancy: data.occupancyChange,
        availableCapacity: -data.occupancyChange,
      },
      $set: { status: nextStatus, updatedAt: now },
      $push: {
        occupancyHistory: history,
        activityHistory,
      },
    }
  );
  if (!result.matchedCount) {
    throw new HttpError(
      409,
      "Shelter occupancy or capacity changed; refresh and try again"
    );
  }
  return collection.findOne({ _id });
};

export const getShelterReports = async (user: AuthenticatedUser) => {
  const collection = await getSheltersCollection();
  const shelters = await collection.find(getReadScope(user), {
    projection: {
      name: 1,
      location: 1,
      status: 1,
      totalCapacity: 1,
      currentOccupancy: 1,
      availableCapacity: 1,
    },
  }).sort({ name: 1 }).toArray();
  return {
    totals: shelters.reduce(
      (totals, shelter) => ({
        shelters: totals.shelters + 1,
        capacity: totals.capacity + shelter.totalCapacity,
        occupancy: totals.occupancy + shelter.currentOccupancy,
        availableCapacity: totals.availableCapacity + shelter.availableCapacity,
        active: totals.active + (shelter.status === "active" ? 1 : 0),
        full: totals.full + (shelter.status === "full" ? 1 : 0),
      }),
      { shelters: 0, capacity: 0, occupancy: 0, availableCapacity: 0, active: 0, full: 0 }
    ),
    shelters,
  };
};

const distanceInMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(latitudeB - latitudeA);
  const longitudeDifference = radians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const findNearestAvailableShelters = async (
  query: NearestShelterQuery
) => {
  const collection = await getSheltersCollection();
  const shelters = await collection.find({
    status: "active",
    availableCapacity: { $gte: query.people },
  }, {
    projection: {
      name: 1,
      location: 1,
      coordinates: 1,
      totalCapacity: 1,
      currentOccupancy: 1,
      availableCapacity: 1,
      facilities: 1,
      status: 1,
    },
  }).toArray();
  return shelters
    .map((shelter) => ({
      ...shelter,
      distanceMeters: Math.round(distanceInMeters(
        query.latitude,
        query.longitude,
        shelter.coordinates.latitude,
        shelter.coordinates.longitude
      )),
    }))
    .sort((first, second) =>
      first.distanceMeters - second.distanceMeters ||
      second.availableCapacity - first.availableCapacity
    )
    .slice(0, 10);
};
