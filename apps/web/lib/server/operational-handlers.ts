import { randomUUID } from "node:crypto";
import { evaluateOperationalGuardrails } from "../../../../packages/core/src/services/operational-guardrails.ts";
import { ApiHttpError, success } from "./api-response.ts";
import { getOperationalComposition } from "./operational-composition.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

export type OperationalComposition = ReturnType<typeof getOperationalComposition>;

export async function handleScheduledReconciliation(
  _request: Request,
  getComposition: () => OperationalComposition = getOperationalComposition,
) {
  const composition = getComposition();
  await composition.usage.recordInvocation();
  return success(await composition.reconciliation.run({ workerId: `cron:${randomUUID()}`, maxAthletes: 25, maxJobs: 25 }));
}

export async function handleOperationalStatus(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: () => OperationalComposition = getOperationalComposition,
) {
  if (security.mode !== "authenticated") throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Operations status is unavailable in local mode");
  return success(evaluateOperationalGuardrails(await getComposition().usage.readUsage()));
}
