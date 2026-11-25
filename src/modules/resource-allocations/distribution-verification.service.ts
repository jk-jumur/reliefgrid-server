import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { ObjectId } from "mongodb";

import { client, connectDB } from "../../config/database.js";
import { HttpError } from "../../utils/http-error.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import type {
  DistributionVerificationDocument,
  ResourceAllocationDocument,
} from "./resource-allocation.model.js";
import { updateResourceAllocation } from "./resource-allocation.service.js";

const verificationLifetimeMs = 24 * 60 * 60 * 1000;
let indexesPromise: Promise<void> | null = null;

const getVerificationCollection = async () => {
  const db = await connectDB();
  const collection = db.collection<DistributionVerificationDocument>(
    "distributionVerifications"
  );
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection.createIndex({ tokenHash: 1 }, { unique: true }),
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ allocationId: 1, consumedAt: 1 }),
    ]).then(() => undefined).catch((error: unknown) => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
  return collection;
};

const assertCanIssue = (
  allocation: ResourceAllocationDocument,
  actor: AuthenticatedUser
): void => {
  if (
    actor.role === "system_admin" ||
    actor.role === "emergency_coordinator"
  ) {
    return;
  }
  if (
    actor.role === "relief_organization" &&
    actor.organizationId === allocation.organizationId
  ) {
    return;
  }
  throw new HttpError(404, "Resource allocation not found");
};

export const createDistributionVerificationQr = async (
  allocationId: string,
  actor: AuthenticatedUser
) => {
  const _id = new ObjectId(allocationId);
  const db = await connectDB();
  const allocations = db.collection<ResourceAllocationDocument>("resourceAllocations");
  const allocation = await allocations.findOne({ _id });
  if (!allocation) throw new HttpError(404, "Resource allocation not found");
  assertCanIssue(allocation, actor);
  if (allocation.status !== "in_transit") {
    throw new HttpError(409, "A delivery QR can only be issued for an in-transit allocation");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + verificationLifetimeMs);
  const qrCodeDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 320,
  });
  const verifications = await getVerificationCollection();
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      const current = await allocations.findOne({ _id }, { session });
      if (!current) throw new HttpError(404, "Resource allocation not found");
      assertCanIssue(current, actor);
      if (current.status !== "in_transit") {
        throw new HttpError(409, "Allocation is no longer in transit");
      }
      await verifications.updateMany(
        { allocationId: _id, consumedAt: null },
        { $set: { consumedAt: createdAt, consumedBy: actor.id } },
        { session }
      );
      await verifications.insertOne(
        {
          tokenHash,
          allocationId: _id,
          issuedBy: actor.id,
          createdAt,
          expiresAt,
          consumedAt: null,
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return { qrCodeDataUrl, verificationToken: token, expiresAt };
};

export const verifyDistributionQr = async (
  token: string,
  actor: AuthenticatedUser
) => {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const verifications = await getVerificationCollection();
  const verification = await verifications.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  });
  if (!verification) {
    throw new HttpError(410, "Delivery QR is expired or has already been used");
  }

  return updateResourceAllocation(
    verification.allocationId.toHexString(),
    { status: "delivered" },
    actor,
    tokenHash
  );
};
