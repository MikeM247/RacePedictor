import path from "node:path";

const workingDirectory = process.cwd();
export const e2eRepositoryRoot = path.basename(workingDirectory) === "web"
  && path.basename(path.dirname(workingDirectory)) === "apps"
  ? path.resolve(workingDirectory, "../..")
  : workingDirectory;

const runId = process.env.RACEPREDICTOR_E2E_RUN_ID ?? `digital-coach-${Date.now()}-${process.pid}`;
process.env.RACEPREDICTOR_E2E_RUN_ID = runId;

export const e2eRoot = path.join(e2eRepositoryRoot, ".local", "e2e", runId);
export const e2eDatabasePath = path.join(e2eRoot, "state", "racepredictor.sqlite");
export const e2eSnapshotPath = path.join(e2eRoot, "state", "dashboard-overview.json");
export const e2eExchangePath = path.join(e2eRoot, "second-brain", "Coach Exchange");
export const e2eVaultPath = path.join(e2eRoot, "vault");
