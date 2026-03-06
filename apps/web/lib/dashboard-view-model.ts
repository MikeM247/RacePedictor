export type PredictionSummaryView = {
  predictedTimeS: number;
  predictedPaceSecPerKm: number;
  bandLowS: number;
  bandHighS: number;
  modelVersion: string;
};

export type DriverContributionView = {
  key: string;
  label: string;
  contributionPct: number;
};

export type FeatureTrendPointView = {
  weekStart: string;
  featureKey: string;
  value: number;
  unit: string;
};

export type ImportProgressView = {
  status: "uploaded" | "normalizing" | "completed" | "failed";
  stagedCount: number;
  normalizedCount: number;
  duplicateCount: number;
  rejectedCount: number;
};

export type DashboardViewModel = {
  predictionSummary: PredictionSummaryView;
  driverContributions: DriverContributionView[];
  featureTrendPoints: FeatureTrendPointView[];
  importProgress: ImportProgressView;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readNumber = (value: unknown, fieldName: string): number => {
  if (typeof value !== "number") {
    throw new Error(`Expected number for ${fieldName}`);
  }
  return value;
};

const readString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Expected string for ${fieldName}`);
  }
  return value;
};

export const toDashboardViewModel = (input: unknown): DashboardViewModel => {
  if (!isRecord(input)) {
    throw new Error("Dashboard payload must be an object");
  }

  const predictionSummary = input.predictionSummary;
  const driverContributions = input.driverContributions;
  const featureTrendPoints = input.featureTrendPoints;
  const importProgress = input.importProgress;

  if (!isRecord(predictionSummary) || !isRecord(importProgress)) {
    throw new Error("Dashboard payload has invalid nested objects");
  }

  if (!Array.isArray(driverContributions) || !Array.isArray(featureTrendPoints)) {
    throw new Error("Dashboard payload has invalid list fields");
  }

  const normalizedContributions: DriverContributionView[] = driverContributions.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid driver contribution entry");
    }

    return {
      key: readString(item.key, "driverContributions.key"),
      label: readString(item.label, "driverContributions.label"),
      contributionPct: readNumber(item.contributionPct, "driverContributions.contributionPct"),
    };
  });

  const normalizedTrendPoints: FeatureTrendPointView[] = featureTrendPoints.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid feature trend point entry");
    }

    return {
      weekStart: readString(item.weekStart, "featureTrendPoints.weekStart"),
      featureKey: readString(item.featureKey, "featureTrendPoints.featureKey"),
      value: readNumber(item.value, "featureTrendPoints.value"),
      unit: readString(item.unit, "featureTrendPoints.unit"),
    };
  });

  const status = readString(importProgress.status, "importProgress.status");
  if (status !== "uploaded" && status !== "normalizing" && status !== "completed" && status !== "failed") {
    throw new Error("Invalid import progress status");
  }

  return {
    predictionSummary: {
      predictedTimeS: readNumber(predictionSummary.predictedTimeS, "predictionSummary.predictedTimeS"),
      predictedPaceSecPerKm: readNumber(predictionSummary.predictedPaceSecPerKm, "predictionSummary.predictedPaceSecPerKm"),
      bandLowS: readNumber(predictionSummary.bandLowS, "predictionSummary.bandLowS"),
      bandHighS: readNumber(predictionSummary.bandHighS, "predictionSummary.bandHighS"),
      modelVersion: readString(predictionSummary.modelVersion, "predictionSummary.modelVersion"),
    },
    driverContributions: normalizedContributions,
    featureTrendPoints: normalizedTrendPoints,
    importProgress: {
      status,
      stagedCount: readNumber(importProgress.stagedCount, "importProgress.stagedCount"),
      normalizedCount: readNumber(importProgress.normalizedCount, "importProgress.normalizedCount"),
      duplicateCount: readNumber(importProgress.duplicateCount, "importProgress.duplicateCount"),
      rejectedCount: readNumber(importProgress.rejectedCount, "importProgress.rejectedCount"),
    },
  };
};
