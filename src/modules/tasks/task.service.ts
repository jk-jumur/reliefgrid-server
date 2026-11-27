import { ObjectId, type Filter } from "mongodb";
import type { z } from "zod";

import { client, connectDB } from "../../config/database.js";
import { getPlatformConfiguration } from "../../config/platform-configuration.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createFieldReportSchema,
  createTaskSchema,
  autoAssignTaskSchema,
  listTasksSchema,
  updateTaskStatusSchema,
} from "../../validators/task.validator.js";
import type { EmergencyRequestDocument } from "../emergency-requests/emergency-request.model.js";
import type { IncidentDocument } from "../incidents/incident.model.js";
import type { TeamDocument } from "../teams/team.model.js";
import type { VolunteerDocument } from "../volunteers/volunteer.model.js";
import type {
  FieldReport,
  TaskDocument,
  TaskHistoryEntry,
  TaskVolunteerMatching,
} from "./task.model.js";
import { matchAvailableVolunteers } from "./volunteer-matching.js";

type CreateTaskInput = z.infer<typeof createTaskSchema>["body"];
type AutoAssignTaskInput = z.infer<typeof autoAssignTaskSchema>["body"];
type ListTasksQuery = z.infer<typeof listTasksSchema>["query"];
type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>["body"];
type FieldReportInput = z.infer<typeof createFieldReportSchema>["body"];

let indexesPromise: Promise<void> | null = null;
const getTasksCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<TaskDocument>("tasks");
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ status: 1, updatedAt: -1 }),
      collection.createIndex({ volunteerIds: 1, status: 1 }),
      collection.createIndex({ teamId: 1, status: 1 }),
      collection.createIndex({ incidentId: 1, status: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
  return collection;
};

const getVolunteerProfile = async (userId: string) => {
  const db = await connectDB();
  return db.collection<VolunteerDocument>("volunteers").findOne({ userId });
};

const getReadScope = async (
  user: AuthenticatedUser
): Promise<Filter<TaskDocument>> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    return {};
  }
  if (user.role === "volunteer") {
    const profile = await getVolunteerProfile(user.id);
    return profile?._id ? { volunteerIds: profile._id } : { _id: { $exists: false } };
  }
  return { _id: { $exists: false } };
};

const assertCanRead = async (
  task: TaskDocument,
  user: AuthenticatedUser
): Promise<void> => {
  if (user.role === "system_admin" || user.role === "emergency_coordinator") return;
  if (user.role === "volunteer") {
    const profile = await getVolunteerProfile(user.id);
    if (profile?._id && task.volunteerIds.some((id) => id.equals(profile._id))) return;
  }
  throw new HttpError(404, "Task not found");
};

export const createTask = async (
  data: CreateTaskInput,
  actor: AuthenticatedUser,
  volunteerMatching?: TaskVolunteerMatching
) => {
  const db = await connectDB();
  const collection = await getTasksCollection();
  const volunteers = db.collection<VolunteerDocument>("volunteers");
  const teams = db.collection<TeamDocument>("teams");
  const incidents = db.collection<IncidentDocument>("incidents");
  const requests = db.collection<EmergencyRequestDocument>("emergencyRequests");
  const session = client.startSession();
  const now = new Date();
  const taskId = new ObjectId();
  try {
    await session.withTransaction(async () => {
      const team = data.teamId
        ? await teams.findOne({ _id: new ObjectId(data.teamId) }, { session })
        : null;
      if (data.teamId && !team) throw new HttpError(404, "Team not found");
      if (team && team.status === "inactive") {
        throw new HttpError(409, "Tasks cannot be assigned to an inactive team");
      }

      const volunteerIds = data.volunteerIds
        ? data.volunteerIds.map((id) => new ObjectId(id))
        : team?.volunteerIds ?? [];
      if (!volunteerIds.length) {
        throw new HttpError(422, "At least one volunteer must be assigned");
      }
      if (
        team &&
        volunteerIds.some((id) => !team.volunteerIds.some((memberId) => memberId.equals(id)))
      ) {
        throw new HttpError(422, "Task volunteers must belong to the assigned team");
      }
      const requiredAvailability = team ? "assigned" : "available";
      const profiles = await volunteers.find(
        {
          _id: { $in: volunteerIds },
          availability: requiredAvailability,
        },
        { session }
      ).toArray();
      if (profiles.length !== volunteerIds.length) {
        throw new HttpError(
          409,
          team
            ? "Team volunteer profiles are no longer assigned"
            : "Every assigned volunteer must be available"
        );
      }
      if (data.incidentId) {
        const incident = await incidents.findOne(
          { _id: new ObjectId(data.incidentId) },
          { session }
        );
        if (!incident) throw new HttpError(422, "Assigned incident does not exist");
      }
      if (data.emergencyRequestId) {
        const request = await requests.findOne(
          { _id: new ObjectId(data.emergencyRequestId) },
          { session }
        );
        if (!request) throw new HttpError(422, "Linked emergency request does not exist");
      }

      const task: TaskDocument = {
        _id: taskId,
        title: data.title,
        description: data.description,
        location: data.location,
        coordinates: data.coordinates,
        teamId: team?._id ?? null,
        volunteerIds,
        incidentId: data.incidentId ? new ObjectId(data.incidentId) : null,
        emergencyRequestId: data.emergencyRequestId
          ? new ObjectId(data.emergencyRequestId)
          : null,
        ...(volunteerMatching ? { volunteerMatching } : {}),
        status: "assigned",
        history: [
          {
            status: "assigned",
            timestamp: now,
            changedBy: actor.id,
            details: volunteerMatching
              ? `Automatically matched volunteers for skills: ${volunteerMatching.requiredSkills.join(", ")}`
              : "Task assigned to volunteers",
          },
        ],
        fieldReports: [],
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      };
      await collection.insertOne(task, { session });

      if (!team) {
        const update = await volunteers.updateMany(
          { _id: { $in: volunteerIds }, availability: "available" },
          {
            $set: { availability: "assigned", updatedAt: now },
            $push: {
              history: {
                action: "availability_changed",
                timestamp: now,
                changedBy: actor.id,
                details: `Assigned to task ${task.title}`,
              },
            },
          },
          { session }
        );
        if (update.modifiedCount !== volunteerIds.length) {
          throw new HttpError(409, "Volunteer availability changed; refresh and retry");
        }
      }
    });
  } finally {
    await session.endSession();
  }
  const task = await collection.findOne({ _id: taskId });
  if (!task) throw new Error("Task was not available after the transaction committed");
  return task;
};

export const autoAssignTask = async (
  data: AutoAssignTaskInput,
  actor: AuthenticatedUser
) => {
  const configuration = await getPlatformConfiguration();
  if (data.volunteerCount > configuration.volunteerMatching.maxTeamSize) {
    throw new HttpError(
      422,
      `Volunteer count cannot exceed the configured maximum of ${configuration.volunteerMatching.maxTeamSize}`
    );
  }

  const db = await connectDB();
  const volunteers = db.collection<VolunteerDocument>("volunteers");
  const skillPatterns = data.requiredSkills.map(
    (skill) => new RegExp(`^${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
  );
  const candidates = await volunteers
    .find({
      availability: "available",
      skills: { $in: skillPatterns },
    })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(configuration.volunteerMatching.candidatePoolSize)
    .toArray();
  const match = matchAvailableVolunteers(
    candidates,
    data.requiredSkills,
    data.volunteerCount
  );
  const volunteerIds = match.volunteers.map((profile) => {
    if (!profile._id) {
      throw new Error("Matched volunteer profile is missing its database ID");
    }
    return profile._id.toHexString();
  });
  const taskData: CreateTaskInput = {
    title: data.title,
    description: data.description,
    location: data.location,
    coordinates: data.coordinates,
    volunteerIds,
    ...(data.incidentId ? { incidentId: data.incidentId } : {}),
    ...(data.emergencyRequestId ? { emergencyRequestId: data.emergencyRequestId } : {}),
  };
  return createTask(taskData, actor, {
    requiredSkills: data.requiredSkills.map((skill) => skill.trim()),
    matchedSkills: match.matchedSkills,
    algorithm: "availability_skill_coverage",
    matchedAt: new Date(),
  });
};

export const listTasks = async (
  query: ListTasksQuery,
  user: AuthenticatedUser
) => {
  const collection = await getTasksCollection();
  const filters: Filter<TaskDocument>[] = [await getReadScope(user)];
  if (query.status) filters.push({ status: query.status });
  if (query.incidentId) filters.push({ incidentId: new ObjectId(query.incidentId) });
  if (query.teamId) filters.push({ teamId: new ObjectId(query.teamId) });
  if (query.search) {
    const pattern = new RegExp(
      query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    const searchFilters: Filter<TaskDocument>[] = [
      { title: pattern },
      { description: pattern },
      { location: pattern },
      { status: pattern },
    ];
    if (/^[a-f\d]{24}$/i.test(query.search)) {
      searchFilters.push({ _id: new ObjectId(query.search) });
    }
    filters.push({ $or: searchFilters });
  }
  const filter: Filter<TaskDocument> = { $and: filters };
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

export const getTaskById = async (taskId: string, user: AuthenticatedUser) => {
  const collection = await getTasksCollection();
  const task = await collection.findOne({ _id: new ObjectId(taskId) });
  if (!task) throw new HttpError(404, "Task not found");
  await assertCanRead(task, user);
  return task;
};

export const updateTaskStatus = async (
  taskId: string,
  data: UpdateTaskStatusInput,
  actor: AuthenticatedUser
) => {
  const db = await connectDB();
  const collection = await getTasksCollection();
  const volunteers = db.collection<VolunteerDocument>("volunteers");
  const _id = new ObjectId(taskId);
  const session = client.startSession();
  const now = new Date();
  let updatedTask: TaskDocument | null = null;
  try {
    await session.withTransaction(async () => {
      const task = await collection.findOne({ _id }, { session });
      if (!task) throw new HttpError(404, "Task not found");
      const coordinator =
        actor.role === "system_admin" || actor.role === "emergency_coordinator";
      if (!coordinator) await assertCanRead(task, actor);

      const allowed: Record<TaskDocument["status"], TaskDocument["status"][]> = {
        assigned: ["in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[task.status].includes(data.status)) {
        throw new HttpError(
          409,
          `Task status cannot change from ${task.status} to ${data.status}`
        );
      }
      if (!coordinator && !["in_progress", "completed"].includes(data.status)) {
        throw new HttpError(403, "Volunteers can only progress or complete assigned tasks");
      }

      const history: TaskHistoryEntry = {
        status: data.status,
        timestamp: now,
        changedBy: actor.id,
        details: `Task status changed to ${data.status}`,
      };
      const updateResult = await collection.updateOne(
        { _id, status: task.status, updatedAt: task.updatedAt },
        {
          $set: {
            status: data.status,
            updatedAt: now,
            ...(data.status === "completed" ? { completedAt: now } : {}),
          },
          $push: { history },
        },
        { session }
      );
      if (!updateResult.matchedCount) {
        throw new HttpError(409, "Task changed; refresh and try again");
      }

      if (!task.teamId && ["completed", "cancelled"].includes(data.status)) {
        const otherTasks = await collection.find(
          {
            _id: { $ne: _id },
            status: { $in: ["assigned", "in_progress"] },
            volunteerIds: { $in: task.volunteerIds },
          },
          { session, projection: { volunteerIds: 1 } }
        ).toArray();
        const stillAssigned = new Set(
          otherTasks.flatMap((otherTask) =>
            otherTask.volunteerIds.map((volunteerId) => volunteerId.toHexString())
          )
        );
        const releasableIds = task.volunteerIds.filter(
          (volunteerId) => !stillAssigned.has(volunteerId.toHexString())
        );
        if (releasableIds.length) {
          await volunteers.updateMany(
            { _id: { $in: releasableIds }, availability: "assigned" },
            {
              $set: { availability: "available", updatedAt: now },
              $push: {
                history: {
                  action: "availability_changed",
                  timestamp: now,
                  changedBy: actor.id,
                  details: `Released after task ${task.title} ended`,
                },
              },
            },
            { session }
          );
        }
      }
      updatedTask = {
        ...task,
        status: data.status,
        updatedAt: now,
        ...(data.status === "completed" ? { completedAt: now } : {}),
        history: [...task.history, history],
      };
    });
  } finally {
    await session.endSession();
  }
  if (!updatedTask) throw new Error("Task status update did not complete");
  return updatedTask;
};

export const submitFieldReport = async (
  taskId: string,
  data: FieldReportInput,
  actor: AuthenticatedUser
) => {
  if (actor.role !== "volunteer") {
    throw new HttpError(403, "Only assigned volunteers can submit field reports");
  }
  const collection = await getTasksCollection();
  const profile = await getVolunteerProfile(actor.id);
  if (!profile?._id) throw new HttpError(404, "Volunteer profile not found");

  const _id = new ObjectId(taskId);
  const task = await collection.findOne({ _id });
  if (!task) throw new HttpError(404, "Task not found");
  if (!task.volunteerIds.some((volunteerId) => volunteerId.equals(profile._id))) {
    throw new HttpError(404, "Task not found");
  }
  if (task.status === "completed" || task.status === "cancelled") {
    throw new HttpError(409, "Field reports cannot be added to a closed task");
  }

  const now = new Date();
  const report: FieldReport = {
    _id: new ObjectId(),
    volunteerId: profile._id,
    report: data.report,
    photoUrls: data.photoUrls,
    createdAt: now,
  };
  const result = await collection.updateOne(
    {
      _id,
      status: task.status,
      updatedAt: task.updatedAt,
      volunteerIds: profile._id,
    },
    {
      $push: { fieldReports: report },
      $set: { updatedAt: now },
    }
  );
  if (!result.matchedCount) {
    throw new HttpError(409, "Task changed; refresh and try again");
  }
  return report;
};
