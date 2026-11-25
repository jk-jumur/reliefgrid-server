import assert from "node:assert/strict";
import test from "node:test";

import { calculateShelterCapacity } from "./shelter.capacity.js";

test("available shelter capacity is derived from occupancy", () => {
  assert.equal(calculateShelterCapacity(200, 75), 125);
});

test("full shelters have no available capacity", () => {
  assert.equal(calculateShelterCapacity(200, 200), 0);
});

test("occupancy cannot exceed total shelter capacity", () => {
  assert.throws(() => calculateShelterCapacity(200, 201), {
    message: "Shelter occupancy must be within its total capacity",
  });
});
