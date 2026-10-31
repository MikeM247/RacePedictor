import { readLocalImages, withLocalImages } from "../src/milestone-images.ts";
const file = process.env.RACEPREDICTOR_DATABASE_PATH;
if (!file) throw new Error("RACEPREDICTOR_DATABASE_PATH is required");
const athleteId = process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001";
const deleted = withLocalImages(file, (db) => {
  const record = readLocalImages(file, athleteId, db),
    referenced = new Set(
      [
        ...record.state.bindings,
        ...(record.remoteState?.bindings ?? []),
      ].flatMap((b) => (b.choice?.kind === "upload" ? [b.choice.id] : [])),
    );
  const old = db
    .prepare(
      "SELECT id FROM milestone_image_assets WHERE athlete_id=? AND created_at<?",
    )
    .all(athleteId, new Date(Date.now() - 30 * 86400000).toISOString());
  let count = 0;
  for (const asset of old) {
    if (!referenced.has(String(asset.id)))
      count += Number(
        db
          .prepare(
            "DELETE FROM milestone_image_assets WHERE athlete_id=? AND id=?",
          )
          .run(athleteId, asset.id).changes,
      );
  }
  return count;
});
process.stdout.write(
  `Removed ${deleted} unreferenced milestone image asset(s).\n`,
);
