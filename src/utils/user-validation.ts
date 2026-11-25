import { ObjectId } from "mongodb";

import { connectDB } from "../config/database.js";
import { HttpError } from "./http-error.js";

interface AuthUserRecord {
  _id?: ObjectId | string;
  id?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  organizationId?: string;
}

export const assertActiveUserRole = async (
  userId: string,
  role: string,
  message: string
): Promise<AuthUserRecord> => {
  const db = await connectDB();
  const possibleIds: Array<{ _id: ObjectId | string } | { id: string }> = [
    { id: userId },
    { _id: userId },
  ];

  if (ObjectId.isValid(userId)) {
    possibleIds.push({ _id: new ObjectId(userId) });
  }

  const user = await db
    .collection<AuthUserRecord>("user")
    .findOne({ $or: possibleIds });

  if (!user || user.role !== role || user.isActive === false) {
    throw new HttpError(422, message);
  }

  return user;
};

export const assertActiveOrganization = async (
  organizationId: string
): Promise<void> => {
  const db = await connectDB();
  const organization = await db.collection<{
    _id: string;
    status: string;
  }>("organizations").findOne({
    _id: organizationId,
  });

  const active = organization
    ? organization.status === "active"
    : Boolean(await db.collection<AuthUserRecord>("user").findOne({
        organizationId,
        role: "relief_organization",
        isActive: { $ne: false },
      }));
  if (!active) {
    throw new HttpError(422, "Assigned organization is not active");
  }
};
