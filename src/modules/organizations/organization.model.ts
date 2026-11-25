import type { z } from "zod";

import type { organizationStatusEnum } from "../../validators/organization.validator.js";

export type OrganizationStatus = z.infer<typeof organizationStatusEnum>;

export interface OrganizationHistoryEntry {
  action: "organization_created" | "organization_updated";
  timestamp: Date;
  changedBy: string;
  details: string;
}

export interface OrganizationDocument {
  _id: string;
  name: string;
  description?: string;
  region: string;
  status: OrganizationStatus;
  history: OrganizationHistoryEntry[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
