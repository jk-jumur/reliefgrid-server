import { MongoServerError } from "mongodb";
import type { UpdateFilter } from "mongodb";
import type { z } from "zod";

import { connectDB } from "./database.js";
import { HttpError } from "../utils/http-error.js";
import type { updatePlatformConfigurationSchema } from "../validators/admin.validator.js";

export interface PlatformConfigurationHistoryEntry {
  changedAt: Date;
  changedBy: string;
  changes: Array<{
    setting: string;
    previousValue: number;
    newValue: number;
  }>;
}

export interface PlatformConfigurationDocument {
  _id: string;
  requestDuplicateDetection: {
    windowMinutes: number;
    radiusMeters: number;
  };
  volunteerMatching: {
    maxTeamSize: number;
    candidatePoolSize: number;
  };
  updatedAt: Date;
  updatedBy: string | null;
  revision: number;
  history: PlatformConfigurationHistoryEntry[];
}

export type PlatformConfigurationUpdate =
  z.infer<typeof updatePlatformConfigurationSchema>["body"];

const configurationId = "global";
const defaultConfiguration: Omit<PlatformConfigurationDocument, "_id"> = {
  requestDuplicateDetection: {
    windowMinutes: 30,
    radiusMeters: 500,
  },
  volunteerMatching: {
    maxTeamSize: 10,
    candidatePoolSize: 500,
  },
  updatedAt: new Date(0),
  updatedBy: null,
  revision: 1,
  history: [],
};

const getCollection = async () => {
  const db = await connectDB();
  return db.collection<PlatformConfigurationDocument>("platformConfigurations");
};

export const getPlatformConfiguration = async () => {
  const collection = await getCollection();
  let configuration = await collection.findOne({ _id: configurationId });
  if (configuration) return configuration;

  const initialConfiguration: PlatformConfigurationDocument = {
    ...defaultConfiguration,
    _id: configurationId,
    updatedAt: new Date(),
  };
  try {
    await collection.insertOne(initialConfiguration);
    return initialConfiguration;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    configuration = await collection.findOne({ _id: configurationId });
    if (!configuration) throw error;
    return configuration;
  }
};

export const updatePlatformConfiguration = async (
  data: PlatformConfigurationUpdate,
  actorId: string
) => {
  const collection = await getCollection();
  const current = await getPlatformConfiguration();
  const requestDuplicateDetection = {
    ...current.requestDuplicateDetection,
    ...data.requestDuplicateDetection,
  };
  const volunteerMatching = {
    ...current.volunteerMatching,
    ...data.volunteerMatching,
  };
  const changes: PlatformConfigurationHistoryEntry["changes"] = [];

  for (const [setting, previousValue, newValue] of [
    [
      "requestDuplicateDetection.windowMinutes",
      current.requestDuplicateDetection.windowMinutes,
      requestDuplicateDetection.windowMinutes,
    ],
    [
      "requestDuplicateDetection.radiusMeters",
      current.requestDuplicateDetection.radiusMeters,
      requestDuplicateDetection.radiusMeters,
    ],
    [
      "volunteerMatching.maxTeamSize",
      current.volunteerMatching.maxTeamSize,
      volunteerMatching.maxTeamSize,
    ],
    [
      "volunteerMatching.candidatePoolSize",
      current.volunteerMatching.candidatePoolSize,
      volunteerMatching.candidatePoolSize,
    ],
  ] as const) {
    if (previousValue !== newValue) {
      changes.push({ setting, previousValue, newValue });
    }
  }
  if (changes.length === 0) return current;

  const updatedAt = new Date();
  const historyEntry: PlatformConfigurationHistoryEntry = {
    changedAt: updatedAt,
    changedBy: actorId,
    changes,
  };
  const update: UpdateFilter<PlatformConfigurationDocument> = {
    $set: {
      requestDuplicateDetection,
      volunteerMatching,
      updatedAt,
      updatedBy: actorId,
    },
    $inc: { revision: 1 },
    $push: { history: { $each: [historyEntry], $slice: -100 } },
  };
  const result = await collection.updateOne(
    { _id: configurationId, revision: current.revision },
    update
  );
  if (result.matchedCount !== 1) {
    throw new HttpError(409, "Platform configuration changed; reload and retry");
  }

  const updatedConfiguration = await collection.findOne({ _id: configurationId });
  if (!updatedConfiguration) {
    throw new Error("Updated platform configuration could not be loaded");
  }
  return updatedConfiguration;
};
