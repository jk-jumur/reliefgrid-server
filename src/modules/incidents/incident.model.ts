
import type { ObjectId } from "mongodb";
import type {
  incidentCategoryEnum,
  incidentSeverityEnum,
  incidentPriorityEnum,
  incidentStatusEnum,
} from "../../validators/incident.validator.js";
import type { z } from "zod";

export type IncidentCategory = z.infer<typeof incidentCategoryEnum>;
export type IncidentSeverity = z.infer<typeof incidentSeverityEnum>;
export type IncidentPriority = z.infer<typeof incidentPriorityEnum>;
export type IncidentStatus = z.infer<typeof incidentStatusEnum>;

export interface IncidentCoordinates {
  latitude: number;
  longitude: number;
}

export interface IncidentHistoryEntry {
  action: string;
  status: IncidentStatus;
  timestamp: Date;
  changedBy: ObjectId | null;
}

export interface IncidentDocument {
  _id?: ObjectId;
  title: string;
  description: string;
  category: IncidentCategory;
  location: string;
  coordinates: IncidentCoordinates;
  severity: IncidentSeverity;
  affectedPopulation: number;
  imageUrl?: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assignedCoordinator: ObjectId | null;
  reportedBy: ObjectId | null;
  incidentHistory: IncidentHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
