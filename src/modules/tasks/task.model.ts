import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type { taskStatusEnum } from "../../validators/task.validator.js";

export type TaskStatus = z.infer<typeof taskStatusEnum>;

export interface TaskHistoryEntry {
  status: TaskStatus;
  timestamp: Date;
  changedBy: string;
  details?: string;
}

export interface FieldReport {
  _id: ObjectId;
  volunteerId: ObjectId;
  report: string;
  photoUrls: string[];
  createdAt: Date;
}

export interface TaskVolunteerMatching {
  requiredSkills: string[];
  matchedSkills: string[];
  algorithm: "availability_skill_coverage";
  matchedAt: Date;
}

export interface TaskDocument {
  _id?: ObjectId;
  title: string;
  description: string;
  location: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  teamId: ObjectId | null;
  volunteerIds: ObjectId[];
  incidentId: ObjectId | null;
  emergencyRequestId: ObjectId | null;
  volunteerMatching?: TaskVolunteerMatching;
  status: TaskStatus;
  history: TaskHistoryEntry[];
  fieldReports: FieldReport[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
