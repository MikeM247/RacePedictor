import { z } from "zod";

export const operationalUsageSchema = z.object({
  rawStorageBytes: z.number().int().nonnegative(),
  databaseBytes: z.number().int().nonnegative(),
  invocationsDaily: z.number().int().nonnegative(),
  bandwidthBytesDaily: z.number().int().nonnegative(),
  providerRequests15Minutes: z.number().int().nonnegative(),
  providerRequestsDaily: z.number().int().nonnegative(),
}).strict();

export type OperationalUsage = z.infer<typeof operationalUsageSchema>;
export type GuardrailState = "healthy" | "warning" | "hard_stop";

export const DEFAULT_OPERATIONAL_CEILINGS: OperationalUsage = Object.freeze({
  rawStorageBytes: 8 * 1024 * 1024 * 1024,
  databaseBytes: 400 * 1024 * 1024,
  invocationsDaily: 75_000,
  bandwidthBytesDaily: 256 * 1024 * 1024,
  providerRequests15Minutes: 100,
  providerRequestsDaily: 1_000,
});

const labels: Record<keyof OperationalUsage, string> = {
  rawStorageBytes: "Private raw storage",
  databaseBytes: "Structured database",
  invocationsDaily: "Daily function invocations",
  bandwidthBytesDaily: "Daily measured transfer",
  providerRequests15Minutes: "Provider requests (15 minutes)",
  providerRequestsDaily: "Provider requests (daily)",
};

export function evaluateOperationalGuardrails(
  usageInput: OperationalUsage,
  ceilingsInput: OperationalUsage = DEFAULT_OPERATIONAL_CEILINGS,
) {
  const usage = operationalUsageSchema.parse(usageInput);
  const ceilings = operationalUsageSchema.parse(ceilingsInput);
  const signals = (Object.keys(labels) as Array<keyof OperationalUsage>).map((metric) => {
    const ceiling = ceilings[metric];
    if (ceiling < 1) throw new Error("Operational guardrail ceiling must be positive");
    const ratio = usage[metric] / ceiling;
    const state: GuardrailState = ratio >= 0.85 ? "hard_stop" : ratio >= 0.7 ? "warning" : "healthy";
    return Object.freeze({
      metric,
      label: labels[metric],
      value: usage[metric],
      planningCeiling: ceiling,
      warningAt: Math.floor(ceiling * 0.7),
      hardStopAt: Math.floor(ceiling * 0.85),
      state,
      ownerAction: state === "hard_stop"
        ? "Automatic ingestion is paused. Review usage and verified free-tier limits; do not discard accepted data."
        : state === "warning"
          ? "Review usage before enabling additional work."
          : null,
    });
  });
  const state: GuardrailState = signals.some((signal) => signal.state === "hard_stop")
    ? "hard_stop"
    : signals.some((signal) => signal.state === "warning") ? "warning" : "healthy";
  return Object.freeze({
    state,
    processingAllowed: state !== "hard_stop",
    signals: Object.freeze(signals),
    disclaimer: "Planning ceilings are conservative internal controls and must be revalidated against current provider plans before production.",
  });
}

export function summarizeStravaBatch(result: {
  activitiesDiscovered: number;
  outcomes: readonly Readonly<{ state: string }>[];
  failure: null | Readonly<{ state: string }>;
}) {
  const count = (states: readonly string[]) => result.outcomes.filter((outcome) => states.includes(outcome.state)).length;
  return Object.freeze({
    requested: result.activitiesDiscovered,
    fetched: result.activitiesDiscovered,
    retained: count(["applied", "deleted"]),
    normalized: count(["applied"]),
    duplicate: count(["duplicate"]),
    ambiguous: count(["attention"]),
    rejected: count(["terminal"]),
    failed: count(["retry"]) + (result.failure ? 1 : 0),
  });
}
