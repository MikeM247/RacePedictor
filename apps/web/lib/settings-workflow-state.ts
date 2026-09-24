import type { ReminderExternalStatus } from "./coaching-ui-state";

export type SettingsReadState<T> =
  | { status: "loading"; data?: T; checkedAt?: number }
  | { status: "ready"; data: T; checkedAt: number }
  | { status: "refreshing"; data: T; checkedAt: number }
  | { status: "error"; data?: T; checkedAt?: number; message: string };

export type ReminderDraft = Readonly<{ enabled: boolean; localTime: string; timezone: string }>;

export function settingsReadError<T>(previous: SettingsReadState<T>, message: string): SettingsReadState<T> {
  return previous.status === "ready" || previous.status === "refreshing" || (previous.status === "error" && previous.data)
    ? { status: "error", data: previous.data, checkedAt: previous.checkedAt, message }
    : { status: "error", message };
}

export function hasUnsavedReminderChanges(baseline: ReminderDraft | null, draft: ReminderDraft): boolean {
  return baseline === null
    || baseline.enabled !== draft.enabled
    || baseline.localTime !== draft.localTime
    || baseline.timezone !== draft.timezone;
}

export type ReminderStage = "preferences-unavailable" | "editing" | "ready" | "continue" | "confirm" | "scheduled" | "attention" | "disabled";

export function reminderStage(input: {
  preferencesAvailable: boolean;
  dirty: boolean;
  enabled: boolean;
  externalStatus: ReminderExternalStatus;
  generatedHandoff: boolean;
  continuing: boolean;
}): ReminderStage {
  if (!input.preferencesAvailable) return "preferences-unavailable";
  if (input.dirty) return "editing";
  if (!input.enabled || input.externalStatus === "disabled") return "disabled";
  if (input.externalStatus === "scheduled") return "scheduled";
  if (input.externalStatus === "attention") return "attention";
  if (input.externalStatus === "prepared" && !input.generatedHandoff) return "confirm";
  if (input.continuing) return "confirm";
  if (input.generatedHandoff) return "continue";
  return "ready";
}

/** A generated file reference belongs to the artifact, never to the runner's external task input. */
export function externalTaskReference(persistedStatus: ReminderExternalStatus, persistedReference: string | null): string {
  return persistedStatus === "scheduled" && persistedReference ? persistedReference : "";
}

export function shouldRecoverBeforeRetry(ambiguous: boolean): boolean {
  return ambiguous;
}
