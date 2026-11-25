import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type {
  shelterStatusEnum,
} from "../../validators/shelter.validator.js";

export type ShelterStatus = z.infer<typeof shelterStatusEnum>;

export interface ShelterOccupancyHistoryEntry {
  occupancyChange: number;
  currentOccupancy: number;
  availableCapacity: number;
  timestamp: Date;
  changedBy: string;
  reason: string;
}

export interface ShelterActivityHistoryEntry {
  action: "shelter_registered" | "shelter_updated" | "occupancy_changed";
  timestamp: Date;
  changedBy: string;
  details: string;
}

export interface ShelterDocument {
  _id?: ObjectId;
  name: string;
  location: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  totalCapacity: number;
  currentOccupancy: number;
  availableCapacity: number;
  facilities: string[];
  shelterManagerId: string | null;
  status: ShelterStatus;
  occupancyHistory: ShelterOccupancyHistoryEntry[];
  activityHistory: ShelterActivityHistoryEntry[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
