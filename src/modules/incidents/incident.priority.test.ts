import assert from "node:assert/strict";
import test from "node:test";

import { calculateIncidentPriority } from "./incident.priority.js";

const now = new Date("2026-11-25T00:00:00.000Z");

test("critical severity is assigned critical priority", () => {
  const result = calculateIncidentPriority(
    "critical",
    10,
    "medium",
    now,
    now
  );

  assert.equal(result.priority, "critical");
});

test("affected population and location risk increase calculated priority", () => {
  const lowImpact = calculateIncidentPriority(
    "low",
    10,
    "low",
    now,
    now
  );
  const highImpact = calculateIncidentPriority(
    "low",
    1000,
    "high",
    now,
    now
  );

  assert.equal(lowImpact.priority, "low");
  assert.equal(highImpact.priority, "medium");
  assert.ok(highImpact.score > lowImpact.score);
});

test("priority increases as an incident remains unresolved", () => {
  const reportedAt = new Date(now.getTime() - 18 * 60 * 60 * 1000);
  const result = calculateIncidentPriority(
    "medium",
    0,
    "low",
    reportedAt,
    now
  );

  assert.equal(result.priority, "medium");
});
