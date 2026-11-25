import type {
  EmergencyRequestPriority,
  EmergencyRequestType,
  EmergencyRequestLocationRisk,
} from "./emergency-request.model.js";

const urgencyScores: Record<EmergencyRequestPriority, number> = {
  low: 0,
  medium: 20,
  high: 45,
  critical: 70,
};

const locationRiskScores: Record<EmergencyRequestLocationRisk, number> = {
  low: 0,
  medium: 5,
  high: 10,
  critical: 15,
};

const getPriorityForScore = (score: number): EmergencyRequestPriority => {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
};

export const calculateEmergencyRequestPriority = (
  urgency: EmergencyRequestPriority,
  requestType: EmergencyRequestType,
  affectedPeople: number,
  locationRisk: EmergencyRequestLocationRisk,
  submittedAt: Date,
  now: Date
): { score: number; priority: EmergencyRequestPriority } => {
  const peopleScore =
    affectedPeople >= 1000 ? 15 :
      affectedPeople >= 200 ? 10 :
        affectedPeople >= 50 ? 5 : 0;
  const typeScore =
    requestType === "medical_supply" || requestType === "rescue" ? 10 : 0;
  const hoursSinceSubmitted = Math.max(
    0,
    (now.getTime() - submittedAt.getTime()) / (60 * 60 * 1000)
  );
  const timeScore = Math.min(20, Math.floor(hoursSinceSubmitted / 6) * 2);
  const score =
    urgencyScores[urgency] +
    peopleScore +
    typeScore +
    locationRiskScores[locationRisk] +
    timeScore;

  return {
    score,
    priority: getPriorityForScore(score),
  };
};
