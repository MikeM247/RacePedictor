import { coachingProfileUpdateRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { readJson, withCoachingService } from "../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getProfile() {
  return withCoachingService((service) => ({ profile: service.loadProfile() }));
}

async function putProfile(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService((service) => {
    if (body instanceof Error) throw body;
    return { profile: service.saveProfile(coachingProfileUpdateRequestSchema.parse(body)) };
  });
}

export const GET = withSensitiveRoute(() => getProfile());
export const PUT = withSensitiveRoute((_security, request) => putProfile(request));
