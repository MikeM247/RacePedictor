import { todayApiResponseSchema } from "../../../packages/core/src/contracts/coaching.ts";

export type SettledTarget = {
  title: string;
  targetDate: string;
  countdown: string;
};

export type TargetContextState =
  | { kind: "loading"; previous: SettledTarget | null }
  | { kind: "target"; target: SettledTarget }
  | { kind: "absence" }
  | { kind: "failed"; previous: SettledTarget | null; authorizationLost: boolean };

export const initialTargetContextState: TargetContextState = { kind: "loading", previous: null };

/** Keeps an older asynchronous target response from replacing a newer retry. */
export function createTargetRequestGate() {
  let generation = 0;
  return {
    begin() { generation += 1; return generation; },
    isCurrent(candidate: number) { return candidate === generation; },
  };
}

export function targetContextLoading(previous: SettledTarget | null): TargetContextState {
  return { kind: "loading", previous };
}

export function targetContextFromResponse(response: Response, payload: unknown, previous: SettledTarget | null): TargetContextState {
  if (!response.ok) {
    return {
      kind: "failed",
      previous: response.status === 401 || response.status === 403 ? null : previous,
      authorizationLost: response.status === 401 || response.status === 403,
    };
  }
  const parsed = todayApiResponseSchema.safeParse(payload);
  if (!parsed.success) return { kind: "failed", previous, authorizationLost: false };
  const goal = parsed.data.data.goal;
  if (goal === null) return { kind: "absence" };
  return {
    kind: "target",
    target: { title: goal.title, targetDate: goal.targetDate, countdown: goal.countdown.label },
  };
}

export function targetContextFromNetworkFailure(previous: SettledTarget | null): TargetContextState {
  return { kind: "failed", previous, authorizationLost: false };
}

export function retainedTarget(state: TargetContextState): SettledTarget | null {
  return state.kind === "target" ? state.target : state.kind === "loading" || state.kind === "failed" ? state.previous : null;
}
