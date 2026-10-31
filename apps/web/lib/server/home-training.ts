import { DatabaseSync } from "node:sqlite";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import {
  homeTrainingSchema,
  type HomeTraining,
  type TrainingSection,
} from "../../../../packages/core/src/contracts/home-training.ts";
import { calendarSessionSchema } from "../../../../packages/core/src/contracts/coaching.ts";
type CalendarSession = ReturnType<typeof calendarSessionSchema.parse>;
import { createLocalCoachingService } from "../local-coaching-service.ts";
import { localDateInTimezone } from "../coaching-ui-state.ts";
import { formatDistance, formatDuration } from "../activity-formatters.ts";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import { raceHistoryActor } from "./race-history.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
type Run = {
  id: string;
  title: string | null;
  occurredAt: Date;
  distanceM: number;
  elapsedTimeS: number;
};
export function nextRunningSession(
  sessions: Pick<
    CalendarSession,
    | "id"
    | "title"
    | "kind"
    | "effectiveDate"
    | "startTime"
    | "status"
    | "durationMinutes"
    | "distanceMeters"
    | "intensityRpe"
  >[],
  today: string,
): TrainingSection {
  const next = sessions
    .filter(
      (s) =>
        s.kind === "run" && s.status !== "skipped" && s.effectiveDate >= today,
    )
    .sort(
      (a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
    )[0];
  return next
    ? {
        status: "ready",
        item: {
          id: next.id,
          title: next.title,
          date: next.effectiveDate,
          detail: [
            next.durationMinutes ? `${next.durationMinutes} min` : null,
            next.distanceMeters ? formatDistance(next.distanceMeters) : null,
            next.intensityRpe ? `RPE ${next.intensityRpe}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      }
    : { status: "empty" };
}
function runSection(run: Run | null, timezone: string | null): TrainingSection {
  return run
    ? {
        status: "ready",
        item: {
          id: run.id,
          title: run.title || "Recorded run",
          date: timezone ? localDateInTimezone(timezone, run.occurredAt) : null,
          detail: `${formatDistance(run.distanceM)} · ${formatDuration(run.elapsedTimeS)}`,
        },
      }
    : { status: "empty" };
}
async function settledSection(
  read: () => Promise<TrainingSection>,
): Promise<TrainingSection> {
  try {
    return await read();
  } catch {
    return { status: "unavailable" };
  }
}
export async function savedTrainingTimezone(
  active: PromiseSettledResult<{ timezone: string } | null>,
  readHistory: () => Promise<{ timezone: string }[]>,
): Promise<string | null> {
  if (active.status === "fulfilled" && active.value) return active.value.timezone;
  try { return (await readHistory())[0]?.timezone ?? null; } catch { return null; }
}
export async function readHomeTraining(
  security: SensitiveRouteContext,
  now = new Date(),
): Promise<HomeTraining> {
  if (security.mode === "authenticated") {
    const athleteId = raceHistoryActor(security),
      scope = athleteScopeFor(security.actor),
      composition = getCloudReadComposition();
    const planPromise = composition.coaching.getActivePlan(scope);
    // Start the activity read before waiting on the independent plan source.
    const runPromise = getCloudPrismaClient()
      .activity.findFirst({
        where: {
          athleteId,
          deletedAt: null,
          sport: { in: ["run", "trail_run", "treadmill_run"] },
          occurredAt: { lte: now },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          occurredAt: true,
          distanceM: true,
          elapsedTimeS: true,
        },
      })
      .then((r) => (r ? { ...r, distanceM: Number(r.distanceM) } : null));
    const [planRead, runRead] = await Promise.allSettled([
      planPromise,
      runPromise,
    ]);
    // Cloud profiles do not store a separate timezone. Use the saved active
    // plan, or the most recent verified plan history, without inventing a date
    // if both reads are unavailable.
    const timezone = await savedTrainingTimezone(planRead, () => composition.coaching.listHistory(scope));
    const today = timezone ? localDateInTimezone(timezone, now) : null;
    const nextSession =
      planRead.status === "rejected" || !today
        ? { status: "unavailable" as const }
        : await settledSection(async () => {
            const plan = planRead.value;
            if (!plan || plan.endsOn < today) return { status: "empty" };
            return nextRunningSession(
              await composition.calendarSessions.listActiveCalendar(scope, {
                from: today,
                to: plan.endsOn,
              }),
              today,
            );
          });
    return homeTrainingSchema.parse({
      timezone,
      lastRun:
        runRead.status === "fulfilled"
          ? runSection(runRead.value, timezone)
          : { status: "unavailable" },
      nextSession,
    });
  }
  const service = createLocalCoachingService({
    athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
  });
  try {
    let timezone = "Africa/Johannesburg";
    try {
      timezone = service.loadProfile()?.timezone ?? timezone;
    } catch {}
    let plan: ReturnType<typeof service.getActivePlan> | null = null;
    let planFailed = false;
    try {
      plan = service.getActivePlan();
      timezone = plan?.timezone ?? timezone;
    } catch {
      planFailed = true;
    }
    const zone = timezone,
      today = localDateInTimezone(zone, now);
    const [lastRun, nextSession] = await Promise.all([
      settledSection(async () => {
        const db = new DatabaseSync(service.databasePath, { readOnly: true });
        try {
          const columns = db.prepare("PRAGMA table_info(activities)").all();
          const deletion = columns.some((c) => c.name === "deleted_at")
            ? "AND deleted_at IS NULL"
            : "";
          const row = db
            .prepare(
              `SELECT id,title,occurred_at,distance_m,elapsed_time_s FROM activities WHERE athlete_id=? ${deletion} AND sport IN ('run','trail_run','treadmill_run') AND occurred_at<=? ORDER BY occurred_at DESC,id DESC LIMIT 1`,
            )
            .get(service.athleteId, now.toISOString());
          return runSection(
            row
              ? {
                  id: String(row.id),
                  title: row.title ? String(row.title) : null,
                  occurredAt: new Date(String(row.occurred_at)),
                  distanceM: Number(row.distance_m),
                  elapsedTimeS: Number(row.elapsed_time_s),
                }
              : null,
            zone,
          );
        } finally {
          db.close();
        }
      }),
      settledSection(async () => {
        if (planFailed) return { status: "unavailable" };
        if (!plan || plan.endsOn < today) return { status: "empty" };
        return nextRunningSession(
          service
            .listActiveCalendar()
            .filter((s) => s.effectiveDate <= plan!.endsOn),
          today,
        );
      }),
    ]);
    return homeTrainingSchema.parse({ timezone, lastRun, nextSession });
  } finally {
    service.close();
  }
}
