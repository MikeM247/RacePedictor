import path from "node:path";
import { fileURLToPath } from "node:url";
import { importGarminCsv } from "./local-garmin-pipeline.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const parseArgs = (argv) => {
  const args = {
    athleteId: "athlete_001",
    utcOffset: "+02:00",
    stateDirectory: path.join(repositoryRoot, ".local", "racepredictor"),
    vaultPath: path.join(repositoryRoot, ".local", "obsidian-vault"),
    sourcePath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--source") args.sourcePath = value;
    else if (argument === "--vault") args.vaultPath = value;
    else if (argument === "--state-dir") args.stateDirectory = value;
    else if (argument === "--athlete") args.athleteId = value;
    else if (argument === "--utc-offset") args.utcOffset = value;
    else continue;
    index += 1;
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sourcePath) {
    throw new Error("Missing --source <Garmin Activities.csv>");
  }
  const result = await importGarminCsv({
    sourcePath: path.resolve(args.sourcePath),
    vaultPath: path.resolve(args.vaultPath),
    databasePath: path.join(path.resolve(args.stateDirectory), "racepredictor.sqlite"),
    athleteId: args.athleteId,
    utcOffset: args.utcOffset,
  });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Garmin import failed");
  process.exit(1);
});
