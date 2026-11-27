import type { ObjectId } from "mongodb";

export interface NotificationDocument {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  timestamp: Date;
  readAt: Date | null;
  deliveryStatus?: Partial<Record<
    "email" | "sms",
    {
      status: "sending" | "sent" | "failed";
      attempts: number;
      lastError?: string;
    }
  >>;
}

export interface NotificationReceiptDocument {
  _id?: ObjectId;
  recipientUserId: string;
  notificationId: string;
  readAt: Date;
}

export interface NotificationDeliveryDocument {
  _id?: ObjectId;
  recipientUserId: string;
  notificationId: string;
  channel: "email" | "sms";
  status: "sending" | "sent" | "failed";
  attempts: number;
  providerMessageId?: string | null;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}
