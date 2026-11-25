export interface DemandForecast {
  averageDailyRequests: number;
  trendPerDay: number;
  projectedRequests: number;
  daysWithDemand: number;
}

export const forecastDailyDemand = (
  dailyCounts: number[],
  horizonDays: number
): DemandForecast => {
  if (dailyCounts.length === 0 || horizonDays < 1) {
    throw new Error("Demand forecast requires observations and a positive horizon");
  }

  const sampleCount = dailyCounts.length;
  const meanX = (sampleCount - 1) / 2;
  const meanY = dailyCounts.reduce((sum, count) => sum + count, 0) / sampleCount;
  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const xDifference = index - meanX;
    covariance += xDifference * (dailyCounts[index] - meanY);
    variance += xDifference ** 2;
  }

  const trendPerDay = variance === 0 ? 0 : covariance / variance;
  const intercept = meanY - trendPerDay * meanX;
  const projectedRequests = Array.from({ length: horizonDays }, (_, offset) =>
    Math.max(0, intercept + trendPerDay * (sampleCount + offset))
  ).reduce((sum, demand) => sum + demand, 0);

  return {
    averageDailyRequests: Number(meanY.toFixed(2)),
    trendPerDay: Number(trendPerDay.toFixed(3)),
    projectedRequests: Math.round(projectedRequests),
    daysWithDemand: dailyCounts.filter((count) => count > 0).length,
  };
};
