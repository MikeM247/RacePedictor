import { athleteScopeFor, buildActorContext } from "../contracts/auth.ts";
import type { OperationalUsage } from "../services/operational-guardrails.ts";
import { evaluateOperationalGuardrails } from "../services/operational-guardrails.ts";
import type { StravaIngestionJobProcessor } from "./strava-ingestion-worker.ts";

export interface ScheduledReconciliationDependencies {
  listConnectedAthleteIds(limit: number): Promise<readonly string[]>;
  processor: Pick<StravaIngestionJobProcessor, "enqueueReconciliation" | "processNext">;
  readUsage(): Promise<OperationalUsage>;
  now(): Date;
}

export class ScheduledReconciliationService {
  readonly #dependencies: ScheduledReconciliationDependencies;

  constructor(dependencies: ScheduledReconciliationDependencies) {
    this.#dependencies = dependencies;
  }

  async run(input: { workerId: string; maxAthletes?: number; maxJobs?: number }) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/u.test(input.workerId)) throw new Error("Reconciliation worker id is invalid");
    const maxAthletes = bounded(input.maxAthletes ?? 25, 1, 25, "athlete limit");
    const maxJobs = bounded(input.maxJobs ?? 25, 1, 25, "job limit");
    const guardrails = evaluateOperationalGuardrails(await this.#dependencies.readUsage());
    if (!guardrails.processingAllowed) {
      return Object.freeze({ state: "paused" as const, enqueued: 0, reused: 0, processed: 0, outcomes: {}, guardrails });
    }
    const before = floorToHour(this.#dependencies.now());
    const after = new Date(before.getTime() - 48 * 60 * 60 * 1_000);
    const athleteIds = await this.#dependencies.listConnectedAthleteIds(maxAthletes);
    let enqueued = 0;
    let reused = 0;
    for (const athleteId of athleteIds) {
      const actor = buildActorContext({
        userId: "worker:reconciliation",
        permittedAthleteIds: [athleteId],
        activeAthleteId: athleteId,
        requestId: `reconcile:${before.getTime()}`,
        credentialKind: "internal",
      });
      const result = await this.#dependencies.processor.enqueueReconciliation(athleteScopeFor(actor), {
        after: after.toISOString(), before: before.toISOString(), pageSize: 30, maxPages: 3, maxActivities: 90,
      });
      if (result.reused) reused += 1; else enqueued += 1;
    }
    const outcomes: Record<string, number> = {};
    let processed = 0;
    for (let index = 0; index < maxJobs; index += 1) {
      const outcome = await this.#dependencies.processor.processNext(`${input.workerId}:${index}`);
      if (outcome.state === "not_available") break;
      processed += 1;
      outcomes[outcome.state] = (outcomes[outcome.state] ?? 0) + 1;
      // A deferred Strava batch has reached the shared application budget.
      // Leave its durable availableAt checkpoint for the next scheduled pass
      // rather than repeatedly claiming work in the same provider window.
      if (outcome.state === "deferred") break;
    }
    return Object.freeze({ state: "completed" as const, enqueued, reused, processed, outcomes: Object.freeze(outcomes), guardrails });
  }
}

function floorToHour(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error("Reconciliation time is invalid");
  const result = new Date(date);
  result.setUTCMinutes(0, 0, 0);
  return result;
}

function bounded(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Reconciliation ${label} is invalid`);
  return value;
}
