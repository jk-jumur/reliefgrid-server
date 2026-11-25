import assert from "node:assert/strict";
import test from "node:test";

import { createEmergencyReportPdf } from "./emergency-report.pdf.js";

test("creates a valid PDF report from live analytics-shaped data", async () => {
  const report = await createEmergencyReportPdf({
    generatedAt: "2026-11-25T00:00:00.000Z",
    periodDays: 30,
    summary: {
      activeIncidents: 4,
      totalAffectedPeople: 120,
      pendingRequests: 7,
      availableResourceUnits: 300,
      activeShelters: 2,
      availableVolunteers: 8,
      assignedVolunteers: 3,
      unavailableVolunteers: 1,
      resourcesDistributed: 45,
      averageResponseTimeMinutes: 25,
    },
    incidentCategories: [{ category: "flood", count: 4 }],
    emergencyRequestTrends: [{ date: "2026-11-24", count: 3 }],
  });

  assert.equal(report.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(report.byteLength > 500);
});
