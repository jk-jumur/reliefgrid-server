import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import type { VolunteerDocument } from "../volunteers/volunteer.model.js";
import { matchAvailableVolunteers } from "./volunteer-matching.js";

const profile = (
  skills: string[],
  availability: VolunteerDocument["availability"] = "available"
): VolunteerDocument => ({
  _id: new ObjectId(),
  userId: new ObjectId().toHexString(),
  fullName: "Test Volunteer",
  email: "volunteer@example.test",
  phone: "+10000000000",
  skills,
  availability,
  history: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

test("matches available volunteers to cover required skills and headcount", () => {
  const medicalAndRescue = profile(["Medical", "Rescue"]);
  const medical = profile(["medical"]);
  const unavailableRescue = profile(["rescue"], "unavailable");

  const result = matchAvailableVolunteers(
    [medicalAndRescue, medical, unavailableRescue],
    ["medical", "rescue"],
    2
  );

  assert.deepEqual(result.volunteers, [medicalAndRescue, medical]);
  assert.deepEqual(result.matchedSkills, ["medical", "rescue"]);
});

test("rejects a match when available volunteers cannot cover every required skill", () => {
  const available = profile(["medical"]);
  const unavailable = profile(["rescue"], "unavailable");

  assert.throws(
    () => matchAvailableVolunteers([available, unavailable], ["medical", "rescue"], 1),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 409
  );
});

test("rejects headcount that exceeds the skill-matched available pool", () => {
  const available = profile(["medical"]);

  assert.throws(
    () => matchAvailableVolunteers([available], ["medical"], 2),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 409
  );
});
