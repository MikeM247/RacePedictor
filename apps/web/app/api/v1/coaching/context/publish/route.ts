import { contextPublishRequestSchema } from "../../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../../_security.ts";
import { readJson, withCoachingService } from "../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
async function publishContext(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService(async (service) => {
    if (body instanceof Error) throw body;
    const input = contextPublishRequestSchema.parse(body);
    const profile = service.saveProfile({
      ...input.profile,
      experience: input.profile.experience ?? "intermediate",
      constraints: input.profile.constraints ?? [],
    });
    const available = new Set(input.weeklyRoutine.availableDays);
    const routine = service.saveRoutine({
      timezone: input.weeklyRoutine.timezone,
      desiredSessionsPerWeek: input.weeklyRoutine.desiredSessionsPerWeek ?? available.size,
      preferredLongRunDay: input.weeklyRoutine.preferredLongRunDay,
      days: weekdays.map((day) => available.has(day) ? {
        day,
        available: true as const,
        startTime: day === input.weeklyRoutine.preferredLongRunDay ? "06:30" : "06:00",
        endTime: day === input.weeklyRoutine.preferredLongRunDay ? "09:30" : "08:00",
        maxDurationMinutes: day === input.weeklyRoutine.preferredLongRunDay ? 180 : 120,
        allowedKinds: ["run", "strength", "cross_train"] as Array<"run" | "strength" | "cross_train">,
      } : { day, available: false as const }),
    });
    const goal = service.createGoal({
      title: input.goalDraft.title,
      why: input.profile.why,
      target: {
        kind: "performance",
        distanceMeters: input.goalDraft.distanceMeters,
        targetDate: input.goalDraft.targetDate,
      },
    });
    const published = await service.publishCoachingContext({ planningGoalId: goal.id });
    return { ...published, artifactId: published.artifact.id, profile, routine, goal };
  });
}

export const POST = withSensitiveRoute((_security, request) => publishContext(request));
