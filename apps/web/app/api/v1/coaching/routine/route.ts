import { weeklyRoutineUpdateRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { readJson, withCoachingService } from "../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getRoutine() {
  return withCoachingService((service) => ({ routine: service.loadRoutine() }));
}

async function putRoutine(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService((service) => {
    if (body instanceof Error) throw body;
    return { routine: service.saveRoutine(weeklyRoutineUpdateRequestSchema.parse(body)) };
  });
}

export const GET = withSensitiveRoute(() => getRoutine());
export const PUT = withSensitiveRoute((_security, request) => putRoutine(request));
