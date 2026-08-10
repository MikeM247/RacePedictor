import type {
  DashboardFetchResult,
  DriverContribution,
  FeatureTrendPoint,
  ImportProgressStatus,
  PredictionSummary,
} from "../../../packages/core/src/contracts";

export type PredictionSummaryView = Pick<
  PredictionSummary,
  "targetDistanceM" | "predictedTimeS" | "predictedPaceSecPerKm" | "bandLowS" | "bandHighS" | "modelVersion"
>;

export type DriverContributionView = Pick<
  DriverContribution,
  "key" | "label" | "contributionPct"
>;

export type FeatureTrendPointView = Pick<
  FeatureTrendPoint,
  "weekStart" | "featureKey" | "value" | "unit"
>;

export type ImportProgressView = {
  status: ImportProgressStatus;
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
  fetchStatus: DashboardFetchResult["fetchStatus"];
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
  predictionOptions: PredictionSummaryView[];
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
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const min = Math.floor((rounded % 3600) / 60);
  const sec = Math.round(rounded % 60)
    .toString()
    .padStart(2, "0");
  return hours > 0 ? `${hours}:${min.toString().padStart(2, "0")}:${sec}` : `${min}:${sec}`;
};

const formatPace = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, "0")}/km`;

export const predictionDistanceLabel = (targetDistanceM?: number) => {
  if (!targetDistanceM) return "Predicted finish";
  if (Math.abs(targetDistanceM - 5000) < 10) return "5 km";
  if (Math.abs(targetDistanceM - 10000) < 10) return "10 km";
  if (Math.abs(targetDistanceM - 21097.5) < 10) return "Half marathon";
  if (Math.abs(targetDistanceM - 42195) < 10) return "Marathon";
  return `${(targetDistanceM / 1000).toFixed(1)} km`;
};

export const toSummaryKpis = (predictionSummary: PredictionSummaryView): DashboardKpiView[] => {
  const targetTitle = `${predictionDistanceLabel(predictionSummary.targetDistanceM)} estimate`;
  return [
    {
      key: "predicted-finish",
      title: targetTitle,
      value: formatDuration(predictionSummary.predictedTimeS),
    },
    {
      key: "predicted-pace",
      title: "Predicted pace",
      value: formatPace(predictionSummary.predictedPaceSecPerKm),
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
    targetDistanceM: undefined,
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
      predictionOptions: [],
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
  const predictionOptions = data.predictionOptions;
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
    targetDistanceM: typeof predictionSummary.targetDistanceM === "number"
      ? predictionSummary.targetDistanceM
      : undefined,
    predictedTimeS: readNumber(predictionSummary.predictedTimeS, "predictionSummary.predictedTimeS"),
    predictedPaceSecPerKm: readNumber(predictionSummary.predictedPaceSecPerKm, "predictionSummary.predictedPaceSecPerKm"),
    bandLowS: readNumber(predictionSummary.bandLowS, "predictionSummary.bandLowS"),
    bandHighS: readNumber(predictionSummary.bandHighS, "predictionSummary.bandHighS"),
    modelVersion: readString(predictionSummary.modelVersion, "predictionSummary.modelVersion"),
  };
  const normalizedPredictionOptions = Array.isArray(predictionOptions)
    ? predictionOptions.map((candidate, index) => {
        if (!isRecord(candidate)) {
          throw new Error(`Invalid prediction option at index ${index}`);
        }
        return {
          targetDistanceM: readNumber(candidate.targetDistanceM, `predictionOptions[${index}].targetDistanceM`),
          predictedTimeS: readNumber(candidate.predictedTimeS, `predictionOptions[${index}].predictedTimeS`),
          predictedPaceSecPerKm: readNumber(candidate.predictedPaceSecPerKm, `predictionOptions[${index}].predictedPaceSecPerKm`),
          bandLowS: readNumber(candidate.bandLowS, `predictionOptions[${index}].bandLowS`),
          bandHighS: readNumber(candidate.bandHighS, `predictionOptions[${index}].bandHighS`),
          modelVersion: readString(candidate.modelVersion, `predictionOptions[${index}].modelVersion`),
        };
      })
    : [normalizedPredictionSummary];

  return {
    fetchStatus,
    errorMessage,
    staleInfo,
    uiState,
    predictionSummary: normalizedPredictionSummary,
    predictionOptions: normalizedPredictionOptions,
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
