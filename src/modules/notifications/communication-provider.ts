import { HttpError } from "../../utils/http-error.js";

export type CommunicationChannel = "email" | "sms";

export interface DeliveryContact {
  email: string;
  phone?: string;
}

export interface ProviderDelivery {
  providerMessageId: string | null;
}

const requireEnvironment = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new HttpError(503, `Outbound messaging is not configured (${key} is missing)`);
  }
  return value;
};

export const assertCommunicationProvidersConfigured = (
  channels: CommunicationChannel[]
): void => {
  if (channels.includes("email")) {
    requireEnvironment("RESEND_API_KEY");
    requireEnvironment("RESEND_FROM_EMAIL");
  }
  if (channels.includes("sms")) {
    requireEnvironment("TWILIO_ACCOUNT_SID");
    requireEnvironment("TWILIO_AUTH_TOKEN");
    requireEnvironment("TWILIO_FROM_NUMBER");
  }
};

const sendEmail = async (
  contact: DeliveryContact,
  subject: string,
  message: string
): Promise<ProviderDelivery> => {
  const apiKey = requireEnvironment("RESEND_API_KEY");
  const from = requireEnvironment("RESEND_FROM_EMAIL");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [contact.email],
      subject,
      text: message,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new HttpError(502, `Email provider rejected delivery (HTTP ${response.status})`);
  }
  const result = await response.json() as { id?: unknown };
  return {
    providerMessageId: typeof result.id === "string" ? result.id : null,
  };
};

const sendSms = async (
  contact: DeliveryContact,
  message: string
): Promise<ProviderDelivery> => {
  if (!contact.phone) throw new HttpError(422, "The account has no phone number for SMS");
  const accountSid = requireEnvironment("TWILIO_ACCOUNT_SID");
  const authToken = requireEnvironment("TWILIO_AUTH_TOKEN");
  const from = requireEnvironment("TWILIO_FROM_NUMBER");
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: contact.phone,
        From: from,
        Body: message,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) {
    throw new HttpError(502, `SMS provider rejected delivery (HTTP ${response.status})`);
  }
  const result = await response.json() as { sid?: unknown };
  return {
    providerMessageId: typeof result.sid === "string" ? result.sid : null,
  };
};

export const sendCommunication = async (
  channel: CommunicationChannel,
  contact: DeliveryContact,
  subject: string,
  message: string
): Promise<ProviderDelivery> => {
  if (channel === "email") return sendEmail(contact, subject, message);
  return sendSms(contact, message);
};
