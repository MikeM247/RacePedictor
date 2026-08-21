import { reminderExternalStatusRequestSchema } from "../../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../../_security.ts";
import { readJson, withCoachingService } from "../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function updateReminderHandoffStatus(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService((service) => {
    if (body instanceof Error) throw body;
    return service.confirmReminderAutomation(reminderExternalStatusRequestSchema.parse(body));
  });
}

export const PUT = withSensitiveRoute((_security, request) => updateReminderHandoffStatus(request));
