
import type { ObjectId } from "mongodb";
import type {
  incidentCategoryEnum,
  incidentSeverityEnum,
  incidentPriorityEnum,
  incidentStatusEnum,
  incidentLocationRiskEnum,
} from "../../validators/incident.validator.js";
import type { z } from "zod";

export type IncidentCategory = z.infer<typeof incidentCategoryEnum>;
export type IncidentSeverity = z.infer<typeof incidentSeverityEnum>;
export type IncidentPriority = z.infer<typeof incidentPriorityEnum>;
export type IncidentStatus = z.infer<typeof incidentStatusEnum>;
export type IncidentLocationRisk = z.infer<typeof incidentLocationRiskEnum>;

export interface IncidentCoordinates {
  latitude: number;
  longitude: number;
}

export interface IncidentHistoryEntry {
  action:
    | "incident_reported"
    | "status_changed"
    | "priority_changed"
    | "coordinator_assigned"
    | "incident_updated";
  status: IncidentStatus;
  priority: IncidentPriority;
  timestamp: Date;
  changedBy: string | null;
  details?: string[];
}

export interface IncidentDocument {
  _id?: ObjectId;
  title: string;
  description: string;
  category: IncidentCategory;
  location: string;
  coordinates: IncidentCoordinates;
  locationRisk: IncidentLocationRisk;
  severity: IncidentSeverity;
  affectedPopulation: number;
  imageUrl?: string;
  priority: IncidentPriority;
  priorityScore?: number;
  priorityOverridden?: boolean;
  status: IncidentStatus;
  assignedCoordinator: string | null;
  reportedBy: string | null;
  organizationId: string | null;
  incidentHistory: IncidentHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
