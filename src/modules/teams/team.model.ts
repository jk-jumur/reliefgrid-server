import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type { teamStatusEnum } from "../../validators/team.validator.js";

export type TeamStatus = z.infer<typeof teamStatusEnum>;

export interface TeamHistoryEntry {
  status: TeamStatus;
  timestamp: Date;
  changedBy: string;
  details?: string;
}

export interface TeamDocument {
  _id?: ObjectId;
  name: string;
  description: string;
  volunteerIds: ObjectId[];
  incidentId: ObjectId | null;
  status: TeamStatus;
  createdBy: string;
  history: TeamHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
