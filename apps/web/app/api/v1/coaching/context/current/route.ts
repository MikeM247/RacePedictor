import { withSensitiveRoute } from "../../../_security.ts";
import { withCoachingService } from "../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getCurrentContext() {
  return withCoachingService(async (service) => ({ context: await service.getCurrentContext() }));
}

export const GET = withSensitiveRoute(() => getCurrentContext());
