import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type { IncidentCoordinates } from "../incidents/incident.model.js";
import type {
  emergencyRequestCategoryEnum,
  emergencyRequestStatusEnum,
  emergencyRequestPriorityEnum,
} from "../../validators/emergency-request.validator.js";
import type { incidentLocationRiskEnum } from "../../validators/incident.validator.js";

export type EmergencyRequestType = z.infer<typeof emergencyRequestCategoryEnum>;
export type EmergencyRequestStatus = z.infer<typeof emergencyRequestStatusEnum>;
export type EmergencyRequestPriority = z.infer<typeof emergencyRequestPriorityEnum>;
export type EmergencyRequestLocationRisk = z.infer<typeof incidentLocationRiskEnum>;

export interface EmergencyRequestHistoryEntry {
  action:
    | "request_submitted"
    | "status_changed"
    | "priority_changed"
    | "assigned"
    | "request_updated";
  status: EmergencyRequestStatus;
  priority: EmergencyRequestPriority;
  timestamp: Date;
  changedBy: string | null;
  details?: string[];
}

export interface EmergencyRequestDocument {
  _id?: ObjectId;
  requestType: EmergencyRequestType;
  requiredQuantity: number;
  location: string;
  coordinates: IncidentCoordinates;
  locationRisk: EmergencyRequestLocationRisk;
  urgency: EmergencyRequestPriority;
  affectedPeople: number;
  description: string;
  incidentId: string | null;
  requestedBy: string;
  organizationId: string | null;
  assignedOrganizationId: string | null;
  assignedCoordinator: string | null;
  priority: EmergencyRequestPriority;
  priorityScore: number;
  priorityOverridden: boolean;
  status: EmergencyRequestStatus;
  allocatedQuantity?: number;
  deliveredQuantity?: number;
  rejectionReason?: string;
  assignedAt?: Date;
  submittedAt: Date;
  completedAt?: Date;
  updatedAt: Date;
  requestHistory: EmergencyRequestHistoryEntry[];
}
