import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardFetchResult } from "../../../packages/core/src/contracts";
import type { DashboardDataSource } from "./dashboard-data-source";
import { toDashboardViewModel } from "./dashboard-view-model.ts";

const workingDirectory = process.cwd();
const repositoryRoot = path.basename(workingDirectory) === "web" && path.basename(path.dirname(workingDirectory)) === "apps"
  ? path.resolve(workingDirectory, "../..")
  : workingDirectory;

export const defaultDashboardSnapshotPath = path.join(
  repositoryRoot,
  ".local",
  "racepredictor",
  "dashboard-overview.json",
);

export class LocalDashboardDataSource implements DashboardDataSource {
  private readonly snapshotPath: string;

  constructor(
    snapshotPath = process.env.RACEPREDICTOR_DASHBOARD_SNAPSHOT
      ? path.resolve(process.env.RACEPREDICTOR_DASHBOARD_SNAPSHOT)
      : defaultDashboardSnapshotPath,
  ) {
    this.snapshotPath = snapshotPath;
  }

  async getDashboardData(): Promise<DashboardFetchResult> {
    try {
      const candidate: unknown = JSON.parse(await readFile(this.snapshotPath, "utf8"));
      toDashboardViewModel(candidate);
      return candidate as DashboardFetchResult;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown snapshot error";
      return {
        fetchStatus: "error",
        errorMessage: `Local training data is unavailable. Run the Garmin refresh and reload. (${detail})`,
        stale: { isStale: false },
      };
    }
  }
}
