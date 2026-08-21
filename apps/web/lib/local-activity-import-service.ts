import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ActivityImportError,
  DEFAULT_ACTIVITY_IMPORT_MAX_BYTES,
  importLocalActivityFile,
} from "../../../packages/db/src/local-activity-file-importer.js";
import { runLocalAnalytics } from "../../../packages/db/src/local-analytics.js";

export { ActivityImportError };

const workingDirectory = process.cwd();
const repositoryRoot = path.basename(workingDirectory) === "web" && path.basename(path.dirname(workingDirectory)) === "apps"
  ? path.resolve(workingDirectory, "../..")
  : workingDirectory;

const positiveIntegerEnvironment = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ActivityImportError(`${name} must be a positive integer`);
  }
  return parsed;
};

export type ActivityUploadResponse = {
  importId: string;
  status: string;
  sourceType: "csv" | "gpx";
  reused: boolean;
  stagedCount: number;
  normalizedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  parseWarnings: string[];
  coverage: Record<string, number | boolean>;
  totalNormalizedActivities: number;
  analyticsRefreshed: boolean;
};

export async function importUploadedActivity(file: File): Promise<ActivityUploadResponse> {
  if (!file.name) throw new ActivityImportError("Uploaded activity file must have a filename");
  const maxBytes = positiveIntegerEnvironment("RACEPREDICTOR_IMPORT_MAX_BYTES", DEFAULT_ACTIVITY_IMPORT_MAX_BYTES);
  if (file.size === 0) throw new ActivityImportError("Activity import file is empty");
  if (file.size > maxBytes) {
    throw new ActivityImportError(`Activity import exceeds the ${maxBytes} byte limit`, { httpStatus: 413 });
  }

  const databasePath = path.resolve(
    process.env.RACEPREDICTOR_DATABASE_PATH
      ?? path.join(repositoryRoot, ".local", "racepredictor", "racepredictor.sqlite"),
  );
  const vaultPath = path.resolve(
    process.env.RACEPREDICTOR_VAULT_PATH
      ?? path.join(repositoryRoot, ".local", "obsidian-vault"),
  );
  const snapshotPath = path.resolve(
    process.env.RACEPREDICTOR_DASHBOARD_SNAPSHOT
      ?? path.join(repositoryRoot, ".local", "racepredictor", "dashboard-overview.json"),
  );
  const athleteId = process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001";
  const utcOffset = process.env.RACEPREDICTOR_UTC_OFFSET || "+02:00";
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "racepredictor-upload-"));
  const safeFilename = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, "-");
  const temporaryPath = path.join(temporaryDirectory, safeFilename || "activity.upload");

  try {
    await writeFile(temporaryPath, new Uint8Array(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    const imported = await importLocalActivityFile({
      sourcePath: temporaryPath,
      contentType: file.type,
      vaultPath,
      databasePath,
      athleteId,
      utcOffset,
      maxBytes,
    });
    const parseWarnings = [...imported.parseWarnings];
    let analyticsRefreshed = false;
    try {
      await runLocalAnalytics({ databasePath, snapshotPath, athleteId });
      analyticsRefreshed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown analytics error";
      parseWarnings.push(`Activity imported, but analytics snapshot was not refreshed: ${message}`);
    }
    return {
      importId: imported.import.importId,
      status: imported.import.status,
      sourceType: imported.sourceType,
      reused: imported.reused,
      stagedCount: imported.import.stagedCount,
      normalizedCount: imported.import.normalizedCount,
      duplicateCount: imported.import.duplicateCount,
      rejectedCount: imported.import.rejectedCount,
      parseWarnings,
      coverage: imported.coverage,
      totalNormalizedActivities: imported.totalNormalizedActivities,
      analyticsRefreshed,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
