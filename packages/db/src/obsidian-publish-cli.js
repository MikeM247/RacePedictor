import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishObsidianArtifacts } from "./obsidian-publisher.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const parseArgs = (argv) => {
  const args = {
    athleteId: "athlete_001",
    databasePath: path.join(repositoryRoot, ".local", "racepredictor", "racepredictor.sqlite"),
    vaultPath: path.join(repositoryRoot, ".local", "obsidian-vault"),
    reviewWeeks: 12,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--database") args.databasePath = value;
    else if (argument === "--vault") args.vaultPath = value;
    else if (argument === "--athlete") args.athleteId = value;
    else if (argument === "--review-weeks") args.reviewWeeks = Number(value);
    else continue;
    index += 1;
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const result = await publishObsidianArtifacts({
    databasePath: path.resolve(args.databasePath),
    vaultPath: path.resolve(args.vaultPath),
    athleteId: args.athleteId,
    reviewWeeks: args.reviewWeeks,
  });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Obsidian publication failed");
  process.exit(1);
});
