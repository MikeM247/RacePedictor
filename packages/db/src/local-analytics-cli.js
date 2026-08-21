import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TARGET_DISTANCE_M, runLocalAnalytics } from "./local-analytics.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const parseArgs = (argv) => {
  const args = {
    athleteId: "athlete_001",
    databasePath: path.join(repositoryRoot, ".local", "racepredictor", "racepredictor.sqlite"),
    snapshotPath: path.join(repositoryRoot, ".local", "racepredictor", "dashboard-overview.json"),
    targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--database") args.databasePath = value;
    else if (argument === "--snapshot") args.snapshotPath = value;
    else if (argument === "--athlete") args.athleteId = value;
    else if (argument === "--target-km") args.targetDistanceM = Number(value) * 1000;
    else continue;
    index += 1;
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.targetDistanceM) || args.targetDistanceM <= 0) {
    throw new Error("--target-km must be a positive number");
  }
  const result = await runLocalAnalytics({
    databasePath: path.resolve(args.databasePath),
    snapshotPath: path.resolve(args.snapshotPath),
    athleteId: args.athleteId,
    targetDistanceM: args.targetDistanceM,
  });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local analytics failed");
  process.exit(1);
});
