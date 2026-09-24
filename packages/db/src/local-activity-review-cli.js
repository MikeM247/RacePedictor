import process from "node:process";
import { defaultLocalDatabasePath } from "./local-activities.js";
import { runLocalActivityReview } from "./local-activity-review-worker.js";

const result = await runLocalActivityReview({
  databasePath: process.env.RACEPREDICTOR_DATABASE_PATH || defaultLocalDatabasePath,
  athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
});
process.stdout.write(`${JSON.stringify(result)}\n`);
