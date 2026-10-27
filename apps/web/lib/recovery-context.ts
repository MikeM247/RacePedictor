export type RecoveryKind = "home" | "coach" | "training" | "import";
export type CoachRecoveryState = {
  topic: "reflect" | "prepare" | "general";
  selectedRecord?: { type: "activity" | "session"; id: string };
  transcriptAnchorSequence?: number;
  transcriptScrollTop?: number;
};

export type RecoveryContext = {
  version: 1;
  id: string;
  createdAt: number;
  expiresAt: number;
  path: string;
  kind: RecoveryKind;
  source?: "file" | "strava";
  activityId?: string;
  filters?: { search: string; sport: string; from: string; to: string };
  /** Training-only presentation metadata. It deliberately excludes record payloads. */
  draftFilters?: { search: string; sport: string; from: string; to: string };
  loadedDepth?: number;
  /** Opaque list cursors, retained only in the same browser session. */
  loadedCursors?: string[];
  disclosure?: "readiness" | "filters";
  scrollY?: number;
  focusKey?: string;
  /** Bounded Home presentation state; it is never a goal or calculation input. */
  predictionDistanceM?: number;
  detailOpen?: boolean;
  detailScrollY?: number;
  optionalDisclosures?: { telemetry?: boolean; splits?: boolean; route?: boolean };
  issue?: string;
  /** Bounded Coach presentation state; message text stays in tab-local draft storage. */
  coach?: CoachRecoveryState;
};

const storagePrefix = "racepredictor.recovery.v1.";
const maxAgeMs = 2 * 60 * 60 * 1000;
const allowedPaths = new Set(["/dashboard", "/dashboard/coach", "/dashboard/readiness", "/dashboard/activities", "/dashboard/calendar", "/dashboard/plan", "/dashboard/data-quality", "/dashboard/settings"]);
const ids = /^[A-Za-z0-9_-]{8,96}$/u;

export function safeRecoveryPath(value: string | null | undefined, fallback = "/dashboard/activities") {
  if (!value || value.length > 500 || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "https://racepredictor.invalid");
    if (url.origin !== "https://racepredictor.invalid" || !allowedPaths.has(url.pathname)) return fallback;
    const result = new URLSearchParams();
    for (const key of ["activityId", "recovery", "session"] as const) {
      const candidate = url.searchParams.get(key);
      if (candidate && candidate.length <= 128 && /^[A-Za-z0-9:_-]+$/u.test(candidate)) result.set(key, candidate);
    }
    const date = url.searchParams.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/u.test(date)) result.set("date", date);
    const source = url.searchParams.get("source");
    if (url.pathname === "/dashboard/data-quality" && (source === "file" || source === "strava")) result.set("source", source);
    return `${url.pathname}${result.size ? `?${result}` : ""}${url.hash === "#readiness" ? url.hash : ""}`;
  } catch { return fallback; }
}

export function createRecoveryContext(input: Omit<RecoveryContext, "version" | "id" | "createdAt" | "expiresAt" | "path"> & { path?: string }) {
  const now = Date.now();
  const fallbackPath = input.kind === "coach" ? "/dashboard/coach" : input.kind === "home" ? "/dashboard" : "/dashboard/activities";
  const validatedPath = safeRecoveryPath(input.path ?? currentPath(), fallbackPath);
  const context: RecoveryContext = {
    ...input,
    version: 1,
    id: newRecoveryId(),
    createdAt: now,
    expiresAt: now + maxAgeMs,
    path: input.kind === "coach" && validatedPath === "/dashboard" ? "/dashboard/coach" : validatedPath,
    loadedCursors: safeCursors(input.loadedCursors),
  };
  saveRecoveryContext(context);
  return context;
}

export function saveRecoveryContext(context: RecoveryContext) {
  if (typeof window === "undefined") return false;
  try { window.sessionStorage.setItem(`${storagePrefix}${context.id}`, JSON.stringify(context)); return true; }
  catch { return false; }
}

export function readRecoveryContext(id: string | null | undefined): RecoveryContext | null {
  if (typeof window === "undefined" || !id || !ids.test(id)) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${storagePrefix}${id}`) ?? "null") as Partial<RecoveryContext> | null;
    if (!parsed || parsed.version !== 1 || parsed.id !== id || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    const validatedPath = safeRecoveryPath(parsed.path, "");
    const path = parsed.kind === "coach" && validatedPath === "/dashboard"
      ? "/dashboard/coach"
      : parsed.disclosure === "readiness" && validatedPath === "/dashboard"
      ? "/dashboard/readiness"
      : validatedPath;
    if (!path) return null;
    return {
      ...parsed,
      path,
      loadedCursors: safeCursors(parsed.loadedCursors),
      coach: safeCoachRecovery(parsed.coach),
      predictionDistanceM: typeof parsed.predictionDistanceM === "number"
        && Number.isFinite(parsed.predictionDistanceM)
        && parsed.predictionDistanceM >= 1_000
        && parsed.predictionDistanceM <= 100_000
        ? parsed.predictionDistanceM
        : undefined,
    } as RecoveryContext;
  } catch { return null; }
}

function safeCoachRecovery(value: unknown): CoachRecoveryState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.topic !== "reflect" && candidate.topic !== "prepare" && candidate.topic !== "general") return undefined;
  const record = candidate.selectedRecord && typeof candidate.selectedRecord === "object" && !Array.isArray(candidate.selectedRecord)
    ? candidate.selectedRecord as Record<string, unknown>
    : null;
  const selectedRecord = record && (record.type === "activity" || record.type === "session")
    && typeof record.id === "string" && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u.test(record.id)
    ? { type: record.type, id: record.id } as CoachRecoveryState["selectedRecord"]
    : undefined;
  const transcriptAnchorSequence = Number.isSafeInteger(candidate.transcriptAnchorSequence)
    && Number(candidate.transcriptAnchorSequence) >= 0
    ? Number(candidate.transcriptAnchorSequence)
    : undefined;
  const transcriptScrollTop = typeof candidate.transcriptScrollTop === "number"
    && Number.isFinite(candidate.transcriptScrollTop)
    && candidate.transcriptScrollTop >= 0
    && candidate.transcriptScrollTop <= 10_000_000
    ? candidate.transcriptScrollTop
    : undefined;
  return { topic: candidate.topic, selectedRecord, transcriptAnchorSequence, transcriptScrollTop };
}

export function dataQualityHref(context: RecoveryContext, source: "file" | "strava" = "file") {
  const params = new URLSearchParams({ recovery: context.id, source, returnTo: context.path });
  return `/dashboard/data-quality?${params}`;
}

export function recoveryReturnHref(context: RecoveryContext | null, fallback: string) {
  if (!context) return safeRecoveryPath(fallback, "/dashboard/activities");
  const validatedPath = safeRecoveryPath(context.path, fallback);
  const path = context.kind === "coach" && validatedPath === "/dashboard"
    ? "/dashboard/coach"
    : context.disclosure === "readiness" && validatedPath === "/dashboard"
    ? "/dashboard/readiness"
    : validatedPath;
  const url = new URL(path, "https://racepredictor.invalid");
  url.searchParams.set("recovery", context.id);
  return `${url.pathname}?${url.searchParams}`;
}

export function restoreRecoveryFocus(context: RecoveryContext | null) {
  if (!context || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    if (typeof context.scrollY === "number") window.scrollTo({ top: context.scrollY, behavior: "auto" });
    const key = context.focusKey;
    if (!key || !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(key)) return;
    // Detail panels may deliberately announce their heading on load. Restore the
    // originating control after that announcement rather than leaving focus there.
    window.requestAnimationFrame(() => document.getElementById(key)?.focus());
  });
}

function currentPath() {
  if (typeof window === "undefined") return "/dashboard/activities";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
function newRecoveryId() {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return value.replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 96);
}

function safeCursors(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const cursors = value.filter((cursor): cursor is string =>
    typeof cursor === "string" && cursor.length > 0 && cursor.length <= 256 && !/[\r\n]/u.test(cursor),
  );
  return cursors.length > 0 ? [...new Set(cursors)].slice(0, 10) : undefined;
}
