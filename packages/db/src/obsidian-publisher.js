import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const GENERATED_START = "<!-- racepredictor:generated:start -->";
const GENERATED_END = "<!-- racepredictor:generated:end -->";

const formatNumber = (value, precision = 1) => Number(value).toFixed(precision);

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "—";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const formatPace = (secondsPerKm) => {
  if (secondsPerKm === null || secondsPerKm === undefined) return "—";
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
};

const isoWeek = (dateString) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const managedBlock = (content) => `${GENERATED_START}\n${content.trim()}\n${GENERATED_END}`;

const writeAtomically = async (filePath, content) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
};

const upsertManagedNote = async (filePath, { initialPrefix = "", generatedContent, initialSuffix = "" }) => {
  const block = managedBlock(generatedContent);
  let existing = null;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }

  let next;
  let created;
  if (existing === null) {
    next = `${initialPrefix.trim()}\n\n${block}\n\n${initialSuffix.trim()}\n`;
    created = true;
  } else {
    const start = existing.indexOf(GENERATED_START);
    const end = existing.indexOf(GENERATED_END);
    if (start >= 0 && end > start) {
      next = `${existing.slice(0, start)}${block}${existing.slice(end + GENERATED_END.length)}`;
    } else {
      next = `${existing.trimEnd()}\n\n${block}\n`;
    }
    created = false;
  }

  if (next !== existing) await writeAtomically(filePath, next);
  return { filePath, created, changed: next !== existing };
};

const createIfMissing = async (filePath, content) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
    return { filePath, created: true };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return { filePath, created: false };
    }
    throw error;
  }
};

const reviewGeneratedContent = (week, latestPrediction, isLatestWeek) => {
  const totalKm = week.totalDistanceM / 1000;
  const intensityTotal = week.easyDistanceM + week.moderateDistanceM + week.hardDistanceM;
  const intensity = (distanceM) => intensityTotal > 0 ? `${formatNumber(distanceM / 1000)} km (${Math.round(distanceM / intensityTotal * 100)}%)` : "0.0 km";
  const lines = [
    "> Generated from the normalized Garmin database. Edit the Personal context section, not this generated block.",
    "",
    "## Training summary",
    "",
    `- Runs: ${week.runCount}`,
    `- Distance: ${formatNumber(totalKm)} km`,
    `- Time: ${formatDuration(week.totalElapsedTimeS)}`,
    `- Long run: ${formatNumber(week.longRunDistanceM / 1000)} km`,
    `- Elevation gain: ${Math.round(week.totalElevationGainM)} m`,
    `- Average pace: ${formatPace(week.avgPaceSecPerKm)}`,
    `- Average heart rate: ${week.avgHrBpm ?? "—"} bpm`,
    "",
    "## Intensity distribution",
    "",
    `- Easy: ${intensity(week.easyDistanceM)}`,
    `- Moderate: ${intensity(week.moderateDistanceM)}`,
    `- Hard: ${intensity(week.hardDistanceM)}`,
    "",
    "## Data signals",
    "",
    `- Four-week consistency score: ${formatNumber(week.consistencyScore)}%`,
    `- Data completeness: ${Math.round(week.dataCompleteness * 100)}%`,
  ];
  if (isLatestWeek && latestPrediction) {
    lines.push(
      `- Half-marathon training estimate: ${formatDuration(latestPrediction.predictedTimeS)} (${formatPace(latestPrediction.predictedPaceSecPerKm)})`,
      `- Estimate uncertainty: ${formatDuration(latestPrediction.bandLowS)}–${formatDuration(latestPrediction.bandHighS)}`,
      `- Estimate method: ${latestPrediction.modelVersion}`,
    );
  }
  return lines.join("\n");
};

const reviewPrefix = (week) => `---
type: running-weekly-review
week_start: ${week.weekStartDate}
week_end: ${week.weekEndDate}
tags:
  - running
  - fitness
  - weekly-review
---

# Running review — ${isoWeek(week.weekStartDate)}

Context: [[Running Context]]`;

const reviewSuffix = `## Personal context

- Overall energy (1–10):
- Sleep quality:
- Soreness or pain:
- Stress and mood:
- Weather or heat:
- Key sessions and how they felt:
- What went well:
- What should change next week:
- Planned focus:
- Other notes:`;

const contextNote = `---
type: running-context
tags:
  - running
  - fitness
  - context
---

# Running Context

This note supplies the personal context that Garmin cannot capture. Keep it current so future reviews and predictions can be interpreted correctly.

## Current goals

- Primary race or distance:
- Target date:
- Target outcome:
- Why this matters:

## Constraints

- Available training days:
- Preferred long-run day:
- Work/family constraints:
- Heat, terrain, or travel constraints:

## Health

- Current injuries or niggles:
- Relevant medical guidance:
- Recovery priorities:

## Training preferences

- Sessions I enjoy:
- Sessions I avoid:
- Current shoes and approximate mileage:
- Strength or cross-training routine:

## Interpretation notes

- Garmin export dates are interpreted as Africa/Johannesburg local time (+02:00).
- Race predictions are training estimates, not medical or coaching advice.
`;

const activityTemplate = `---
type: running-activity-context
activity_date:
garmin_title:
distance_km:
tags:
  - running
  - activity-context
---

# Running activity context

## Purpose

- Planned session:
- Intended effort:
- Why today:

## Experience

- RPE (1–10):
- Energy before:
- Energy after:
- Pain or discomfort:
- Weather/heat:
- Route/terrain:
- Shoes:

## Reflection

- What happened:
- What I learned:
- Recovery needed:
- Follow-up:
`;

export const publishObsidianArtifacts = async ({
  databasePath,
  vaultPath,
  athleteId = "athlete_001",
  reviewWeeks = 12,
}) => {
  if (!Number.isInteger(reviewWeeks) || reviewWeeks < 1 || reviewWeeks > 52) {
    throw new Error("reviewWeeks must be an integer between 1 and 52");
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const weeks = database.prepare(`
    SELECT
      week_start_date AS weekStartDate, week_end_date AS weekEndDate,
      run_count AS runCount, total_distance_m AS totalDistanceM,
      total_elapsed_time_s AS totalElapsedTimeS,
      total_elevation_gain_m AS totalElevationGainM,
      long_run_distance_m AS longRunDistanceM,
      easy_distance_m AS easyDistanceM, moderate_distance_m AS moderateDistanceM,
      hard_distance_m AS hardDistanceM, avg_pace_sec_per_km AS avgPaceSecPerKm,
      avg_hr_bpm AS avgHrBpm, consistency_score AS consistencyScore,
      data_completeness AS dataCompleteness
    FROM weekly_features WHERE athlete_id = ?
    ORDER BY week_start_date DESC LIMIT ?
  `).all(athleteId, reviewWeeks).reverse();
  if (weeks.length === 0) {
    database.close();
    throw new Error("No weekly features found; run local analytics first");
  }
  const latestPrediction = database.prepare(`
    SELECT predicted_time_s AS predictedTimeS,
      predicted_pace_sec_per_km AS predictedPaceSecPerKm,
      band_low_s AS bandLowS, band_high_s AS bandHighS,
      model_version AS modelVersion, generated_at AS generatedAt
    FROM predictions WHERE athlete_id = ?
    ORDER BY ABS(target_distance_m - 21097.5), generated_at DESC LIMIT 1
  `).get(athleteId);
  database.close();

  const contextResult = await createIfMissing(
    path.join(vaultPath, "Areas", "Health & Fitness", "Running", "Running Context.md"),
    contextNote,
  );
  const templateResult = await createIfMissing(
    path.join(vaultPath, "Templates", "Running Activity Context.md"),
    activityTemplate,
  );

  const reviews = [];
  for (let index = 0; index < weeks.length; index += 1) {
    const week = weeks[index];
    const year = week.weekStartDate.slice(0, 4);
    const reviewPath = path.join(
      vaultPath,
      "Reviews",
      "Running",
      year,
      `${isoWeek(week.weekStartDate)} Running Review.md`,
    );
    reviews.push(await upsertManagedNote(reviewPath, {
      initialPrefix: reviewPrefix(week),
      generatedContent: reviewGeneratedContent(week, latestPrediction, index === weeks.length - 1),
      initialSuffix: reviewSuffix,
    }));
  }

  const latestWeek = weeks[weeks.length - 1];
  const reviewLinks = [...weeks].reverse().map((week) => {
    const reviewName = `${isoWeek(week.weekStartDate)} Running Review`;
    return `- [[${reviewName}|${isoWeek(week.weekStartDate)}]] — ${formatNumber(week.totalDistanceM / 1000)} km across ${week.runCount} runs`;
  });
  const dashboardContent = [
    "> Generated from RacePredictor. Use the linked review notes for your personal context.",
    "",
    "## Latest week",
    "",
    `- Week: ${isoWeek(latestWeek.weekStartDate)}`,
    `- Distance: ${formatNumber(latestWeek.totalDistanceM / 1000)} km`,
    `- Runs: ${latestWeek.runCount}`,
    `- Long run: ${formatNumber(latestWeek.longRunDistanceM / 1000)} km`,
    `- Average pace: ${formatPace(latestWeek.avgPaceSecPerKm)}`,
    "",
    "## Current half-marathon training estimate",
    "",
    `- Estimated finish: ${formatDuration(latestPrediction?.predictedTimeS)}`,
    `- Estimated pace: ${formatPace(latestPrediction?.predictedPaceSecPerKm)}`,
    `- Uncertainty: ${formatDuration(latestPrediction?.bandLowS)}–${formatDuration(latestPrediction?.bandHighS)}`,
    "",
    "## Recent reviews",
    "",
    ...reviewLinks,
  ].join("\n");
  const dashboardResult = await upsertManagedNote(
    path.join(vaultPath, "Dashboards", "Running Dashboard.md"),
    {
      initialPrefix: `---\ntype: running-dashboard\ntags:\n  - running\n  - dashboard\n---\n\n# Running Dashboard\n\nContext: [[Running Context]]`,
      generatedContent: dashboardContent,
      initialSuffix: "## Personal focus\n\n- Add your current training focus here.",
    },
  );

  return {
    vaultPath,
    context: contextResult,
    activityTemplate: templateResult,
    dashboard: dashboardResult,
    reviewCount: reviews.length,
    reviews,
  };
};
