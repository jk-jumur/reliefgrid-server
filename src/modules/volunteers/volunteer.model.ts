import type { ObjectId } from "mongodb";
import type { z } from "zod";

import type {
  volunteerAvailabilityEnum,
} from "../../validators/volunteer.validator.js";

export type VolunteerAvailability = z.infer<typeof volunteerAvailabilityEnum>;

export interface VolunteerHistoryEntry {
  action: "registered" | "availability_changed" | "profile_updated";
  timestamp: Date;
  changedBy: string;
  details?: string;
}

export interface VolunteerDocument {
  _id?: ObjectId;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  skills: string[];
  availability: VolunteerAvailability;
  history: VolunteerHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
