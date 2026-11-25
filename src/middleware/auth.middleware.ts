
import type { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

import { connectDB } from "../config/database.js";
import { USER_ROLES } from "../constants/roles.js";
import type { AuthenticatedUser } from "../types/auth.types.js";

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;

if (!BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing");
}

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", BETTER_AUTH_URL)
);

const authPayloadSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  organizationId: z.string().nullable(),
  isActive: z.boolean(),
});

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Access token is missing",
    });
    return;
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    }));
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
    return;
  }

  const result = authPayloadSchema.safeParse(payload);

  if (!result.success) {
    res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
    return;
  }

  const database = await connectDB();
  const possibleIds: Array<{ _id: ObjectId | string } | { id: string }> = [
    { id: result.data.id },
    { _id: result.data.id },
  ];
  if (ObjectId.isValid(result.data.id)) {
    possibleIds.push({ _id: new ObjectId(result.data.id) });
  }
  const storedUser = await database.collection<{
    _id?: ObjectId | string;
    id?: string;
    email?: string;
    role?: string;
    organizationId?: string | null;
    isActive?: boolean;
  }>("user").findOne({
    $or: possibleIds,
  });

  if (!storedUser) {
    res.status(401).json({
      success: false,
      message: "Account is no longer available",
    });
    return;
  }

  const liveUser = authPayloadSchema.safeParse({
    id: result.data.id,
    email: storedUser.email,
    role: storedUser.role ?? "citizen",
    organizationId: storedUser.organizationId ?? null,
    isActive: storedUser.isActive !== false,
  });
  if (!liveUser.success) {
    res.status(403).json({
      success: false,
      message: "Account role or status is invalid",
    });
    return;
  }
  const user: AuthenticatedUser = liveUser.data;

  if (!user.isActive) {
    res.status(403).json({
      success: false,
      message: "Your account is inactive",
    });
    return;
  }

  if (user.role === "relief_organization") {
    if (!user.organizationId) {
      res.status(403).json({
        success: false,
        message: "Relief organization account is not assigned to an organization",
      });
      return;
    }
    const organizations = database.collection<{
      _id: string;
      status: string;
    }>("organizations");
    const organization = await organizations.findOne({
      _id: user.organizationId,
    });
    const organizationActive = organization
      ? organization.status === "active"
      : Boolean(await database.collection<{
          organizationId?: string;
          role?: string;
          isActive?: boolean;
        }>("user").findOne({
          organizationId: user.organizationId,
          role: "relief_organization",
          isActive: { $ne: false },
        }));
    if (!organizationActive) {
      res.status(403).json({
        success: false,
        message: "Relief organization access is inactive",
      });
      return;
    }
  }

  req.user = user;
  next();
};
