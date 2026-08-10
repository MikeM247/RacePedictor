import { withSensitiveRoute } from "../../../_security.ts";
import { withCoachingService } from "../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getLatestProposal() {
  return withCoachingService((service) => ({ proposal: service.getLatestProposal() }));
}

export const GET = withSensitiveRoute(() => getLatestProposal());
