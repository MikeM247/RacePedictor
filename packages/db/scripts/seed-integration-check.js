import { PrismaClient } from "@prisma/client";
import {
  COMPLETED_RAW_FILE_ID,
  COMPLETED_IMPORT_ID,
  IN_PROGRESS_IMPORT_ID,
  SEED_ATHLETE_ID,
  SEED_MAX_NORMALIZED_ACTIVITIES,
  SEED_MAX_STAGED_ROWS,
  SEED_MIN_NORMALIZED_ACTIVITIES,
  SEED_MIN_SPLIT_COVERAGE,
  SEED_MIN_STAGED_ROWS,
  SEED_ROUTE_COVERAGE_MAX,
  SEED_ROUTE_COVERAGE_MIN,
  seedDatabase,
} from "../src/seed.js";

const prisma = new PrismaClient();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const range = (value, min, max, label) => {
  assert(value >= min && value <= max, `${label} expected ${min}-${max}, got ${value}`);
};

const getWeekSpan = async () => {
  const weeks = await prisma.weeklyFeature.findMany({
    where: { athleteId: SEED_ATHLETE_ID },
    orderBy: { weekStartDate: "asc" },
    select: { weekStartDate: true },
  });

  const uniqueDays = [...new Set(weeks.map((w) => w.weekStartDate.getTime()))].sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const day of uniqueDays) {
    if (previous !== null && day - previous === 7 * 24 * 60 * 60 * 1000) {
      current += 1;
    } else {
      current = 1;
    }
    if (current > longest) longest = current;
    previous = day;
  }

  return { count: uniqueDays.length, longestConsecutive: longest };
};

const getSnapshot = async () => {
  const [imports, stagingRows, normalizedActivities, splitActivities, routeCount, statuses] = await prisma.$transaction([
    prisma.import.findMany({
      where: { id: { in: [COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID] } },
      select: { id: true, status: true, hasMore: true },
    }),
    prisma.stagingActivity.count({ where: { importId: { in: [COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID] } } }),
    prisma.activity.count({ where: { athleteId: SEED_ATHLETE_ID, sourceFileId: COMPLETED_RAW_FILE_ID } }),
    prisma.activity.findMany({
      where: {
        athleteId: SEED_ATHLETE_ID,
        sourceFileId: COMPLETED_RAW_FILE_ID,
        splits: { some: {} },
      },
      select: { id: true },
    }),
    prisma.routeSignature.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        activity: { sourceFileId: COMPLETED_RAW_FILE_ID },
      },
    }),
    prisma.stagingActivity.groupBy({
      by: ["status"],
      where: { importId: { in: [COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID] } },
      _count: true,
    }),
  ]);

  const statusMap = Object.fromEntries(statuses.map((s) => [s.status, s._count]));
  const weeks = await getWeekSpan();

  return {
    imports,
    stagingRows,
    normalizedActivities,
    splitCoverage: normalizedActivities === 0 ? 0 : splitActivities.length / normalizedActivities,
    routeCoverage: normalizedActivities === 0 ? 0 : routeCount / normalizedActivities,
    statusMap,
    weeks,
  };
};

const run = async () => {
  await seedDatabase(prisma);
  const first = await getSnapshot();

  assert(first.imports.length === 2, `Expected 2 seed imports, got ${first.imports.length}`);
  const completed = first.imports.find((i) => i.id === COMPLETED_IMPORT_ID);
  const inProgress = first.imports.find((i) => i.id === IN_PROGRESS_IMPORT_ID);
  assert(completed?.status === "completed", "Completed seed import should be completed");
  assert(inProgress?.status === "normalizing" || inProgress?.status === "uploaded", "In-progress seed import should remain in-progress");

  range(first.stagingRows, SEED_MIN_STAGED_ROWS, SEED_MAX_STAGED_ROWS, "Staging rows");
  range(first.normalizedActivities, SEED_MIN_NORMALIZED_ACTIVITIES, SEED_MAX_NORMALIZED_ACTIVITIES, "Normalized activities");
  assert((first.statusMap.staged ?? 0) > 0, "Expected staged rows to remain for in-progress import");
  assert((first.statusMap.normalized ?? 0) > 0, "Expected normalized rows");
  assert((first.statusMap.duplicate ?? 0) > 0, "Expected duplicate rows");
  assert((first.statusMap.error ?? 0) > 0, "Expected error rows");

  assert(first.splitCoverage >= SEED_MIN_SPLIT_COVERAGE, `Split coverage expected >= ${SEED_MIN_SPLIT_COVERAGE}, got ${first.splitCoverage}`);
  assert(first.routeCoverage >= SEED_ROUTE_COVERAGE_MIN, `Route coverage expected >= ${SEED_ROUTE_COVERAGE_MIN}, got ${first.routeCoverage}`);
  assert(first.routeCoverage <= SEED_ROUTE_COVERAGE_MAX, `Route coverage expected <= ${SEED_ROUTE_COVERAGE_MAX}, got ${first.routeCoverage}`);
  assert(first.weeks.count >= 12, `Expected >=12 weekly features, got ${first.weeks.count}`);
  assert(first.weeks.longestConsecutive >= 12, `Expected >=12 consecutive weeks, got ${first.weeks.longestConsecutive}`);

  await seedDatabase(prisma);
  const second = await getSnapshot();

  assert(second.stagingRows === first.stagingRows, "Reseed should not duplicate staging rows");
  assert(second.normalizedActivities === first.normalizedActivities, "Reseed should not duplicate normalized activities");
  assert(second.weeks.count === first.weeks.count, "Reseed should keep weekly feature count stable");

  console.log("DB4_SEED_INTEGRATION=PASS");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
