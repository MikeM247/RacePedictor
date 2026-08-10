import { withSensitiveRoute } from "../../../_security.ts";
import { handleRevokeDevice } from "../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const DELETE = withSensitiveRoute(
  async (security, _request, context: { params: Promise<{ deviceId: string }> }) => {
    const { deviceId } = await context.params;
    return handleRevokeDevice(security, deviceId);
  },
  { cloudHandling: "actor-scoped" },
);
