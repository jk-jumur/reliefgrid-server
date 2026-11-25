import { ObjectId, type Filter } from "mongodb";
import type { z } from "zod";

import { client, connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createTeamSchema,
  listTeamsSchema,
  updateTeamSchema,
} from "../../validators/team.validator.js";
import type { VolunteerDocument } from "../volunteers/volunteer.model.js";
import type { TeamDocument, TeamHistoryEntry } from "./team.model.js";

type CreateTeamInput = z.infer<typeof createTeamSchema>["body"];
type ListTeamsQuery = z.infer<typeof listTeamsSchema>["query"];
type UpdateTeamInput = z.infer<typeof updateTeamSchema>["body"];

let indexesPromise: Promise<void> | null = null;

const getTeamsCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<TeamDocument>("teams");
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ status: 1, updatedAt: -1 }),
      collection.createIndex({ volunteerIds: 1 }),
      collection.createIndex({ incidentId: 1 }),
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

const getReadScope = async (
  user: AuthenticatedUser
): Promise<Filter<TeamDocument>> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "volunteer") {
    const db = await connectDB();
    const profile = await db.collection<VolunteerDocument>("volunteers")
      .findOne({ userId: user.id });
    return profile?._id ? { volunteerIds: profile._id } : { _id: { $exists: false } };
  }
  return { _id: { $exists: false } };
};

export const createTeam = async (
  data: CreateTeamInput,
  actor: AuthenticatedUser
) => {
  const db = await connectDB();
  const volunteers = db.collection<VolunteerDocument>("volunteers");
  const collection = await getTeamsCollection();
  const volunteerIds = data.volunteerIds.map((id) => new ObjectId(id));
  const session = client.startSession();
  const now = new Date();
  const teamId = new ObjectId();
  try {
    await session.withTransaction(async () => {
      const availableProfiles = await volunteers.find(
        { _id: { $in: volunteerIds }, availability: "available" },
        { session }
      ).toArray();
      if (availableProfiles.length !== volunteerIds.length) {
        throw new HttpError(
          409,
          "Every team member must have an available volunteer profile"
        );
      }

      const team: TeamDocument = {
        _id: teamId,
        name: data.name,
        description: data.description,
        volunteerIds,
        incidentId: null,
        status: "active",
        createdBy: actor.id,
        history: [
          {
            status: "active",
            timestamp: now,
            changedBy: actor.id,
            details: "Team created and volunteers assigned",
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      await collection.insertOne(team, { session });

      const volunteerUpdate = await volunteers.updateMany(
        { _id: { $in: volunteerIds }, availability: "available" },
        {
          $set: { availability: "assigned", updatedAt: now },
          $push: {
            history: {
              action: "availability_changed",
              timestamp: now,
              changedBy: actor.id,
              details: `Assigned to team ${team.name}`,
            },
          },
        },
        { session }
      );
      if (volunteerUpdate.modifiedCount !== volunteerIds.length) {
        throw new HttpError(409, "Volunteer availability changed; refresh and retry");
      }
    });
  } finally {
    await session.endSession();
  }
  const team = await collection.findOne({ _id: teamId });
  if (!team) throw new Error("Team was not available after the transaction committed");
  return team;
};

export const listTeams = async (
  query: ListTeamsQuery,
  user: AuthenticatedUser
) => {
  const collection = await getTeamsCollection();
  const filters: Filter<TeamDocument>[] = [await getReadScope(user)];
  if (query.status) filters.push({ status: query.status });
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filters.push({ $or: [{ name: pattern }, { description: pattern }] });
  }
  const filter: Filter<TeamDocument> = { $and: filters };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(query.limit).toArray(),
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

export const getTeamById = async (
  teamId: string,
  user: AuthenticatedUser
) => {
  const collection = await getTeamsCollection();
  const team = await collection.findOne({
    _id: new ObjectId(teamId),
    ...await getReadScope(user),
  });
  if (!team) throw new HttpError(404, "Team not found");
  return team;
};

export const updateTeam = async (
  teamId: string,
  data: UpdateTeamInput,
  actor: AuthenticatedUser
) => {
  const collection = await getTeamsCollection();
  const db = await connectDB();
  const volunteers = db.collection<VolunteerDocument>("volunteers");
  const tasks = db.collection("tasks");
  const _id = new ObjectId(teamId);
  const session = client.startSession();
  const now = new Date();
  let updatedTeam: TeamDocument | null = null;

  try {
    await session.withTransaction(async () => {
      const team = await collection.findOne({ _id }, { session });
      if (!team) throw new HttpError(404, "Team not found");
      const allowedTransitions: Record<TeamDocument["status"], TeamDocument["status"][]> = {
        active: ["deployed", "inactive"],
        deployed: ["active", "inactive"],
        inactive: [],
      };
      if (
        data.status &&
        data.status !== team.status &&
        !allowedTransitions[team.status].includes(data.status)
      ) {
        throw new HttpError(
          409,
          `Team status cannot change from ${team.status} to ${data.status}`
        );
      }
      const nextIncidentId =
        data.incidentId === undefined
          ? team.incidentId
          : data.incidentId
            ? new ObjectId(data.incidentId)
            : null;
      const nextStatus = data.status ?? team.status;
      if (nextStatus === "deployed" && !nextIncidentId) {
        throw new HttpError(422, "A deployed team must be assigned to an incident");
      }
      if (nextIncidentId && data.incidentId) {
        const incident = await db.collection("incidents").findOne(
          { _id: nextIncidentId },
          { session }
        );
        if (!incident) throw new HttpError(422, "Assigned incident does not exist");
      }
      if (data.status === "inactive") {
        const activeTask = await tasks.findOne(
          { teamId: _id, status: { $in: ["assigned", "in_progress"] } },
          { session }
        );
        if (activeTask) {
          throw new HttpError(409, "A team with active tasks cannot be deactivated");
        }
        await volunteers.updateMany(
          { _id: { $in: team.volunteerIds }, availability: "assigned" },
          {
            $set: { availability: "available", updatedAt: now },
            $push: {
              history: {
                action: "availability_changed",
                timestamp: now,
                changedBy: actor.id,
                details: `Released from inactive team ${team.name}`,
              },
            },
          },
          { session }
        );
      }

      const history: TeamHistoryEntry = {
        status: nextStatus,
        timestamp: now,
        changedBy: actor.id,
        details: `Team updated to ${nextStatus}`,
      };
      const update = await collection.updateOne(
        { _id, updatedAt: team.updatedAt },
        {
          $set: {
            status: nextStatus,
            incidentId: nextIncidentId,
            updatedAt: now,
          },
          $push: { history },
        },
        { session }
      );
      if (!update.matchedCount) {
        throw new HttpError(409, "Team changed; refresh and try again");
      }
      updatedTeam = {
        ...team,
        status: nextStatus,
        incidentId: nextIncidentId,
        updatedAt: now,
        history: [...team.history, history],
      };
    });
  } finally {
    await session.endSession();
  }
  if (!updatedTeam) throw new Error("Team update did not complete");
  return updatedTeam;
};
