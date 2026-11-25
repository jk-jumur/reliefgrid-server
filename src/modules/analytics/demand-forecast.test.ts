import assert from "node:assert/strict";
import test from "node:test";

import { forecastDailyDemand } from "./demand-forecast.js";

test("projects request demand using the observed daily trend", () => {
  const forecast = forecastDailyDemand([0, 1, 2, 3], 2);

  assert.equal(forecast.averageDailyRequests, 1.5);
  assert.equal(forecast.trendPerDay, 1);
  assert.equal(forecast.projectedRequests, 9);
  assert.equal(forecast.daysWithDemand, 3);
});

test("does not project negative demand when historical demand is falling", () => {
  const forecast = forecastDailyDemand([5, 3, 1, 0], 5);

  assert.equal(forecast.projectedRequests, 0);
});

test("returns a flat forecast for steady demand", () => {
  const forecast = forecastDailyDemand([2, 2, 2], 4);

  assert.equal(forecast.trendPerDay, 0);
  assert.equal(forecast.projectedRequests, 8);
});
