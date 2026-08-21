import { reminderHandoffRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { readJson, withCoachingService } from "../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function createReminderHandoff(request: Request) {
  const body = await readJson(request, { optional: true }).catch((error) => error);
  return withCoachingService(async (service) => {
    if (body instanceof Error) throw body;
    const input = reminderHandoffRequestSchema.parse(body);
    if (Object.keys(input).length > 0) service.saveReminderPreferences(input);
    const handoff = await service.generateCodexReminderHandoff();
    return { ...handoff, handoff: handoff.content, instructions: handoff.content };
  });
}

export const POST = withSensitiveRoute((_security, request) => createReminderHandoff(request));
