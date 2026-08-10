export const DEFAULT_ACTIVITY_IMPORT_MAX_BYTES: number;
export const GPX_PARSER_VERSION: string;

export class ActivityImportError extends Error {
  constructor(
    message: string,
    options?: { code?: string; httpStatus?: number; details?: unknown[] },
  );
  code: string;
  httpStatus: number;
  details: unknown[];
}

export type ImportCoverage = Record<string, number | boolean>;

export type LocalActivityImportResult = {
  sourceType: "csv" | "gpx";
  reused: boolean;
  checksumSha256: string;
  rowCount: number;
  databasePath: string;
  import: {
    importId: string;
    status: "uploaded" | "normalizing" | "completed" | "failed";
    stagedCount: number;
    normalizedCount: number;
    duplicateCount: number;
    rejectedCount: number;
    errorCount: number;
  };
  totalNormalizedActivities: number;
  coverage: ImportCoverage;
  parseWarnings: string[];
};

export function importLocalActivityFile(options: {
  sourcePath: string;
  contentType?: string;
  vaultPath: string;
  databasePath: string;
  athleteId?: string;
  utcOffset?: string;
  maxBytes?: number;
}): Promise<LocalActivityImportResult>;

export function parseGpxActivity(
  sourceBuffer: Uint8Array,
  options?: { athleteId?: string; utcOffset?: string },
): {
  activity: Record<string, unknown>;
  routeSummary: Record<string, unknown>;
  coverage: ImportCoverage;
};

export function haversineDistanceM(
  left: { lat: number; lon: number },
  right: { lat: number; lon: number },
): number;
