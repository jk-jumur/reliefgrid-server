import type {
  IncidentLocationRisk,
  IncidentPriority,
  IncidentSeverity,
} from "./incident.model.js";

const severityScores: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 20,
  high: 45,
  critical: 70,
};

const locationRiskScores: Record<IncidentLocationRisk, number> = {
  low: 0,
  medium: 5,
  high: 10,
  critical: 15,
};

const getPriorityForScore = (score: number): IncidentPriority => {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
};

export const calculateIncidentPriority = (
  severity: IncidentSeverity,
  affectedPopulation: number,
  locationRisk: IncidentLocationRisk,
  reportedAt: Date,
  now: Date
): { score: number; priority: IncidentPriority } => {
  const populationScore =
    affectedPopulation >= 1000 ? 15 :
      affectedPopulation >= 200 ? 10 :
        affectedPopulation >= 50 ? 5 : 0;
  const hoursSinceReported = Math.max(
    0,
    (now.getTime() - reportedAt.getTime()) / (60 * 60 * 1000)
  );
  const timeScore = Math.min(20, Math.floor(hoursSinceReported / 6) * 2);
  const score =
    severityScores[severity] +
    populationScore +
    locationRiskScores[locationRisk] +
    timeScore;

  return {
    score,
    priority: getPriorityForScore(score),
  };
};
