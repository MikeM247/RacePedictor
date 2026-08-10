import { withSensitiveRoute } from "../../_security.ts";
import { handleEnrollDevice, handleListDevices } from "../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(
  (security, request) => handleListDevices(security, request),
  { cloudHandling: "actor-scoped" },
);

export const POST = withSensitiveRoute(
  (security, request) => handleEnrollDevice(security, request),
  { cloudHandling: "actor-scoped" },
);
