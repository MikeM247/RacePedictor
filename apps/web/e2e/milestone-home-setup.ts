import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  saveLocalRaceHistory,
  readLocalRaceHistory,
} from "../lib/server/race-history.ts";
export default async function setup() {
  const file = process.env.MILESTONE_HOME_TEST_DB!;
  await mkdir(path.dirname(file), { recursive: true });
  if (!readLocalRaceHistory(file, "milestone_qa").some((x) => x.id === "pb"))
    saveLocalRaceHistory(file, "milestone_qa", {
      record: {
        id: "pb",
        title: "21 km PB",
        confirmedBy: "user",
        achievement: "personal_best",
      },
      expectedRevision: 0,
    });
}
