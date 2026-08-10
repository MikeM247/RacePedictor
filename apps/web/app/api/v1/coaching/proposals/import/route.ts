import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withSensitiveRoute } from "../../../_security.ts";
import { CoachingHttpError, readJson, withCoachingService } from "../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function importProposal(request: Request) {
  const body = await readJson(request).catch((error) => error);
  return withCoachingService(async (service) => {
    if (body instanceof Error) throw body;
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > 1024 * 1024) {
      throw new CoachingHttpError(400, "VALIDATION_ERROR", "Plan proposal exceeds the 1 MB limit");
    }
    const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-proposal-"));
    const proposalPath = path.join(directory, "coaching-plan-proposal.v1.json");
    try {
      await writeFile(proposalPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return { proposal: await service.importPlanProposal(proposalPath) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

export const POST = withSensitiveRoute((_security, request) => importProposal(request));
