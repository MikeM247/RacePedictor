import { reminderPreferencesUpdateRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { readJson, withCoachingService } from "../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getReminderPreferences() {
  return withCoachingService((service) => {
    const loaded = service.loadReminderPreferences();
    const state = loaded.preferences ? loaded : service.saveReminderPreferences();
    return {
      ...state.preferences,
      preferences: state.preferences,
      externalStatus: state.externalStatus,
      externalReference: state.externalReference,
    };
  });
}

async function putReminderPreferences(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService((service) => {
    if (body instanceof Error) throw body;
    const state = service.saveReminderPreferences(reminderPreferencesUpdateRequestSchema.parse(body));
    return {
      ...state.preferences,
      preferences: state.preferences,
      externalStatus: state.externalStatus,
      externalReference: state.externalReference,
    };
  });
}

export const GET = withSensitiveRoute(() => getReminderPreferences());
export const PUT = withSensitiveRoute((_security, request) => putReminderPreferences(request));
