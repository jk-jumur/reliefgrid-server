import assert from "node:assert/strict";
import test from "node:test";

import { calculateEmergencyRequestPriority } from "./emergency-request.priority.js";

const now = new Date("2026-11-25T00:00:00.000Z");

test("critical urgency and medical requests receive critical priority", () => {
  const result = calculateEmergencyRequestPriority(
    "critical",
    "medical_supply",
    10,
    "medium",
    now,
    now
  );

  assert.equal(result.priority, "critical");
});

test("affected population and location risk increase request priority", () => {
  const lowImpact = calculateEmergencyRequestPriority(
    "low",
    "food",
    10,
    "low",
    now,
    now
  );
  const highImpact = calculateEmergencyRequestPriority(
    "low",
    "food",
    1000,
    "high",
    now,
    now
  );

  assert.equal(lowImpact.priority, "low");
  assert.equal(highImpact.priority, "medium");
});

test("request priority can rise while it remains unresolved", () => {
  const submittedAt = new Date(now.getTime() - 18 * 60 * 60 * 1000);
  const result = calculateEmergencyRequestPriority(
    "medium",
    "food",
    0,
    "low",
    submittedAt,
    now
  );

  assert.equal(result.priority, "medium");
});
