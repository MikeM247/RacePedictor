import { randomUUID } from "node:crypto";
import { z } from "zod";
import { athleteScopeFor, buildActorContext } from "../../../../packages/core/src/contracts/auth.ts";
import { buildReviewComparison, buildReviewFacts, buildReviewPrompt, validateGeneratedReview } from "../../../../packages/core/src/services/activity-coach-review.ts";
import { getCloudPrismaClient, PrismaActivityReviewRepository, PrismaCalendarSessionAmendmentRepository, PrismaCloudActivityRepository, PrismaCloudCoachingRepository } from "../../../../packages/db/src/cloud/index.js";

const DEFAULT_MODEL = "gpt-5-mini";
const DEVICE_ID = "cloud-coach-worker";
const generatedReviewSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  assessment: z.string().trim().min(1).max(4000),
  nextStep: z.string().trim().min(1).max(1000),
  evidence: z.array(z.object({ source: z.enum(["activity", "plan", "recent_history", "second_brain"]), label: z.string().trim().min(1).max(160) }).strict()).max(16),
  limitations: z.array(z.string().trim().min(1).max(500)).max(8),
}).strict();

export async function runCloudCoachFeedbackBatch({ athleteId, activityId = null, limit = 5, fetchImpl = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY, model = process.env.RACEPREDICTOR_ACTIVITY_REVIEW_MODEL || DEFAULT_MODEL, now = () => new Date() }: {
  athleteId: string;
  activityId?: string | null;
  limit?: number;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
  now?: () => Date;
}) {
  const prisma = getCloudPrismaClient() as any;
  const reviews = new PrismaActivityReviewRepository({ prisma });
  const scope = athleteScopeFor(buildActorContext({ userId: DEVICE_ID, permittedAthleteIds: [athleteId], activeAthleteId: athleteId, requestId: `coach:${randomUUID()}`, credentialKind: "internal" }));
  const dayStart = new Date(now());
  dayStart.setUTCHours(0, 0, 0, 0);
  const attempted = await prisma.activityReviewRequest.aggregate({ where: { athleteId, updatedAt: { gte: dayStart } }, _sum: { attemptCount: true } });
  const remaining = Math.max(0, 20 - Number(attempted._sum.attemptCount ?? 0));
  if (remaining === 0) return { status: "queued", processed: 0, reason: "DAILY_LIMIT" };
  const claim = await reviews.claim(scope, DEVICE_ID, Math.min(Math.max(limit, 1), remaining), activityId);
  if (claim.items.length === 0) return { status: "idle", processed: 0 };
  if (!apiKey || apiKey.trim().length < 20) {
    for (const item of claim.items) await reviews.markFailure(scope, item.requestId, DEVICE_ID, "OPENAI_API_KEY_NOT_CONFIGURED", false);
    return { status: "attention", processed: 0, reason: "OPENAI_API_KEY_NOT_CONFIGURED" };
  }
  const activities = new PrismaCloudActivityRepository({ prisma });
  const coaching = new PrismaCloudCoachingRepository({ prisma });
  const calendar = new PrismaCalendarSessionAmendmentRepository({ prisma });
  const results = [] as Array<{ activityId: string; status: string; reason?: string }>;
  for (const item of claim.items) {
    try {
      const activity = await activities.findById(scope, item.activityId);
      if (!activity) throw new Error("ACTIVITY_NOT_FOUND");
      const coachActivity = selectCoachActivity(activity);
      const localDate = (coachActivity.localOccurredAt ?? coachActivity.occurredAt).slice(0, 10);
      const plan = await coaching.getActivePlan(scope);
      const sessions = plan ? await calendar.listActiveCalendar(scope, { from: localDate, to: localDate }) : [];
      const candidates = sessions.filter((session) => session.kind !== "rest" && session.status !== "skipped");
      const facts = buildReviewFacts({
        activity: coachActivity,
        sessions: candidates.map((session) => ({
          id: session.id,
          planId: plan?.id ?? "active-plan",
          planVersion: plan?.version ?? 1,
          title: session.title,
          scheduledDate: session.effectiveDate,
          durationMinutes: session.durationMinutes,
          distanceMeters: session.distanceMeters,
          intensityRpe: session.intensityRpe,
          purpose: session.purpose,
          prescription: session.prescription,
        })),
      });
      const existing = await reviews.get(scope, item.activityId);
      if (existing.review?.inputFingerprint === facts.fingerprint) {
        await reviews.markReady(scope, item.requestId, DEVICE_ID);
        results.push({ activityId: item.activityId, status: "ready" });
        continue;
      }
      await reviews.recordInputSnapshot(scope, item.requestId, DEVICE_ID, { activityRevision: await activities.currentRevision(scope, item.activityId), inputFingerprint: facts.fingerprint, planComparison: buildReviewComparison(facts) });
      const generated = await generate({ fetchImpl, apiKey, model, prompt: buildReviewPrompt(facts) });
      await reviews.recordProviderResult(scope, item.requestId, DEVICE_ID, generated.metadata);
      const timestamp = now().toISOString();
      const review = validateGeneratedReview({
        id: `activity_coach_review_${item.activityId}_${randomUUID().replaceAll("-", "")}`,
        athleteId,
        activityId: item.activityId,
        revision: (existing.review?.revision ?? 0) + 1,
        inputFingerprint: facts.fingerprint,
        headline: generated.review.headline,
        assessment: generated.review.assessment,
        nextStep: generated.review.nextStep,
        comparison: buildReviewComparison(facts),
        evidence: generated.review.evidence.filter((e) => e.source === "activity" || e.source === "plan"),
        limitations: [...new Set([...facts.limitations, ...generated.review.limitations])].slice(0, 8),
        generatedAt: timestamp,
        publishedAt: timestamp,
        model,
        promptVersion: "activity-coach-review.cloud-metrics.v1",
        provenance: "cloud_metrics_plan",
      });
      const revision = await activities.currentRevision(scope, item.activityId);
      await reviews.publish(scope, { ...review, requestId: item.requestId, leaseToken: item.leaseToken, expectedActivityRevision: revision }, DEVICE_ID);
      results.push({ activityId: item.activityId, status: "ready" });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 80) : "ACTIVITY_COACH_REVIEW_FAILED";
      await reviews.markFailure(scope, item.requestId, DEVICE_ID, reason, !/NOT_CONFIGURED|NOT_FOUND|INVALID|ZOD|REFUSAL|INCOMPLETE|OPENAI_401|OPENAI_403|stale/i.test(reason));
      results.push({ activityId: item.activityId, status: "retry_wait", reason });
    }
  }
  return { status: "processed", processed: results.length, results };
}

async function generate({ fetchImpl, apiKey, model, prompt }: { fetchImpl: typeof fetch; apiKey: string; model: string; prompt: string }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, store: false, input: prompt, text: { format: {
        type: "json_schema", name: "activity_coach_review", strict: true,
        schema: { type: "object", additionalProperties: false, required: ["headline", "assessment", "nextStep", "evidence", "limitations"], properties: {
          headline: { type: "string" }, assessment: { type: "string" }, nextStep: { type: "string" },
          evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["source", "label"], properties: { source: { type: "string", enum: ["activity", "plan", "recent_history", "second_brain"] }, label: { type: "string" } } } },
          limitations: { type: "array", items: { type: "string" } },
        } },
      } } }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OPENAI_TIMEOUT");
    throw new Error("OPENAI_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  if (payload?.status === "incomplete") throw new Error("OPENAI_INCOMPLETE");
  if (payload?.refusal || payload?.output?.some((item: any) => item?.content?.some((content: any) => content?.type === "refusal"))) throw new Error("OPENAI_REFUSAL");
  return {
    review: generatedReviewSchema.parse(JSON.parse(extractResponseText(payload))),
    metadata: {
      requestId: response.headers.get("x-request-id"),
      inputTokens: Number.isInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null,
      outputTokens: Number.isInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null,
      latencyMs: Date.now() - startedAt,
    },
  };
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const text = payload?.output?.flatMap((item: any) => item?.content ?? [])
    ?.map((content: any) => content?.text)
    ?.find((value: unknown) => typeof value === "string");
  if (typeof text !== "string") throw new Error("OPENAI_RESPONSE_MISSING_TEXT");
  return text;
}

function selectCoachActivity(activity: any) {
  return {
    id: activity.id,
    athleteId: activity.athleteId,
    sport: activity.sport,
    occurredAt: activity.occurredAt,
    localOccurredAt: activity.localOccurredAt ?? null,
    distanceM: activity.distanceM,
    elapsedTimeS: activity.elapsedTimeS,
    movingTimeS: activity.movingTimeS ?? null,
    avgPaceSecPerKm: activity.avgPaceSecPerKm,
    elevationGainM: activity.elevationGainM,
    elevationLossM: activity.elevationLossM,
    avgHrBpm: activity.avgHrBpm ?? null,
    maxHrBpm: activity.maxHrBpm ?? null,
    avgCadenceSpm: activity.avgCadenceSpm ?? null,
    maxCadenceSpm: activity.maxCadenceSpm ?? null,
    avgPowerW: activity.avgPowerW ?? null,
    maxPowerW: activity.maxPowerW ?? null,
    calories: activity.calories ?? null,
    splits: (activity.splits ?? []).map((split: any) => ({
      splitIndex: split.splitIndex,
      startOffsetS: split.startOffsetS,
      endOffsetS: split.endOffsetS,
      durationS: split.durationS,
      distanceM: split.distanceM,
      paceSecPerKm: split.paceSecPerKm,
      elevGainM: split.elevGainM,
      elevLossM: split.elevLossM,
      avgHrBpm: split.avgHrBpm ?? null,
      maxHrBpm: split.maxHrBpm ?? null,
      avgCadenceSpm: split.avgCadenceSpm ?? null,
    })),
  };
}
