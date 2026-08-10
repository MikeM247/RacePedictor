import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_TARGET_DISTANCE_M = 21097.5;
export const STANDARD_TARGET_DISTANCES_M = [5000, 10000, DEFAULT_TARGET_DISTANCE_M, 42195];
export const LOCAL_MODEL_VERSION = "riegel-1.06-training-estimate-v1";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round = (value, precision = 2) => {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const mondayForLocalDate = (localOccurredAt) => {
  const dateString = localOccurredAt.slice(0, 10);
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
};

const median = (values) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
};

const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const standardDeviation = (values) => {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const createAnalyticsSchema = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS weekly_features (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      week_end_date TEXT NOT NULL,
      run_count INTEGER NOT NULL,
      total_distance_m REAL NOT NULL,
      total_elapsed_time_s INTEGER NOT NULL,
      total_elevation_gain_m REAL NOT NULL,
      long_run_distance_m REAL NOT NULL,
      longest_run_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
      easy_distance_m REAL NOT NULL,
      moderate_distance_m REAL NOT NULL,
      hard_distance_m REAL NOT NULL,
      avg_pace_sec_per_km REAL,
      avg_hr_bpm INTEGER,
      strain_score REAL,
      monotony_score REAL,
      consistency_score REAL,
      data_completeness REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (athlete_id, week_start_date)
    );
    CREATE INDEX IF NOT EXISTS weekly_features_athlete_week_idx
      ON weekly_features (athlete_id, week_start_date DESC);
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      target_distance_m REAL NOT NULL,
      predicted_time_s INTEGER NOT NULL,
      predicted_pace_sec_per_km REAL NOT NULL,
      band_low_s INTEGER NOT NULL,
      band_high_s INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      basis_activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
      generated_at TEXT NOT NULL,
      UNIQUE (athlete_id, target_distance_m, model_version)
    );
  `);
};

const classifyDistance = (activity, fallbackMedianPace) => {
  if (activity.aerobicTrainingEffect !== null) {
    if (activity.aerobicTrainingEffect < 3) return "easy";
    if (activity.aerobicTrainingEffect < 4) return "moderate";
    return "hard";
  }
  if (fallbackMedianPace === null) return "moderate";
  if (activity.avgPaceSecPerKm >= fallbackMedianPace * 1.08) return "easy";
  if (activity.avgPaceSecPerKm <= fallbackMedianPace * 0.92) return "hard";
  return "moderate";
};

const computeWeeklyRows = (activities) => {
  if (activities.length === 0) return [];
  const fallbackMedianPace = median(activities.map((activity) => activity.avgPaceSecPerKm));
  const groups = new Map();
  for (const activity of activities) {
    const weekStart = mondayForLocalDate(activity.localOccurredAt);
    if (!groups.has(weekStart)) groups.set(weekStart, []);
    groups.get(weekStart).push(activity);
  }

  const firstWeek = mondayForLocalDate(activities[0].localOccurredAt);
  const lastWeek = mondayForLocalDate(activities[activities.length - 1].localOccurredAt);
  const rows = [];
  for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = addDays(weekStart, 7)) {
    const weekActivities = groups.get(weekStart) ?? [];
    const dailyDistanceKm = [0, 0, 0, 0, 0, 0, 0];
    let totalDistanceM = 0;
    let totalElapsedTimeS = 0;
    let totalElevationGainM = 0;
    let easyDistanceM = 0;
    let moderateDistanceM = 0;
    let hardDistanceM = 0;
    let paceNumerator = 0;
    let hrNumerator = 0;
    let hrDistanceM = 0;
    let strainScore = 0;
    let longestRun = null;

    for (const activity of weekActivities) {
      totalDistanceM += activity.distanceM;
      totalElapsedTimeS += activity.elapsedTimeS;
      totalElevationGainM += activity.elevationGainM;
      paceNumerator += activity.avgPaceSecPerKm * activity.distanceM;
      if (activity.avgHrBpm !== null) {
        hrNumerator += activity.avgHrBpm * activity.distanceM;
        hrDistanceM += activity.distanceM;
      }
      if (!longestRun || activity.distanceM > longestRun.distanceM) longestRun = activity;
      const intensity = classifyDistance(activity, fallbackMedianPace);
      if (intensity === "easy") easyDistanceM += activity.distanceM;
      else if (intensity === "hard") hardDistanceM += activity.distanceM;
      else moderateDistanceM += activity.distanceM;
      strainScore += (activity.elapsedTimeS / 3600) * (activity.aerobicTrainingEffect ?? 2.5) * 100;

      const activityDate = new Date(`${activity.localOccurredAt.slice(0, 10)}T00:00:00.000Z`);
      const monday = new Date(`${weekStart}T00:00:00.000Z`);
      const dayIndex = Math.round((activityDate.getTime() - monday.getTime()) / 86400000);
      if (dayIndex >= 0 && dayIndex < 7) dailyDistanceKm[dayIndex] += activity.distanceM / 1000;
    }

    const dailyMean = mean(dailyDistanceKm);
    const dailyDeviation = standardDeviation(dailyDistanceKm);
    rows.push({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      runCount: weekActivities.length,
      totalDistanceM,
      totalElapsedTimeS,
      totalElevationGainM,
      longRunDistanceM: longestRun?.distanceM ?? 0,
      longestRunId: longestRun?.id ?? null,
      easyDistanceM,
      moderateDistanceM,
      hardDistanceM,
      avgPaceSecPerKm: totalDistanceM > 0 ? paceNumerator / totalDistanceM : null,
      avgHrBpm: hrDistanceM > 0 ? Math.round(hrNumerator / hrDistanceM) : null,
      strainScore: weekActivities.length > 0 ? strainScore : null,
      monotonyScore: dailyDeviation > 0 ? dailyMean / dailyDeviation : null,
      dataCompleteness: Math.min(1, weekActivities.length / 3),
    });
  }

  return rows.map((row, index) => {
    const recentDistances = rows.slice(Math.max(0, index - 3), index + 1).map((item) => item.totalDistanceM / 1000);
    const averageDistance = mean(recentDistances);
    const variation = averageDistance > 0 ? standardDeviation(recentDistances) / averageDistance : 1;
    return { ...row, consistencyScore: clamp(100 - variation * 100, 0, 100) };
  });
};

const buildPrediction = (activities, weeklyRows, targetDistanceM, generatedAt) => {
  if (activities.length === 0) return null;
  const latestDate = new Date(activities[activities.length - 1].occurredAt);
  const cutoff = new Date(latestDate.getTime() - 180 * 86400000);
  const candidates = activities
    .filter((activity) => {
      const occurredAt = new Date(activity.occurredAt);
      return occurredAt >= cutoff && activity.distanceM >= 5000 && activity.distanceM <= 30000;
    })
    .map((activity) => ({
      activity,
      projectedTimeS: activity.elapsedTimeS * (targetDistanceM / activity.distanceM) ** 1.06,
    }))
    .sort((left, right) => left.projectedTimeS - right.projectedTimeS);
  if (candidates.length === 0) return null;

  const basis = candidates[0];
  const recentWeeks = weeklyRows.slice(-12);
  const activeWeekRatio = recentWeeks.length > 0
    ? recentWeeks.filter((week) => week.runCount > 0).length / recentWeeks.length
    : 0;
  const longestRecentRunM = Math.max(0, ...recentWeeks.map((week) => week.longRunDistanceM));
  const distanceReadiness = clamp(longestRecentRunM / targetDistanceM, 0, 1);
  const margin = clamp(0.15 - activeWeekRatio * 0.05 - distanceReadiness * 0.04, 0.06, 0.15);
  const predictedTimeS = Math.round(basis.projectedTimeS);

  return {
    athleteId: basis.activity.athleteId,
    targetDistanceM,
    predictedTimeS,
    predictedPaceSecPerKm: round(predictedTimeS / (targetDistanceM / 1000), 1),
    bandLowS: Math.round(predictedTimeS * (1 - margin)),
    bandHighS: Math.round(predictedTimeS * (1 + margin)),
    modelVersion: LOCAL_MODEL_VERSION,
    basisActivityId: basis.activity.id,
    generatedAt,
  };
};

const buildDriverContributions = (weeklyRows, targetDistanceM) => {
  const recent = weeklyRows.slice(-4);
  const prior = weeklyRows.slice(-8, -4);
  const recentDistanceKm = mean(recent.map((week) => week.totalDistanceM / 1000));
  const priorDistanceKm = mean(prior.map((week) => week.totalDistanceM / 1000));
  const recentPace = mean(recent.filter((week) => week.avgPaceSecPerKm !== null).map((week) => week.avgPaceSecPerKm));
  const priorPace = mean(prior.filter((week) => week.avgPaceSecPerKm !== null).map((week) => week.avgPaceSecPerKm));
  const activeWeekRatio = recent.length > 0 ? recent.filter((week) => week.runCount > 0).length / recent.length : 0;
  const longestRunM = Math.max(0, ...recent.map((week) => week.longRunDistanceM));

  const volumeTrend = priorDistanceKm > 0 ? clamp(((recentDistanceKm - priorDistanceKm) / priorDistanceKm) * 20, -25, 25) : 0;
  const paceTrend = priorPace > 0 && recentPace > 0 ? clamp(((priorPace - recentPace) / priorPace) * 100, -20, 20) : 0;
  const contributions = [
    { key: "consistency", label: "Recent training consistency", value: activeWeekRatio * 25, confidence: 0.8 },
    { key: "long_run", label: "Long-run readiness", value: clamp((longestRunM / targetDistanceM) * 25, 0, 25), confidence: 0.78 },
    { key: "volume_trend", label: "Four-week volume trend", value: volumeTrend, confidence: prior.length === 4 ? 0.72 : 0.5 },
    { key: "pace_trend", label: "Four-week pace trend", value: paceTrend, confidence: priorPace > 0 ? 0.68 : 0.4 },
  ];
  return contributions.map((driver) => ({
    key: driver.key,
    label: driver.label,
    contributionPct: round(driver.value, 1),
    direction: driver.value > 0.05 ? "positive" : driver.value < -0.05 ? "negative" : "neutral",
    confidence: driver.confidence,
  }));
};

const writeSnapshotAtomically = async (snapshotPath, snapshot) => {
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  const temporaryPath = `${snapshotPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryPath, snapshotPath);
};

export const runLocalAnalytics = async ({
  databasePath,
  snapshotPath,
  athleteId = "athlete_001",
  targetDistanceM = DEFAULT_TARGET_DISTANCE_M,
}) => {
  const database = new DatabaseSync(databasePath);
  createAnalyticsSchema(database);
  const activities = database.prepare(`
    SELECT
      id, athlete_id AS athleteId, occurred_at AS occurredAt,
      local_occurred_at AS localOccurredAt, elapsed_time_s AS elapsedTimeS,
      distance_m AS distanceM, avg_pace_sec_per_km AS avgPaceSecPerKm,
      elevation_gain_m AS elevationGainM, avg_hr_bpm AS avgHrBpm,
      aerobic_training_effect AS aerobicTrainingEffect
    FROM activities WHERE athlete_id = ? ORDER BY occurred_at
  `).all(athleteId);
  if (activities.length === 0) {
    database.close();
    throw new Error(`No normalized activities found for athlete: ${athleteId}`);
  }

  const weeklyRows = computeWeeklyRows(activities);
  const generatedAt = new Date().toISOString();
  const targetDistancesM = [...new Set([...STANDARD_TARGET_DISTANCES_M, targetDistanceM])]
    .sort((left, right) => left - right);
  const predictions = targetDistancesM
    .map((distanceM) => buildPrediction(activities, weeklyRows, distanceM, generatedAt))
    .filter((prediction) => prediction !== null);
  const prediction = predictions.find((candidate) => candidate.targetDistanceM === targetDistanceM);
  if (!prediction || predictions.length !== targetDistancesM.length) {
    database.close();
    throw new Error("At least one 5-30 km activity is required for a race projection");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM weekly_features WHERE athlete_id = ?").run(athleteId);
    const insertWeekly = database.prepare(`
      INSERT INTO weekly_features (
        id, athlete_id, week_start_date, week_end_date, run_count, total_distance_m,
        total_elapsed_time_s, total_elevation_gain_m, long_run_distance_m, longest_run_id,
        easy_distance_m, moderate_distance_m, hard_distance_m, avg_pace_sec_per_km,
        avg_hr_bpm, strain_score, monotony_score, consistency_score, data_completeness,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const week of weeklyRows) {
      insertWeekly.run(
        `weekly_${athleteId}_${week.weekStart}`,
        athleteId,
        week.weekStart,
        week.weekEnd,
        week.runCount,
        week.totalDistanceM,
        week.totalElapsedTimeS,
        week.totalElevationGainM,
        week.longRunDistanceM,
        week.longestRunId,
        week.easyDistanceM,
        week.moderateDistanceM,
        week.hardDistanceM,
        week.avgPaceSecPerKm,
        week.avgHrBpm,
        week.strainScore,
        week.monotonyScore,
        week.consistencyScore,
        week.dataCompleteness,
        generatedAt,
        generatedAt,
      );
    }
    database.prepare("DELETE FROM predictions WHERE athlete_id = ? AND model_version = ?")
      .run(athleteId, LOCAL_MODEL_VERSION);
    const upsertPrediction = database.prepare(`
      INSERT INTO predictions (
        id, athlete_id, target_distance_m, predicted_time_s, predicted_pace_sec_per_km,
        band_low_s, band_high_s, model_version, basis_activity_id, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (athlete_id, target_distance_m, model_version) DO UPDATE SET
        predicted_time_s = excluded.predicted_time_s,
        predicted_pace_sec_per_km = excluded.predicted_pace_sec_per_km,
        band_low_s = excluded.band_low_s,
        band_high_s = excluded.band_high_s,
        basis_activity_id = excluded.basis_activity_id,
        generated_at = excluded.generated_at
    `);
    for (const candidate of predictions) {
      upsertPrediction.run(
        `prediction_${athleteId}_${Math.round(candidate.targetDistanceM)}`,
        athleteId,
        candidate.targetDistanceM,
        candidate.predictedTimeS,
        candidate.predictedPaceSecPerKm,
        candidate.bandLowS,
        candidate.bandHighS,
        candidate.modelVersion,
        candidate.basisActivityId,
        candidate.generatedAt,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database.close();
    throw error;
  }

  const latestImport = database.prepare(`
    SELECT id AS importId, status, staged_count AS stagedCount,
      normalized_count AS normalizedCount, duplicate_count AS duplicateCount,
      rejected_count AS rejectedCount, updated_at AS updatedAt
    FROM imports WHERE athlete_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(athleteId);
  const featureTrendPoints = weeklyRows.slice(-12).map((week) => ({
    weekStart: week.weekStart,
    featureKey: "weekly_distance_km",
    featureLabel: "Weekly distance",
    value: round(week.totalDistanceM / 1000, 1),
    unit: "km",
  }));
  const snapshot = {
    fetchStatus: "success",
    stale: { isStale: false },
    data: {
      predictionSummary: {
        athleteId: prediction.athleteId,
        targetDistanceM: prediction.targetDistanceM,
        predictedTimeS: prediction.predictedTimeS,
        predictedPaceSecPerKm: prediction.predictedPaceSecPerKm,
        bandLowS: prediction.bandLowS,
        bandHighS: prediction.bandHighS,
        modelVersion: prediction.modelVersion,
        generatedAt: prediction.generatedAt,
      },
      predictionOptions: predictions.map((candidate) => ({
        athleteId: candidate.athleteId,
        targetDistanceM: candidate.targetDistanceM,
        predictedTimeS: candidate.predictedTimeS,
        predictedPaceSecPerKm: candidate.predictedPaceSecPerKm,
        bandLowS: candidate.bandLowS,
        bandHighS: candidate.bandHighS,
        modelVersion: candidate.modelVersion,
        generatedAt: candidate.generatedAt,
      })),
      driverContributions: buildDriverContributions(weeklyRows, targetDistanceM),
      featureTrendPoints,
      importProgress: latestImport,
    },
  };
  await writeSnapshotAtomically(snapshotPath, snapshot);

  const reconciliation = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM activities WHERE athlete_id = ?) AS activityCount,
      (SELECT COUNT(*) FROM weekly_features WHERE athlete_id = ?) AS weeklyFeatureCount,
      (SELECT ROUND(SUM(distance_m), 3) FROM activities WHERE athlete_id = ?) AS activityDistanceM,
      (SELECT ROUND(SUM(total_distance_m), 3) FROM weekly_features WHERE athlete_id = ?) AS weeklyDistanceM
  `).get(athleteId, athleteId, athleteId, athleteId);
  database.close();

  return {
    athleteId,
    weeklyFeatureCount: weeklyRows.length,
    prediction,
    predictions,
    snapshotPath,
    reconciliation,
  };
};
