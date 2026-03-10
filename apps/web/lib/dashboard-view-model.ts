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

export type DashboardKpiView = {
  key: "predicted-finish" | "predicted-pace" | "confidence-band";
  title: string;
  value: string;
};

export type DashboardViewModel = {
  fetchStatus: "success" | "empty" | "error";
  errorMessage: string | null;
  staleInfo: {
    isStale: boolean;
    staleReason: string | null;
    staleAtIso: string | null;
  };
  uiState: {
    showContent: boolean;
    showEmptyState: boolean;
    showErrorState: boolean;
    showStaleState: boolean;
  };
  predictionSummary: PredictionSummaryView;
  summaryKpis: DashboardKpiView[];
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

const readBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`Expected boolean for ${fieldName}`);
  }
  return value;
};

const formatDuration = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
};

const toSummaryKpis = (predictionSummary: PredictionSummaryView): DashboardKpiView[] => {
  return [
    {
      key: "predicted-finish",
      title: "Predicted finish",
      value: formatDuration(predictionSummary.predictedTimeS),
    },
    {
      key: "predicted-pace",
      title: "Predicted pace",
      value: `${Math.round(predictionSummary.predictedPaceSecPerKm)} sec/km`,
    },
    {
      key: "confidence-band",
      title: "Confidence band",
      value: `${formatDuration(predictionSummary.bandLowS)} - ${formatDuration(predictionSummary.bandHighS)}`,
    },
  ];
};

export const toDashboardViewModel = (input: unknown): DashboardViewModel => {
  if (!isRecord(input)) {
    throw new Error("Dashboard payload must be an object");
  }

  const fetchStatus = readString(input.fetchStatus, "fetchStatus");
  if (fetchStatus !== "success" && fetchStatus !== "empty" && fetchStatus !== "error") {
    throw new Error("Invalid dashboard fetch status");
  }

  const stale = input.stale;
  if (!isRecord(stale)) {
    throw new Error("Dashboard payload has invalid stale metadata");
  }

  const staleInfo = {
    isStale: readBoolean(stale.isStale, "stale.isStale"),
    staleReason: typeof stale.staleReason === "string" ? stale.staleReason : null,
    staleAtIso: typeof stale.staleAtIso === "string" ? stale.staleAtIso : null,
  };

  const uiState = {
    showContent: fetchStatus === "success",
    showEmptyState: fetchStatus === "empty",
    showErrorState: fetchStatus === "error",
    showStaleState: staleInfo.isStale,
  };

  const fallbackPredictionSummary: PredictionSummaryView = {
    predictedTimeS: 0,
    predictedPaceSecPerKm: 0,
    bandLowS: 0,
    bandHighS: 0,
    modelVersion: "Unavailable",
  };

  const fallbackImportProgress: ImportProgressView = {
    status: "uploaded",
    stagedCount: 0,
    normalizedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
  };

  const errorMessage =
    fetchStatus === "error" && typeof input.errorMessage === "string"
      ? input.errorMessage
      : fetchStatus === "error"
        ? "Dashboard data could not be loaded."
        : null;

  if (fetchStatus !== "success") {
    return {
      fetchStatus,
      errorMessage,
      staleInfo,
      uiState,
      predictionSummary: fallbackPredictionSummary,
      summaryKpis: toSummaryKpis(fallbackPredictionSummary),
      driverContributions: [],
      featureTrendPoints: [],
      importProgress: fallbackImportProgress,
    };
  }

  const data = input.data;
  if (!isRecord(data)) {
    throw new Error("Dashboard payload missing successful data");
  }

  const predictionSummary = data.predictionSummary;
  const driverContributions = data.driverContributions;
  const featureTrendPoints = data.featureTrendPoints;
  const importProgress = data.importProgress;

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

  const normalizedPredictionSummary: PredictionSummaryView = {
    predictedTimeS: readNumber(predictionSummary.predictedTimeS, "predictionSummary.predictedTimeS"),
    predictedPaceSecPerKm: readNumber(predictionSummary.predictedPaceSecPerKm, "predictionSummary.predictedPaceSecPerKm"),
    bandLowS: readNumber(predictionSummary.bandLowS, "predictionSummary.bandLowS"),
    bandHighS: readNumber(predictionSummary.bandHighS, "predictionSummary.bandHighS"),
    modelVersion: readString(predictionSummary.modelVersion, "predictionSummary.modelVersion"),
  };

  return {
    fetchStatus,
    errorMessage,
    staleInfo,
    uiState,
    predictionSummary: normalizedPredictionSummary,
    summaryKpis: toSummaryKpis(normalizedPredictionSummary),
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
