import assert from "node:assert/strict";
import test from "node:test";

import { resolveIncidentCoordinatorAssignment } from "./incident.assignment.js";

test("coordinators are assigned to incidents they report by default", () => {
  assert.equal(
    resolveIncidentCoordinatorAssignment({
      id: "coordinator-1",
      role: "emergency_coordinator",
    }),
    "coordinator-1",
  );
});

test("system administrators can select an incident coordinator", () => {
  assert.equal(
    resolveIncidentCoordinatorAssignment(
      { id: "admin-1", role: "system_admin" },
      "coordinator-2",
    ),
    "coordinator-2",
  );
});

test("other roles cannot assign an incident coordinator", () => {
  assert.throws(
    () =>
      resolveIncidentCoordinatorAssignment(
        { id: "citizen-1", role: "citizen" },
        "coordinator-2",
      ),
    { statusCode: 403 },
  );
});
