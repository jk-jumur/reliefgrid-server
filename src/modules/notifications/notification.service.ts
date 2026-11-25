import {
  MongoServerError,
  ObjectId,
} from "mongodb";

import { client, connectDB } from "../../config/database.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";
import type { EmergencyRequestDocument } from "../emergency-requests/emergency-request.model.js";
import type { IncidentDocument } from "../incidents/incident.model.js";
import type { ResourceAllocationDocument } from "../resource-allocations/resource-allocation.model.js";
import type { ResourceDocument } from "../resources/resource.model.js";
import type { ShelterDocument } from "../shelters/shelter.model.js";
import type { TaskDocument } from "../tasks/task.model.js";
import type {
  NotificationDeliveryDocument,
  NotificationDocument,
  NotificationReceiptDocument,
} from "./notification.model.js";
import {
  assertCommunicationProvidersConfigured,
  sendCommunication,
  type CommunicationChannel,
} from "./communication-provider.js";

let receiptIndexPromise: Promise<void> | null = null;
let deliveryIndexPromise: Promise<void> | null = null;

const getNotifications = async (user: AuthenticatedUser) => {
  const db = await connectDB();
  const sources: NotificationDocument[] = [];
  const add = (
    type: string,
    title: string,
    message: string,
    entityType: string,
    entityId: ObjectId | string,
    timestamp: Date
  ) => {
    sources.push({
      notificationId: `${type}:${entityId.toString()}:${timestamp.getTime()}`,
      type,
      title,
      message,
      entityType,
      entityId: entityId.toString(),
      timestamp,
      readAt: null,
    });
  };

  if (user.role === "system_admin" || user.role === "emergency_coordinator") {
    const [incidents, requests, resources, shelters] = await Promise.all([
      db.collection<IncidentDocument>("incidents").find({
        status: { $in: ["reported", "under_review"] },
      }).sort({ updatedAt: -1 }).limit(50).toArray(),
      db.collection<EmergencyRequestDocument>("emergencyRequests").find({
        status: { $in: ["pending", "under_review"] },
      }).sort({ updatedAt: -1 }).limit(50).toArray(),
      db.collection<ResourceDocument>("resources").find({
        availability: { $in: ["low_stock", "out_of_stock"] },
      }).sort({ updatedAt: -1 }).limit(50).toArray(),
      db.collection<ShelterDocument>("shelters").find({ status: "full" })
        .sort({ updatedAt: -1 }).limit(50).toArray(),
    ]);
    incidents.forEach((incident) => incident._id && add(
      "incident_review",
      "Incident needs review",
      `${incident.title} — ${incident.location}`,
      "incident",
      incident._id,
      incident.updatedAt
    ));
    requests.forEach((request) => request._id && add(
      "request_review",
      "Emergency request needs review",
      `${request.requestType} request at ${request.location}`,
      "emergency_request",
      request._id,
      request.updatedAt
    ));
    resources.forEach((resource) => resource._id && add(
      "resource_low_stock",
      "Resource stock is low",
      `${resource.name}: ${resource.availableQuantity} available`,
      "resource",
      resource._id,
      resource.updatedAt
    ));
    shelters.forEach((shelter) => shelter._id && add(
      "shelter_full",
      "Shelter has reached capacity",
      `${shelter.name}: ${shelter.currentOccupancy}/${shelter.totalCapacity}`,
      "shelter",
      shelter._id,
      shelter.updatedAt
    ));
  } else if (user.role === "relief_organization" && user.organizationId) {
    const [allocations, requests, resources] = await Promise.all([
      db.collection<ResourceAllocationDocument>("resourceAllocations").find({
        organizationId: user.organizationId,
        status: { $in: ["pending", "approved", "preparing", "dispatched", "in_transit"] },
      }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection<EmergencyRequestDocument>("emergencyRequests").find({
        assignedOrganizationId: user.organizationId,
        status: { $in: ["assigned", "in_progress"] },
      }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection<ResourceDocument>("resources").find({
        organizationId: user.organizationId,
        availability: { $in: ["low_stock", "out_of_stock"] },
      }).sort({ updatedAt: -1 }).limit(50).toArray(),
    ]);
    allocations.forEach((allocation) => allocation._id && add(
      "allocation_update",
      "Resource allocation requires action",
      `Allocation status: ${allocation.status}`,
      "allocation",
      allocation._id,
      allocation.updatedAt
    ));
    requests.forEach((request) => request._id && add(
      "request_assignment",
      "Emergency request assigned to your organization",
      `${request.requestType} request at ${request.location}`,
      "emergency_request",
      request._id,
      request.updatedAt
    ));
    resources.forEach((resource) => resource._id && add(
      "resource_low_stock",
      "Resource stock is low",
      `${resource.name}: ${resource.availableQuantity} available`,
      "resource",
      resource._id,
      resource.updatedAt
    ));
  } else if (user.role === "volunteer") {
    const profile = await db.collection("volunteers").findOne({ userId: user.id });
    if (profile?._id) {
      const tasks = await db.collection<TaskDocument>("tasks").find({
        volunteerIds: profile._id,
        status: { $in: ["assigned", "in_progress"] },
      }).sort({ updatedAt: -1 }).limit(100).toArray();
      tasks.forEach((task) => task._id && add(
        "task_update",
        "You have an active response task",
        `${task.title} — ${task.location} (${task.status})`,
        "task",
        task._id,
        task.updatedAt
      ));
    }
  } else if (user.role === "shelter_manager") {
    const shelters = await db.collection<ShelterDocument>("shelters").find({
      shelterManagerId: user.id,
      status: "full",
    }).sort({ updatedAt: -1 }).limit(50).toArray();
    shelters.forEach((shelter) => shelter._id && add(
      "shelter_full",
      "Managed shelter has reached capacity",
      `${shelter.name}: ${shelter.currentOccupancy}/${shelter.totalCapacity}`,
      "shelter",
      shelter._id,
      shelter.updatedAt
    ));
  } else if (user.role === "citizen") {
    const requests = await db.collection<EmergencyRequestDocument>("emergencyRequests").find({
      requestedBy: user.id,
      status: { $in: ["assigned", "in_progress", "completed", "rejected"] },
    }).sort({ updatedAt: -1 }).limit(50).toArray();
    requests.forEach((request) => request._id && add(
      "request_update",
      "Your emergency request was updated",
      `${request.requestType} request status: ${request.status}`,
      "emergency_request",
      request._id,
      request.updatedAt
    ));
  }

  sources.sort((first, second) =>
    second.timestamp.getTime() - first.timestamp.getTime()
  );
  const receipts = await db.collection<NotificationReceiptDocument>("notificationReceipts");
  if (!receiptIndexPromise) {
    receiptIndexPromise = receipts.createIndex(
      { recipientUserId: 1, notificationId: 1 },
      { unique: true }
    ).then(() => undefined).catch((error: unknown) => {
      receiptIndexPromise = null;
      throw error;
    });
  }
  await receiptIndexPromise;
  const readReceipts = await receipts.find({
    recipientUserId: user.id,
    notificationId: { $in: sources.map((notification) => notification.notificationId) },
  }).toArray();
  const readAtById = new Map(
    readReceipts.map((receipt) => [receipt.notificationId, receipt.readAt])
  );
  return sources.slice(0, 100).map((notification) => ({
    ...notification,
    readAt: readAtById.get(notification.notificationId) ?? null,
  }));
};

export const listNotifications = async (user: AuthenticatedUser) =>
  getNotifications(user);

export const markNotificationRead = async (
  notificationId: string,
  user: AuthenticatedUser
) => {
  const notifications = await getNotifications(user);
  if (!notifications.some((notification) => notification.notificationId === notificationId)) {
    throw new HttpError(404, "Notification not found");
  }
  const db = await connectDB();
  const readAt = new Date();
  const result = await db.collection<NotificationReceiptDocument>("notificationReceipts")
    .updateOne(
      { recipientUserId: user.id, notificationId },
      { $set: { recipientUserId: user.id, notificationId, readAt } },
      { upsert: true }
    );
  if (!result.acknowledged) {
    throw new Error("Notification read state was not saved");
  }
  return { notificationId, readAt };
};

export const deliverNotificationToSelf = async (
  notificationId: string,
  channels: CommunicationChannel[],
  user: AuthenticatedUser
) => {
  const notifications = await getNotifications(user);
  const notification = notifications.find(
    (item) => item.notificationId === notificationId
  );
  if (!notification) throw new HttpError(404, "Notification not found");

  assertCommunicationProvidersConfigured(channels);
  const db = await connectDB();
  const userCollection = db.collection<{
    _id?: ObjectId;
    id?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
  }>("user");
  const identityFilter = ObjectId.isValid(user.id)
    ? { $or: [{ id: user.id }, { _id: new ObjectId(user.id) }] }
    : { id: user.id };
  const contact = await userCollection.findOne(identityFilter);
  if (
    !contact ||
    contact.isActive === false ||
    typeof contact.email !== "string" ||
    contact.email !== user.email
  ) {
    throw new HttpError(404, "Notification recipient account is unavailable");
  }
  if (channels.includes("sms")) {
    if (!contact.phone) throw new HttpError(422, "Add a phone number before requesting SMS");
    if (!/^\+[1-9]\d{7,14}$/.test(contact.phone)) {
      throw new HttpError(422, "The account phone number must use E.164 format for SMS");
    }
  }
  const smsMessage = `${notification.title}: ${notification.message}`;
  if (channels.includes("sms") && smsMessage.length > 1600) {
    throw new HttpError(422, "Notification is too long to send as an SMS");
  }
  const deliveryContact = { email: contact.email, phone: contact.phone };

  const deliveries = db.collection<NotificationDeliveryDocument>(
    "notificationDeliveries"
  );
  if (!deliveryIndexPromise) {
    deliveryIndexPromise = deliveries.createIndex(
      { recipientUserId: 1, notificationId: 1, channel: 1 },
      { unique: true }
    ).then(() => undefined).catch((error: unknown) => {
      deliveryIndexPromise = null;
      throw error;
    });
  }
  await deliveryIndexPromise;

  const now = new Date();
  const staleSendingThreshold = new Date(now.getTime() - 5 * 60 * 1000);
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const channel of channels) {
        const existing = await deliveries.findOne(
          { recipientUserId: user.id, notificationId, channel },
          { session }
        );
        if (existing?.status === "sent") {
          throw new HttpError(409, `${channel} notification was already sent`);
        }
        if (
          existing?.status === "sending" &&
          existing.updatedAt > staleSendingThreshold
        ) {
          throw new HttpError(409, `${channel} delivery was already sent or is in progress`);
        }
        if (existing) {
          if (existing.attempts >= 3) {
            throw new HttpError(429, `${channel} delivery retry limit has been reached`);
          }
          const retried = await deliveries.updateOne(
            {
              _id: existing._id,
              status: existing.status,
              updatedAt: existing.updatedAt,
            },
            {
              $set: { status: "sending", updatedAt: now },
              $unset: { lastError: "" },
              $inc: { attempts: 1 },
            },
            { session }
          );
          if (retried.matchedCount !== 1) {
            throw new HttpError(409, `${channel} delivery is already being retried`);
          }
        } else {
          await deliveries.insertOne(
            {
              recipientUserId: user.id,
              notificationId,
              channel,
              status: "sending",
              attempts: 1,
              createdAt: now,
              updatedAt: now,
            },
            { session }
          );
        }
      }
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new HttpError(409, "Notification delivery is already in progress");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return Promise.all(channels.map(async (channel) => {
    try {
      const delivery = await sendCommunication(
        channel,
        deliveryContact,
        notification.title,
        channel === "sms" ? smsMessage : notification.message
      );
      const updated = await deliveries.updateOne(
        { recipientUserId: user.id, notificationId, channel, status: "sending" },
        {
          $set: {
            status: "sent",
            providerMessageId: delivery.providerMessageId,
            updatedAt: new Date(),
          },
        }
      );
      if (updated.matchedCount !== 1) {
        throw new Error("Delivery status could not be persisted");
      }
      return {
        channel,
        status: "sent" as const,
        providerMessageId: delivery.providerMessageId,
      };
    } catch (error) {
      const message = error instanceof HttpError
        ? error.message
        : "Messaging provider delivery failed";
      const updated = await deliveries.updateOne(
        { recipientUserId: user.id, notificationId, channel, status: "sending" },
        { $set: { status: "failed", lastError: message, updatedAt: new Date() } }
      );
      if (updated.matchedCount !== 1) {
        throw new Error("Failed notification delivery status could not be persisted");
      }
      return { channel, status: "failed" as const, error: message };
    }
  }));
};

const isUserStillAuthorized = async (user: AuthenticatedUser): Promise<boolean> => {
  const db = await connectDB();
  const currentUser = await db.collection<{
    _id?: string | ObjectId;
    id?: string;
    role?: string;
    organizationId?: string | null;
    isActive?: boolean;
  }>("user").findOne({
    $or: [{ id: user.id }, { _id: user.id }],
  });
  if (
    !currentUser ||
    currentUser.isActive === false ||
    currentUser.role !== user.role ||
    (currentUser.organizationId ?? null) !== user.organizationId
  ) {
    return false;
  }
  if (user.role === "relief_organization" && user.organizationId) {
    const organization = await db.collection<{
      _id: string;
      status: string;
    }>("organizations").findOne({ _id: user.organizationId });
    if (organization && organization.status !== "active") return false;
  }
  return true;
};

export const streamNotifications = async (
  user: AuthenticatedUser,
  res: import("express").Response
) => {
  const seen = new Set<string>();
  const sendNew = (notifications: NotificationDocument[]) => {
    const newItems = notifications.filter((notification) => {
      if (seen.has(notification.notificationId)) return false;
      seen.add(notification.notificationId);
      return true;
    });
    if (newItems.length && !res.destroyed) {
      res.write(`event: notifications\ndata: ${JSON.stringify(newItems)}\n\n`);
    }
  };

  const db = await connectDB();
  const changeStream = db.watch(
    [{
      $match: {
        "ns.coll": {
          $in: [
            "incidents",
            "emergencyRequests",
            "resources",
            "resourceAllocations",
            "shelters",
            "tasks",
            "teams",
            "volunteers",
            "organizations",
            "user",
          ],
        },
        operationType: { $in: ["insert", "update", "replace", "delete"] },
      },
    }],
    { fullDocument: "updateLookup", maxAwaitTimeMS: 1000 }
  );
  let initialNotifications: NotificationDocument[];
  try {
    initialNotifications = await getNotifications(user);
  } catch (error) {
    await changeStream.close();
    throw error;
  }

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  sendNew(initialNotifications);
  changeStream.on("change", (change) => {
    void (async () => {
      if (!("ns" in change) || !("operationType" in change)) return;
      if (!("coll" in change.ns)) return;
      const collection = change.ns.coll;

      if (collection === "user") {
        const document = "fullDocument" in change ? change.fullDocument : undefined;
        const documentKey = "documentKey" in change ? change.documentKey._id : undefined;
        const changedUserId = String(document?.id ?? document?._id ?? documentKey);
        if (changedUserId === user.id && !(await isUserStillAuthorized(user))) {
          await changeStream.close();
          res.end();
        }
        return;
      }

      if (!(await isUserStillAuthorized(user))) {
        await changeStream.close();
        res.end();
        return;
      }

      const event = {
        collection,
        operation: change.operationType,
        occurredAt: new Date().toISOString(),
      };
      if (!res.destroyed) {
        res.write(`event: operations_changed\ndata: ${JSON.stringify(event)}\n\n`);
      }
      sendNew(await getNotifications(user));
    })().catch((error: unknown) => {
      console.error("Notification change stream failed:", error);
      if (!res.destroyed) {
        res.write("event: error\ndata: {\"message\":\"Notification stream is unavailable\"}\n\n");
        res.end();
      }
      void changeStream.close().catch((closeError: unknown) => {
        console.error("Notification change stream close failed:", closeError);
      });
    });
  });
  changeStream.on("error", (error: unknown) => {
    console.error("Notification change stream error:", error);
    if (!res.destroyed) {
      res.write("event: error\ndata: {\"message\":\"Notification stream is unavailable\"}\n\n");
      res.end();
    }
    void changeStream.close().catch((closeError: unknown) => {
      console.error("Notification change stream close failed:", closeError);
    });
  });
  res.on("close", () => {
    void changeStream.close().catch((error: unknown) => {
      console.error("Notification change stream close failed:", error);
    });
  });
};
