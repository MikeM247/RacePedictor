import { PrismaClient } from "@prisma/client";
import { COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID, SEED_ATHLETE_ID } from "./seed.js";

type GateIssue = {
  path: string;
  message: string;
};

type GateCheck = {
  name: string;
  critical: boolean;
  passed: boolean;
  issues: GateIssue[];
};

type GateArea = {
  area: string;
  passed: boolean;
  checks: GateCheck[];
  sample?: Record<string, string | number | boolean | null>;
};

export type IntegrityGateSummary = {
  passed: boolean;
  areas: GateArea[];
  criticalFailures: Array<{
    area: string;
    check: string;
    path: string;
    message: string;
  }>;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const pass = (name: string, critical = true): GateCheck => ({
  name,
  critical,
  passed: true,
  issues: [],
});

const fail = (name: string, message: string, path = "<root>", critical = true): GateCheck => ({
  name,
  critical,
  passed: false,
  issues: [{ path, message }],
});

const detectSplitMonotonicViolations = (
  splits: Array<{ id: string; splitIndex: number; startOffsetS: number; endOffsetS: number }>,
) => {
  const issues: GateIssue[] = [];
  let previousEnd = -1;
  for (const split of splits) {
    if (split.startOffsetS > split.endOffsetS) {
      issues.push({
        path: `split:${split.id}`,
        message: "startOffsetS must be less than or equal to endOffsetS",
      });
    }
    if (split.startOffsetS < previousEnd) {
      issues.push({
        path: `split:${split.id}`,
        message: "split offsets must be non-decreasing by split order",
      });
    }
    previousEnd = Math.max(previousEnd, split.endOffsetS);
  }
  return issues;
};

export async function runIntegrityAndOperationalGate(
  prisma = new PrismaClient(),
): Promise<IntegrityGateSummary> {
  const [activities, splits, weeklyFeatures, completedImport, inProgressImport, inProgressStagedCount] =
    await prisma.$transaction([
      prisma.activity.findMany({
        where: { athleteId: SEED_ATHLETE_ID },
        select: {
          id: true,
          dedupeHash: true,
          occurredAt: true,
          endedAt: true,
          distanceM: true,
          elapsedTimeS: true,
          elevationGainM: true,
          elevationLossM: true,
        },
      }),
      prisma.activitySplitKm.findMany({
        where: { athleteId: SEED_ATHLETE_ID },
        orderBy: [{ activityId: "asc" }, { splitIndex: "asc" }],
        select: {
          id: true,
          activityId: true,
          splitIndex: true,
          startOffsetS: true,
          endOffsetS: true,
          durationS: true,
          distanceM: true,
          paceSecPerKm: true,
          elevGainM: true,
          elevLossM: true,
        },
      }),
      prisma.weeklyFeature.findMany({
        where: { athleteId: SEED_ATHLETE_ID },
        orderBy: { weekStartDate: "asc" },
        select: {
          id: true,
          weekStartDate: true,
          weekEndDate: true,
          runCount: true,
          totalDistanceM: true,
          totalElapsedTimeS: true,
          totalElevationGainM: true,
          easyDistanceM: true,
          moderateDistanceM: true,
          hardDistanceM: true,
          dataCompleteness: true,
        },
      }),
      prisma.import.findUnique({ where: { id: COMPLETED_IMPORT_ID } }),
      prisma.import.findUnique({ where: { id: IN_PROGRESS_IMPORT_ID } }),
      prisma.stagingActivity.count({
        where: { importId: IN_PROGRESS_IMPORT_ID, status: "staged" },
      }),
    ]);

  const integrityChecks: GateCheck[] = [];
  const operationalChecks: GateCheck[] = [];
  const reconciliationChecks: GateCheck[] = [];
  const selfTestChecks: GateCheck[] = [];

  // Uniqueness safety check.
  const dedupeMap = new Map<string, number>();
  for (const activity of activities) {
    const key = `${SEED_ATHLETE_ID}:${activity.dedupeHash}`;
    dedupeMap.set(key, (dedupeMap.get(key) ?? 0) + 1);
  }
  const duplicateDedupe = [...dedupeMap.entries()].filter(([, count]) => count > 1);
  if (duplicateDedupe.length > 0) {
    integrityChecks.push(
      fail(
        "No duplicate (athleteId, dedupeHash)",
        `Found ${duplicateDedupe.length} duplicate dedupe keys`,
      ),
    );
  } else {
    integrityChecks.push(pass("No duplicate (athleteId, dedupeHash)"));
  }

  // Non-negative metrics checks.
  const invalidActivityMetrics = activities.filter((activity) => {
    const distance = toNumber(activity.distanceM);
    const elapsed = toNumber(activity.elapsedTimeS);
    const elevGain = toNumber(activity.elevationGainM);
    const elevLoss = toNumber(activity.elevationLossM);
    return (
      distance === null ||
      elapsed === null ||
      elevGain === null ||
      elevLoss === null ||
      distance < 0 ||
      elapsed < 0 ||
      elevGain < 0 ||
      elevLoss < 0
    );
  });
  integrityChecks.push(
    invalidActivityMetrics.length === 0
      ? pass("Activity metrics are non-negative")
      : fail(
          "Activity metrics are non-negative",
          `Found ${invalidActivityMetrics.length} activities with negative/invalid metrics`,
        ),
  );

  const invalidSplitMetrics = splits.filter((split) => {
    const distance = toNumber(split.distanceM);
    const pace = toNumber(split.paceSecPerKm);
    const elevGain = toNumber(split.elevGainM);
    const elevLoss = toNumber(split.elevLossM);
    return (
      distance === null ||
      pace === null ||
      elevGain === null ||
      elevLoss === null ||
      split.durationS < 0 ||
      split.startOffsetS < 0 ||
      split.endOffsetS < 0 ||
      distance < 0 ||
      pace < 0 ||
      elevGain < 0 ||
      elevLoss < 0
    );
  });
  integrityChecks.push(
    invalidSplitMetrics.length === 0
      ? pass("Split metrics are non-negative")
      : fail(
          "Split metrics are non-negative",
          `Found ${invalidSplitMetrics.length} splits with negative/invalid metrics`,
        ),
  );

  const invalidWeeklyMetrics = weeklyFeatures.filter((feature) => {
    const fields = [
      toNumber(feature.totalDistanceM),
      toNumber(feature.totalElapsedTimeS),
      toNumber(feature.totalElevationGainM),
      toNumber(feature.easyDistanceM),
      toNumber(feature.moderateDistanceM),
      toNumber(feature.hardDistanceM),
      toNumber(feature.dataCompleteness),
    ];
    return fields.some((value) => value === null || value < 0);
  });
  integrityChecks.push(
    invalidWeeklyMetrics.length === 0
      ? pass("Weekly metrics are non-negative")
      : fail(
          "Weekly metrics are non-negative",
          `Found ${invalidWeeklyMetrics.length} weekly rows with negative/invalid metrics`,
        ),
  );

  // Temporal correctness.
  const invalidActivityTime = activities.filter((activity) => activity.occurredAt > activity.endedAt);
  integrityChecks.push(
    invalidActivityTime.length === 0
      ? pass("Activity temporal ordering is valid")
      : fail(
          "Activity temporal ordering is valid",
          `Found ${invalidActivityTime.length} activities where occurredAt > endedAt`,
        ),
  );

  const invalidWeeklyTime = weeklyFeatures.filter(
    (feature) => feature.weekStartDate > feature.weekEndDate,
  );
  integrityChecks.push(
    invalidWeeklyTime.length === 0
      ? pass("Weekly temporal windows are valid")
      : fail(
          "Weekly temporal windows are valid",
          `Found ${invalidWeeklyTime.length} weekly rows where weekStartDate > weekEndDate`,
        ),
  );

  // Split monotonicity.
  const splitByActivity = new Map<string, Array<(typeof splits)[number]>>();
  for (const split of splits) {
    if (!splitByActivity.has(split.activityId)) splitByActivity.set(split.activityId, []);
    splitByActivity.get(split.activityId)!.push(split);
  }
  const splitMonotonicIssues: GateIssue[] = [];
  for (const [activityId, activitySplits] of splitByActivity.entries()) {
    const violations = detectSplitMonotonicViolations(activitySplits);
    for (const issue of violations) {
      splitMonotonicIssues.push({
        path: `${activityId}:${issue.path}`,
        message: issue.message,
      });
    }
  }
  if (splitMonotonicIssues.length === 0) {
    integrityChecks.push(pass("Split monotonicity is valid"));
  } else {
    integrityChecks.push({
      name: "Split monotonicity is valid",
      critical: true,
      passed: false,
      issues: splitMonotonicIssues,
    });
  }

  // Weekly reconciliation sanity.
  const activityWindows = activities.map((activity) => ({
    occurredAt: activity.occurredAt,
    distanceM: toNumber(activity.distanceM) ?? 0,
    elapsedTimeS: toNumber(activity.elapsedTimeS) ?? 0,
    elevationGainM: toNumber(activity.elevationGainM) ?? 0,
  }));

  const sampledWeeks = weeklyFeatures.slice(0, 3);
  const sampledFailures: GateIssue[] = [];
  for (const week of sampledWeeks) {
    const inWeek = activityWindows.filter(
      (activity) =>
        activity.occurredAt.getTime() >= week.weekStartDate.getTime() &&
        activity.occurredAt.getTime() <= week.weekEndDate.getTime(),
    );
    const runCount = inWeek.length;
    const totalDistance = inWeek.reduce((sum, row) => sum + row.distanceM, 0);
    const totalElapsed = inWeek.reduce((sum, row) => sum + row.elapsedTimeS, 0);
    const totalElevationGain = inWeek.reduce((sum, row) => sum + row.elevationGainM, 0);

    const distanceDiff = Math.abs(totalDistance - (toNumber(week.totalDistanceM) ?? 0));
    const elapsedDiff = Math.abs(totalElapsed - (toNumber(week.totalElapsedTimeS) ?? 0));
    const elevationDiff = Math.abs(
      totalElevationGain - (toNumber(week.totalElevationGainM) ?? 0),
    );
    if (runCount !== week.runCount || distanceDiff > 1 || elapsedDiff > 1 || elevationDiff > 1) {
      sampledFailures.push({
        path: `week:${week.id}`,
        message:
          "Weekly reconciliation mismatch (runCount/totalDistanceM/totalElapsedTimeS/totalElevationGainM)",
      });
    }
  }
  if (sampledFailures.length === 0) {
    reconciliationChecks.push(pass("Weekly totals reconcile with source activities"));
  } else {
    reconciliationChecks.push({
      name: "Weekly totals reconcile with source activities",
      critical: true,
      passed: false,
      issues: sampledFailures,
    });
  }

  // Operational/readiness checks.
  if (!completedImport) {
    operationalChecks.push(fail("Completed import exists", `Missing ${COMPLETED_IMPORT_ID}`));
  } else {
    operationalChecks.push(pass("Completed import exists"));
    operationalChecks.push(
      completedImport.status === "completed"
        ? pass("Completed import status is completed")
        : fail("Completed import status is completed", `Got status ${completedImport.status}`),
    );
    operationalChecks.push(
      completedImport.hasMore === false
        ? pass("Completed import hasMore=false")
        : fail("Completed import hasMore=false", `Got hasMore=${String(completedImport.hasMore)}`),
    );
    operationalChecks.push(
      completedImport.normalizedCount > 0
        ? pass("Completed import normalizedCount is > 0")
        : fail(
            "Completed import normalizedCount is > 0",
            `Got normalizedCount=${completedImport.normalizedCount}`,
          ),
    );
  }

  if (!inProgressImport) {
    operationalChecks.push(fail("In-progress import exists", `Missing ${IN_PROGRESS_IMPORT_ID}`));
  } else {
    operationalChecks.push(pass("In-progress import exists"));
    operationalChecks.push(
      inProgressImport.status === "uploaded" || inProgressImport.status === "normalizing"
        ? pass("In-progress import status is non-terminal")
        : fail(
            "In-progress import status is non-terminal",
            `Got status ${inProgressImport.status}`,
          ),
    );
    operationalChecks.push(
      inProgressImport.hasMore === true
        ? pass("In-progress import hasMore=true")
        : fail("In-progress import hasMore=true", `Got hasMore=${String(inProgressImport.hasMore)}`),
    );
    operationalChecks.push(
      inProgressStagedCount > 0
        ? pass("In-progress import retains staged rows")
        : fail("In-progress import retains staged rows", "Expected at least one staged row"),
    );
  }

  // Controlled negative assertion path for validator behavior.
  const syntheticViolation = detectSplitMonotonicViolations([
    { id: "s1", splitIndex: 1, startOffsetS: 0, endOffsetS: 300 },
    { id: "s2", splitIndex: 2, startOffsetS: 250, endOffsetS: 550 },
  ]);
  selfTestChecks.push(
    syntheticViolation.length > 0
      ? pass("Self-test: split monotonic detector catches synthetic violation", false)
      : fail(
          "Self-test: split monotonic detector catches synthetic violation",
          "Expected synthetic monotonic violation to be detected",
          "<self-test>",
          true,
        ),
  );

  const areas: GateArea[] = [
    {
      area: "integrity",
      passed: integrityChecks.every((check) => check.passed),
      checks: integrityChecks,
      sample: {
        activityCount: activities.length,
        splitCount: splits.length,
        weeklyFeatureCount: weeklyFeatures.length,
      },
    },
    {
      area: "reconciliation",
      passed: reconciliationChecks.every((check) => check.passed),
      checks: reconciliationChecks,
      sample: {
        sampledWeeks: sampledWeeks.length,
      },
    },
    {
      area: "operational",
      passed: operationalChecks.every((check) => check.passed),
      checks: operationalChecks,
      sample: {
        completedImportId: completedImport?.id ?? null,
        inProgressImportId: inProgressImport?.id ?? null,
        inProgressStagedCount,
      },
    },
    {
      area: "self_test",
      passed: selfTestChecks.every((check) => check.passed),
      checks: selfTestChecks,
    },
  ];

  const criticalFailures: IntegrityGateSummary["criticalFailures"] = [];
  for (const area of areas) {
    for (const check of area.checks) {
      if (!check.passed && check.critical) {
        for (const issue of check.issues) {
          criticalFailures.push({
            area: area.area,
            check: check.name,
            path: issue.path,
            message: issue.message,
          });
        }
      }
    }
  }

  return {
    passed: criticalFailures.length === 0,
    areas,
    criticalFailures,
  };
}
