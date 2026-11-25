import assert from "node:assert/strict";
import { test } from "node:test";

import { HttpError } from "../../utils/http-error.js";
import {
  assertCommunicationProvidersConfigured,
  sendCommunication,
} from "./communication-provider.js";

const providerEnvironmentKeys = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
] as const;

const withIsolatedEnvironment = async (
  run: () => Promise<void>
): Promise<void> => {
  const saved = new Map(
    providerEnvironmentKeys.map((key) => [key, process.env[key]])
  );
  const originalFetch = globalThis.fetch;
  for (const key of providerEnvironmentKeys) delete process.env[key];
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  }
};

test("outbound email fails explicitly when provider credentials are absent", async () => {
  await withIsolatedEnvironment(async () => {
    assert.throws(
      () => assertCommunicationProvidersConfigured(["email"]),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 503 &&
        error.message.includes("RESEND_API_KEY")
    );
  });
});

test("email delivery uses Resend and returns its provider message ID", async () => {
  await withIsolatedEnvironment(async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "alerts@example.test";
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    let capturedBody = "";
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ id: "email-test-id" }), { status: 200 });
    };

    const result = await sendCommunication(
      "email",
      { email: "citizen@example.test" },
      "Request update",
      "Your request is now assigned."
    );
    assert.equal(capturedUrl, "https://api.resend.com/emails");
    assert.equal(capturedHeaders.get("authorization"), "Bearer test-resend-key");
    assert.deepEqual(JSON.parse(capturedBody), {
      from: "alerts@example.test",
      to: ["citizen@example.test"],
      subject: "Request update",
      text: "Your request is now assigned.",
    });
    assert.equal(result.providerMessageId, "email-test-id");
  });
});

test("SMS delivery uses Twilio form encoding and rejects provider failures", async () => {
  await withIsolatedEnvironment(async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC-test";
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    let capturedHeaders = new Headers();
    let capturedBody = "";
    globalThis.fetch = async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ sid: "sms-test-id" }), { status: 201 });
    };

    const result = await sendCommunication(
      "sms",
      { email: "citizen@example.test", phone: "+15551112222" },
      "ignored for SMS",
      "Request delivered"
    );
    assert.equal(
      capturedHeaders.get("authorization"),
      `Basic ${Buffer.from("AC-test:test-token").toString("base64")}`
    );
    assert.deepEqual(Object.fromEntries(new URLSearchParams(capturedBody)), {
      To: "+15551112222",
      From: "+15550000000",
      Body: "Request delivered",
    });
    assert.equal(result.providerMessageId, "sms-test-id");

    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(
      sendCommunication(
        "sms",
        { email: "citizen@example.test", phone: "+15551112222" },
        "ignored",
        "Request delivered"
      ),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 502 &&
        error.message.includes("HTTP 503")
    );
  });
});
