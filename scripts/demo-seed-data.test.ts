import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_DATA_COUNTS,
  generateDemoDataset,
  type DemoIdentity,
} from "./demo-seed-data.js";

const createIdentity = (id: string): DemoIdentity => ({
  id,
  name: `Demo User ${id}`,
  email: `${id}@example.com`,
});

test("generates the required sample counts with valid relationships", () => {
  const generatedAt = new Date("2026-01-01T12:00:00.000Z");
  const organizationUsers = Array.from(
    { length: DEMO_DATA_COUNTS.organizations },
    (_, index) => createIdentity(`organization-user-${index}`)
  );
  const volunteerUsers = Array.from(
    { length: DEMO_DATA_COUNTS.volunteers },
    (_, index) => createIdentity(`volunteer-user-${index}`)
  );
  const dataset = generateDemoDataset({
    seed: 1307,
    generatedAt,
    systemAdmin: createIdentity("admin"),
    coordinator: createIdentity("coordinator"),
    citizen: createIdentity("citizen"),
    shelterManager: createIdentity("shelter-manager"),
    organizationIds: Array.from(
      { length: DEMO_DATA_COUNTS.organizations },
      (_, index) => `demo-organization-${index}`
    ),
    organizationUsers,
    volunteerUsers,
  });

  assert.equal(dataset.organizations.length, DEMO_DATA_COUNTS.organizations);
  assert.equal(dataset.incidents.length, DEMO_DATA_COUNTS.incidents);
  assert.equal(dataset.emergencyRequests.length, DEMO_DATA_COUNTS.emergencyRequests);
  assert.equal(dataset.shelters.length, DEMO_DATA_COUNTS.shelters);
  assert.equal(dataset.volunteers.length, DEMO_DATA_COUNTS.volunteers);
  assert.equal(dataset.resources.length, DEMO_DATA_COUNTS.resources);
  assert.ok(Object.values(dataset).flat().every((record) =>
    record.dataOrigin === "generated_demo"
  ));

  const organizationIds = new Set(dataset.organizations.map(({ _id }) => _id));
  const incidentIds = new Set(
    dataset.incidents.map(({ _id }) => _id?.toHexString())
  );
  assert.ok(dataset.resources.every(({ organizationId }) => organizationIds.has(organizationId)));
  assert.ok(dataset.volunteers.every(({ userId }) =>
    volunteerUsers.some(({ id }) => id === userId)
  ));
  assert.ok(dataset.emergencyRequests.every(({ incidentId }) =>
    incidentId === null || incidentIds.has(incidentId)
  ));
  assert.ok(dataset.shelters.every(({ availableCapacity, currentOccupancy, totalCapacity }) =>
    availableCapacity === totalCapacity - currentOccupancy
  ));
  assert.ok(dataset.resources.every(({ availableQuantity, allocatedQuantity, distributedQuantity }) =>
    availableQuantity >= 0 && allocatedQuantity === 0 && distributedQuantity === 0
  ));
});
