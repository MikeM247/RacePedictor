export type CalendarSessionView = {
  id: string;
  title: string;
  kind: string;
  purpose: string;
  prescription: string;
  cautions: string[];
  durationMinutes: number;
  distanceMeters?: number;
  intensityRpe?: number;
  startTime?: string;
  scheduledDate: string;
  prescribedDate: string;
  effectiveDate: string;
  originalDate: string;
  status: "upcoming" | "skipped";
  revision: number;
  warnings: string[];
  original: CalendarSessionOriginal;
  amendments: CalendarSessionAmendmentView[];
};

export type HistoricalCalendarSessionView = CalendarSessionView & {
  planId: string;
  planVersion: number;
};

export type CalendarActivityView = {
  id: string;
  localDate: string;
  title: string;
  sport: string;
  distanceMeters: number;
  elapsedTimeSeconds: number;
  averagePaceSecondsPerKm: number;
  elevationGainMeters: number;
};

export type CalendarSessionOriginal = {
  id: string;
  title: string;
  kind: string;
  purpose: string;
  prescription: string;
  cautions: string[];
  durationMinutes: number;
  distanceMeters?: number;
  intensityRpe?: number;
  startTime?: string;
  scheduledDate: string;
};

export type CalendarSessionAmendmentView = {
  id: string;
  operation: "amend" | "reschedule" | "skip" | "restore";
  changedAt: string;
  reason: string;
  changedFields: string[];
  resultingRevision: number;
};

export type ReminderExternalStatus = "not_configured" | "prepared" | "scheduled" | "attention" | "disabled";

export function localDateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function weekRange(date: string): { from: string; to: string } {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid calendar date");
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  const from = parsed.toISOString().slice(0, 10);
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return { from, to: parsed.toISOString().slice(0, 10) };
}

export function formatCoachingDate(date: string, timezone = "Africa/Johannesburg"): string {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: timezone }).format(
    new Date(`${date}T12:00:00.000Z`),
  );
}

export function normalizeCalendarSessions(payload: unknown): CalendarSessionView[] {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : record;
  const raw = Array.isArray(nested.sessions) ? nested.sessions : Array.isArray(nested.items) ? nested.items : [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = String(item.id ?? "");
    const effectiveDate = String(item.effectiveDate ?? item.scheduledDate ?? "");
    const prescribedDate = String(item.prescribedDate ?? item.originalDate ?? effectiveDate);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !/^\d{4}-\d{2}-\d{2}$/.test(prescribedDate)) return [];
    const status = item.status === "skipped" ? "skipped" : "upcoming";
    const originalRecord = item.original && typeof item.original === "object"
      ? item.original as Record<string, unknown>
      : {};
    const original: CalendarSessionOriginal = {
      id: String(originalRecord.id ?? id),
      title: String(originalRecord.title ?? item.title ?? "Training session"),
      kind: String(originalRecord.kind ?? item.kind ?? item.sessionType ?? "run"),
      purpose: String(originalRecord.purpose ?? item.purpose ?? item.intent ?? "Follow the approved prescription."),
      prescription: String(originalRecord.prescription ?? item.prescription ?? "Follow the approved prescription."),
      cautions: Array.isArray(originalRecord.cautions)
        ? originalRecord.cautions.map(String)
        : Array.isArray(item.cautions) ? item.cautions.map(String) : [],
      durationMinutes: Number(originalRecord.durationMinutes ?? item.durationMinutes ?? 0),
      ...(typeof originalRecord.distanceMeters === "number" && originalRecord.distanceMeters > 0
        ? { distanceMeters: originalRecord.distanceMeters }
        : typeof item.distanceMeters === "number" && item.distanceMeters > 0 ? { distanceMeters: item.distanceMeters } : {}),
      ...(typeof originalRecord.intensityRpe === "number" && originalRecord.intensityRpe > 0
        ? { intensityRpe: originalRecord.intensityRpe }
        : typeof item.intensityRpe === "number" && item.intensityRpe > 0 ? { intensityRpe: item.intensityRpe } : {}),
      ...(typeof originalRecord.startTime === "string" && originalRecord.startTime
        ? { startTime: originalRecord.startTime }
        : typeof item.startTime === "string" && item.startTime ? { startTime: item.startTime } : {}),
      scheduledDate: String(originalRecord.scheduledDate ?? prescribedDate),
    };
    const amendments: CalendarSessionAmendmentView[] = Array.isArray(item.amendments)
      ? item.amendments.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const amendment = value as Record<string, unknown>;
        const operation = amendment.operation;
        const reason = typeof amendment.reason === "string" ? amendment.reason.trim() : "";
        if (operation !== "amend" && operation !== "reschedule" && operation !== "skip" && operation !== "restore") return [];
        if (!reason) return [];
        return [{
          id: String(amendment.id ?? `${id}-${String(amendment.resultingRevision ?? "change")}`),
          operation,
          changedAt: String(amendment.changedAt ?? ""),
          reason,
          changedFields: Array.isArray(amendment.changedFields) ? amendment.changedFields.map(String) : [],
          resultingRevision: Number(amendment.resultingRevision ?? item.revision ?? 1),
        }];
      })
      : [];
    return [{
      id,
      title: String(item.title ?? "Training session"),
      kind: String(item.kind ?? item.sessionType ?? "run"),
      purpose: String(item.purpose ?? item.intent ?? "Follow the approved prescription."),
      prescription: String(item.prescription ?? "Follow the approved prescription."),
      cautions: Array.isArray(item.cautions) ? item.cautions.map(String) : [],
      durationMinutes: Number(item.durationMinutes ?? 0),
      ...(typeof item.distanceMeters === "number" && item.distanceMeters > 0 ? { distanceMeters: item.distanceMeters } : {}),
      ...(typeof item.intensityRpe === "number" && item.intensityRpe > 0 ? { intensityRpe: item.intensityRpe } : {}),
      ...(typeof item.startTime === "string" && item.startTime ? { startTime: item.startTime } : {}),
      scheduledDate: effectiveDate,
      prescribedDate,
      effectiveDate,
      originalDate: prescribedDate,
      status,
      revision: Number(item.revision ?? 1),
      warnings: Array.isArray(item.warnings) ? item.warnings.map(String) : [],
      original,
      amendments,
    }];
  });
}

export function normalizeHistoricalCalendarSessions(payload: unknown): HistoricalCalendarSessionView[] {
  const nested = calendarPayload(payload);
  const raw = Array.isArray(nested.historicalSessions) ? nested.historicalSessions : [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const planId = typeof item.planId === "string" ? item.planId : "";
    const planVersion = Number(item.planVersion);
    if (!planId || !Number.isInteger(planVersion) || planVersion < 1) return [];
    const [session] = normalizeCalendarSessions({ sessions: [{
      ...item,
      effectiveDate: item.scheduledDate,
      prescribedDate: item.scheduledDate,
      originalDate: item.scheduledDate,
      status: "upcoming",
      revision: planVersion,
      original: item,
      amendments: [],
      warnings: [],
    }] });
    return session ? [{ ...session, planId, planVersion }] : [];
  });
}

export function normalizeCalendarActivities(payload: unknown): CalendarActivityView[] {
  const nested = calendarPayload(payload);
  const raw = Array.isArray(nested.activities) ? nested.activities : [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const localDate = typeof item.localDate === "string" ? item.localDate : "";
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return [];
    return [{
      id,
      localDate,
      title: typeof item.title === "string" && item.title.trim() ? item.title : "Recorded run",
      sport: typeof item.sport === "string" ? item.sport : "run",
      distanceMeters: Number(item.distanceM ?? 0),
      elapsedTimeSeconds: Number(item.elapsedTimeS ?? 0),
      averagePaceSecondsPerKm: Number(item.avgPaceSecPerKm ?? 0),
      elevationGainMeters: Number(item.elevationGainM ?? 0),
    }];
  });
}

function calendarPayload(payload: unknown): Record<string, unknown> {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : record;
}

export function canAmendFutureSession(session: Pick<CalendarSessionView, "effectiveDate">, currentLocalDate: string): boolean {
  return session.effectiveDate > currentLocalDate;
}

export function changeHistoryLabel(amendment: CalendarSessionAmendmentView): string {
  const fields = amendment.changedFields.length > 0
    ? amendment.changedFields.join(", ")
    : amendment.operation;
  return `${amendment.operation} · ${fields} · revision ${amendment.resultingRevision}`;
}

export function formatSessionTarget(session: CalendarSessionView): string {
  const details = [
    session.distanceMeters ? `${Number((session.distanceMeters / 1000).toFixed(2))} km` : null,
    session.durationMinutes ? `${session.durationMinutes} min` : null,
    session.intensityRpe ? `RPE ${session.intensityRpe}` : null,
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "Follow the approved prescription";
}

export function formatAdjustmentCue(session: CalendarSessionView): string {
  if (session.status === "skipped") return `Adjustment history: skipped · revision ${session.revision}.`;
  if (session.effectiveDate !== session.prescribedDate) {
    return `Adjustment history: moved from ${session.prescribedDate} to ${session.effectiveDate} · revision ${session.revision}.`;
  }
  return session.revision > 1
    ? `Adjustment history: schedule revision ${session.revision}.`
    : "No schedule adjustments.";
}

export function outOfPlanRangeWarning(
  targetDate: string,
  planRange: { startsOn: string; endsOn: string } | null,
): string | null {
  if (!planRange || (targetDate >= planRange.startsOn && targetDate <= planRange.endsOn)) return null;
  return `Outside approved plan range: choose a date from ${planRange.startsOn} to ${planRange.endsOn}.`;
}

export function formatApiErrorDetails(details: unknown): string[] {
  if (Array.isArray(details)) return details.flatMap(formatApiErrorDetails);
  if (!details || typeof details !== "object") return [];
  const issue = details as Record<string, unknown>;
  if (typeof issue.message !== "string") return [];
  const path = Array.isArray(issue.path) ? issue.path.map(String).join(".") : "";
  return [`${path ? `${path}: ` : ""}${issue.message}`];
}

export function normalizeReminderExternalStatus(value: unknown): ReminderExternalStatus {
  return value === "prepared" || value === "scheduled" || value === "attention" || value === "disabled"
    ? value
    : "not_configured";
}

export function handoffStatusLabel(status: ReminderExternalStatus): string {
  if (status === "prepared") return "Prepared for Codex";
  if (status === "scheduled") return "Confirmed scheduled";
  if (status === "attention") return "Needs attention";
  if (status === "disabled") return "Disabled";
  return "Not generated";
}

export function externalAutomationStatusLabel(status: ReminderExternalStatus): string {
  if (status === "prepared") return "Not scheduled — handoff prepared";
  if (status === "scheduled") return "Scheduled externally — user confirmed";
  if (status === "attention") return "External setup needs attention";
  if (status === "disabled") return "Disabled";
  return "Not configured";
}

export function sameDayConflictWarning(
  sessions: CalendarSessionView[],
  sessionId: string,
  targetDate: string,
): string | null {
  const conflicts = sessions.filter((session) => session.id !== sessionId
    && session.status !== "skipped"
    && session.effectiveDate === targetDate);
  if (conflicts.length === 0) return null;
  const titles = conflicts.map((session) => session.title).join(", ");
  return `Same-day conflict: ${titles} ${conflicts.length === 1 ? "is" : "are"} already scheduled for ${targetDate}.`;
}
