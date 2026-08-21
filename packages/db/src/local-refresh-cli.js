import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TARGET_DISTANCE_M, runLocalAnalytics } from "./local-analytics.js";
import { importGarminCsv } from "./local-garmin-pipeline.js";
import { publishObsidianArtifacts } from "./obsidian-publisher.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const parseArgs = (argv) => {
  const args = {
    sourcePath: null,
    athleteId: "athlete_001",
    utcOffset: "+02:00",
    stateDirectory: path.join(repositoryRoot, ".local", "racepredictor"),
    vaultPath: path.join(repositoryRoot, ".local", "obsidian-vault"),
    targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
    reviewWeeks: 12,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--source") args.sourcePath = value;
    else if (argument === "--vault") args.vaultPath = value;
    else if (argument === "--state-dir") args.stateDirectory = value;
    else if (argument === "--athlete") args.athleteId = value;
    else if (argument === "--utc-offset") args.utcOffset = value;
    else if (argument === "--target-km") args.targetDistanceM = Number(value) * 1000;
    else if (argument === "--review-weeks") args.reviewWeeks = Number(value);
    else continue;
    index += 1;
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sourcePath) throw new Error("Missing --source <Garmin Activities.csv>");
  const databasePath = path.join(path.resolve(args.stateDirectory), "racepredictor.sqlite");
  const snapshotPath = path.join(path.resolve(args.stateDirectory), "dashboard-overview.json");
  const vaultPath = path.resolve(args.vaultPath);
  const imported = await importGarminCsv({
    sourcePath: path.resolve(args.sourcePath),
    vaultPath,
    databasePath,
    athleteId: args.athleteId,
    utcOffset: args.utcOffset,
  });
  const analytics = await runLocalAnalytics({
    databasePath,
    snapshotPath,
    athleteId: args.athleteId,
    targetDistanceM: args.targetDistanceM,
  });
  const obsidian = await publishObsidianArtifacts({
    databasePath,
    vaultPath,
    athleteId: args.athleteId,
    reviewWeeks: args.reviewWeeks,
  });
  console.log(JSON.stringify({ imported, analytics, obsidian }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local refresh failed");
  process.exit(1);
});
