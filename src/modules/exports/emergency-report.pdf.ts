import PDFDocument from "pdfkit";

interface EmergencyReportOverview {
  generatedAt: string;
  periodDays: number;
  summary: {
    activeIncidents: number;
    totalAffectedPeople: number;
    pendingRequests: number;
    availableResourceUnits: number;
    activeShelters: number;
    availableVolunteers: number;
    assignedVolunteers: number;
    unavailableVolunteers: number;
    resourcesDistributed: number;
    averageResponseTimeMinutes: number | null;
  };
  incidentCategories: Array<{ category: string; count: number }>;
  emergencyRequestTrends: Array<{ date: string; count: number }>;
}

export const createEmergencyReportPdf = (
  overview: EmergencyReportOverview
): Promise<Buffer> => {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    info: {
      Title: "ReliefGrid Emergency Operations Report",
      Author: "ReliefGrid",
      Subject: `Operational summary for the last ${overview.periodDays} days`,
    },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    document.once("end", () => resolve(Buffer.concat(chunks)));
    document.once("error", reject);
  });

  const ensureSpace = (height: number) => {
    if (document.y + height > document.page.height - document.page.margins.bottom) {
      document.addPage();
    }
  };
  const addMetric = (label: string, value: string | number) => {
    ensureSpace(22);
    document.font("Helvetica-Bold").fontSize(10).text(label, { continued: true });
    document.font("Helvetica").text(`  ${value}`);
  };

  document.font("Helvetica-Bold").fontSize(22).text("ReliefGrid Emergency Operations Report");
  document.moveDown(0.35);
  document.font("Helvetica").fontSize(10)
    .text(`Reporting period: ${overview.periodDays} days`)
    .text(`Generated at: ${overview.generatedAt}`);
  document.moveDown();

  document.font("Helvetica-Bold").fontSize(14).text("Operational summary");
  document.moveDown(0.35);
  addMetric("Active incidents", overview.summary.activeIncidents);
  addMetric("Affected people", overview.summary.totalAffectedPeople);
  addMetric("Pending requests", overview.summary.pendingRequests);
  addMetric("Available resource units", overview.summary.availableResourceUnits);
  addMetric("Resources distributed", overview.summary.resourcesDistributed);
  addMetric("Active shelters", overview.summary.activeShelters);
  addMetric("Available volunteers", overview.summary.availableVolunteers);
  addMetric("Assigned volunteers", overview.summary.assignedVolunteers);
  addMetric("Unavailable volunteers", overview.summary.unavailableVolunteers);
  addMetric(
    "Average response time (minutes)",
    overview.summary.averageResponseTimeMinutes ?? "Not available"
  );
  document.moveDown();

  ensureSpace(40);
  document.font("Helvetica-Bold").fontSize(14).text("Active incident categories");
  document.moveDown(0.35);
  if (overview.incidentCategories.length === 0) {
    document.font("Helvetica").fontSize(10).text("No active incidents recorded.");
  } else {
    for (const item of overview.incidentCategories) {
      ensureSpace(16);
      document.font("Helvetica").fontSize(10)
        .text(`${item.category.replaceAll("_", " ")}: ${item.count}`);
    }
  }
  document.moveDown();

  ensureSpace(40);
  document.font("Helvetica-Bold").fontSize(14).text("Emergency request trend");
  document.moveDown(0.35);
  const recentTrend = overview.emergencyRequestTrends.slice(-14);
  if (recentTrend.length === 0) {
    document.font("Helvetica").fontSize(10).text("No emergency requests recorded in this period.");
  } else {
    for (const item of recentTrend) {
      ensureSpace(16);
      document.font("Helvetica").fontSize(10).text(`${item.date}: ${item.count} requests`);
    }
  }

  document.end();
  return finished;
};
