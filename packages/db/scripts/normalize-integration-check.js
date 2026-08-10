import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeImportBatch } from "../src/normalize.js";

const prisma = new PrismaClient();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const dec = (v) => new Prisma.Decimal(v);

const buildPayload = ({ sourceActivityId, distanceM = 10000, elapsedTimeS = 3600, elevGainM = 100, sport = "run" }) => {
  const occurredAt = "2026-02-01T08:00:00.000Z";
  const endedAt = "2026-02-01T09:00:00.000Z";
  const avgPaceSecPerKm = (elapsedTimeS / (distanceM / 1000)).toFixed(3);
  return {
    sourceActivityId,
    occurredAt,
    endedAt,
    elapsedTimeS,
    distanceM,
    avgPaceSecPerKm: Number(avgPaceSecPerKm),
    elevationGainM: elevGainM,
    elevationLossM: elevGainM,
    sport,
  };
};

const seedRows = async (importId, athleteId) => {
  const rows = [
    {
      importId,
      athleteId,
      sourceType: "gpx",
      sourceActivityId: "src-dup-1",
      payloadJson: buildPayload({ sourceActivityId: "src-dup-1", distanceM: 10000 }),
    },
    {
      importId,
      athleteId,
      sourceType: "gpx",
      sourceActivityId: "src-dup-1",
      payloadJson: buildPayload({ sourceActivityId: "src-dup-1", distanceM: 10000 }),
    },
    {
      importId,
      athleteId,
      sourceType: "csv",
      sourceActivityId: null,
      payloadJson: buildPayload({ sourceActivityId: null, distanceM: 12000 }),
    },
    {
      importId,
      athleteId,
      sourceType: "csv",
      sourceActivityId: null,
      payloadJson: buildPayload({ sourceActivityId: null, distanceM: 12000 }),
    },
    {
      importId,
      athleteId,
      sourceType: "tcx",
      sourceActivityId: "src-invalid",
      payloadJson: { sourceActivityId: "src-invalid", occurredAt: "2026-02-01T08:00:00.000Z" },
    },
  ];

  for (const row of rows) {
    await prisma.stagingActivity.create({ data: row });
  }
};

const run = async () => {
  const stamp = Date.now().toString();
  const athleteId = `ath_db3_${stamp}`;
  const importRow = await prisma.import.create({
    data: {
      athleteId,
      status: "uploaded",
    },
  });

  try {
    await seedRows(importRow.id, athleteId);

    const batchOne = await normalizeImportBatch(
      {
        importId: importRow.id,
        batchSize: 3,
      },
      prisma,
    );

    assert(batchOne.normalizedCount >= 2, "Batch one should normalize at least two rows");
    assert(batchOne.nextCursor, "Batch one should provide a nextCursor");

    const batchTwo = await normalizeImportBatch(
      {
        importId: importRow.id,
        cursor: batchOne.nextCursor,
        batchSize: 3,
      },
      prisma,
    );

    const batchThree = await normalizeImportBatch(
      {
        importId: importRow.id,
        cursor: batchTwo.nextCursor,
        batchSize: 3,
      },
      prisma,
    );

    const statuses = await prisma.stagingActivity.groupBy({
      by: ["status"],
      where: { importId: importRow.id },
      _count: true,
    });

    const statusMap = Object.fromEntries(statuses.map((s) => [s.status, s._count]));
    assert((statusMap.normalized ?? 0) >= 2, "Expected normalized rows");
    assert((statusMap.duplicate ?? 0) >= 2, "Expected duplicate rows");
    assert((statusMap.error ?? 0) >= 1, "Expected at least one error row");

    const importAfter = await prisma.import.findUnique({ where: { id: importRow.id } });
    assert(importAfter, "Import row missing");
    assert(importAfter.status === "completed", "Import should be marked completed");
    assert(importAfter.hasMore === false, "Import hasMore should be false when completed");
    assert(importAfter.normalizedCount >= 2, "Import normalizedCount should be incremented");
    assert(importAfter.duplicateCount >= 2, "Import duplicateCount should be incremented");
    assert(importAfter.skippedCount >= 2, "Import skippedCount should be incremented");
    assert(importAfter.errorCount >= 1, "Import errorCount should be incremented");

    const activities = await prisma.activity.findMany({ where: { athleteId } });
    const sourceDupCount = activities.filter((a) => a.sourceActivityId === "src-dup-1").length;
    assert(sourceDupCount === 1, "sourceActivityId dedupe should keep a single activity");

    const hashGroupCount = activities.filter((a) => a.sourceActivityId === null).length;
    assert(hashGroupCount === 1, "dedupeHash fallback should keep a single activity");

    // Re-run from same cursor must not create duplicates.
    const beforeRerunCount = activities.length;
    await normalizeImportBatch(
      {
        importId: importRow.id,
        cursor: batchThree.nextCursor,
        batchSize: 10,
      },
      prisma,
    );
    const afterRerunCount = await prisma.activity.count({ where: { athleteId } });
    assert(beforeRerunCount === afterRerunCount, "Rerun from same cursor should not create extra activities");

    console.log("DB3_NORMALIZE_INTEGRATION=PASS");
  } finally {
    await prisma.activitySplitKm.deleteMany({ where: { athleteId } });
    await prisma.routeSignature.deleteMany({ where: { athleteId } });
    await prisma.weeklyFeature.deleteMany({ where: { athleteId } });
    await prisma.activity.deleteMany({ where: { athleteId } });
    await prisma.stagingActivity.deleteMany({ where: { importId: importRow.id } });
    await prisma.rawFile.deleteMany({ where: { importId: importRow.id } });
    await prisma.import.deleteMany({ where: { id: importRow.id } });
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
