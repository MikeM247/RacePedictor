import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalCoachingService } from "../lib/local-coaching-service.ts";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const outputPath = path.resolve(repositoryRoot, argument("--output") ?? ".local/racepredictor/approved-plan-current.json");
const service = new LocalCoachingService();
try {
  const activePlan = service.getActivePlan();
  if (!activePlan) throw new Error("No active approved plan is available to export");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(activePlan, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
} finally {
  service.close();
}
