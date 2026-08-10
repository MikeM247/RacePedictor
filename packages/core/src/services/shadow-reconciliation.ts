import { z } from "zod";

const shadowActivitySchema = z.object({
  id: z.string().min(1).max(128),
  sourceActivityId: z.string().min(1).max(128).nullable(),
  dedupeHash: z.string().min(1).max(128),
  occurredAt: z.string().datetime({ offset: true }),
  distanceM: z.number().positive(),
  elapsedTimeS: z.number().int().positive(),
  splitCount: z.number().int().nonnegative(),
}).strict();

export type ShadowActivity = z.infer<typeof shadowActivitySchema>;

export function reconcileShadowActivities(input: {
  provider: readonly ShadowActivity[];
  local: readonly ShadowActivity[];
}) {
  const provider = input.provider.map((item) => shadowActivitySchema.parse(item));
  const local = input.local.map((item) => shadowActivitySchema.parse(item));
  const discrepancies: Array<Readonly<{ providerId: string; code: string; detail: string; releaseBlock: true }>> = [];
  let retained = 0;
  let duplicate = 0;
  let ambiguous = 0;
  let rejected = 0;
  const matchedLocalIds = new Set<string>();
  for (const item of provider) {
    const candidates = local.filter((candidate) => (
      candidate.sourceActivityId === item.sourceActivityId && item.sourceActivityId !== null
    ) || candidate.dedupeHash === item.dedupeHash);
    if (candidates.length === 0) {
      rejected += 1;
      discrepancies.push(block(item.id, "MISSING_LOCAL_MATCH", "No representative local activity matches the provider activity."));
      continue;
    }
    if (candidates.length > 1) {
      ambiguous += 1;
      discrepancies.push(block(item.id, "AMBIGUOUS_LOCAL_MATCH", `${candidates.length} representative local activities match.`));
      continue;
    }
    const match = candidates[0];
    if (matchedLocalIds.has(match.id)) {
      duplicate += 1;
      discrepancies.push(block(item.id, "DUPLICATE_PROVIDER_MATCH", "Two provider activities resolve to one local activity."));
      continue;
    }
    matchedLocalIds.add(match.id);
    const differences = compare(item, match);
    if (differences.length > 0) {
      discrepancies.push(...differences.map((difference) => block(item.id, difference.code, difference.detail)));
      continue;
    }
    retained += 1;
  }
  const providerWeeks = weekly(provider);
  const localWeeks = weekly(local.filter((item) => matchedLocalIds.has(item.id)));
  for (const [week, totals] of providerWeeks) {
    const localTotals = localWeeks.get(week);
    if (!localTotals || Math.abs(totals.distanceM - localTotals.distanceM) > 25 || Math.abs(totals.elapsedTimeS - localTotals.elapsedTimeS) > 5) {
      discrepancies.push(block(`week:${week}`, "WEEKLY_AGGREGATE_MISMATCH", "Representative weekly distance or duration differs."));
    }
  }
  return Object.freeze({
    counts: Object.freeze({
      requested: provider.length,
      fetched: provider.length,
      retained,
      normalized: retained,
      duplicate,
      ambiguous,
      rejected,
      failed: 0,
    }),
    discrepancies: Object.freeze(discrepancies),
    releaseCandidateBlocked: discrepancies.length > 0,
  });
}

function compare(provider: ShadowActivity, local: ShadowActivity) {
  const differences: Array<{ code: string; detail: string }> = [];
  if (Math.abs(Date.parse(provider.occurredAt) - Date.parse(local.occurredAt)) > 5_000) differences.push({ code: "TIMING_MISMATCH", detail: "Start times differ by more than five seconds." });
  if (Math.abs(provider.distanceM - local.distanceM) > 25) differences.push({ code: "DISTANCE_MISMATCH", detail: "Distances differ by more than 25 metres." });
  if (Math.abs(provider.elapsedTimeS - local.elapsedTimeS) > 5) differences.push({ code: "DURATION_MISMATCH", detail: "Durations differ by more than five seconds." });
  if (provider.splitCount !== local.splitCount) differences.push({ code: "SPLIT_COUNT_MISMATCH", detail: "Available split counts differ." });
  return differences;
}

function block(providerId: string, code: string, detail: string) {
  return Object.freeze({ providerId, code, detail, releaseBlock: true as const });
}

function weekly(items: readonly ShadowActivity[]) {
  const result = new Map<string, { distanceM: number; elapsedTimeS: number }>();
  for (const item of items) {
    const week = isoWeek(item.occurredAt);
    const totals = result.get(week) ?? { distanceM: 0, elapsedTimeS: 0 };
    totals.distanceM += item.distanceM;
    totals.elapsedTimeS += item.elapsedTimeS;
    result.set(week, totals);
  }
  return result;
}

function isoWeek(value: string) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - start.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
