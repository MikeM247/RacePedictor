export type JsonRecord = Record<string, unknown>;

export type HistoryCoverage = {
  athleteId: string;
  activityCount: number;
  earliestOccurredAt: string | null;
  latestOccurredAt: string | null;
  totalDistanceM: number;
  sourceTypes: string[];
};

export type CoachingProfile = {
  athleteId: string;
  displayName: string | null;
  timezone: string;
  preferredUnits: "metric" | "imperial";
  motivation: string | null;
  constraints: JsonRecord;
  preferences: JsonRecord;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CoachingGoal = {
  id: string;
  athleteId: string;
  version: number;
  lifecycle: "draft" | "settled" | "superseded";
  isPrimary: boolean;
  goalType: string;
  title: string;
  targetDate: string | null;
  details: JsonRecord;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  supersededAt: string | null;
};

export type RoutineDay = {
  dayOfWeek: number;
  available: boolean;
  maxDurationMinutes: number | null;
  preferredTime: string | null;
  notes: string | null;
};

export type CoachingRoutine = {
  athleteId: string;
  sessionsPerWeek: number | null;
  longRunDay: number | null;
  timezone: string;
  preferences: JsonRecord;
  revision: number;
  createdAt: string;
  updatedAt: string;
  days: RoutineDay[];
};

export type ContextSnapshot = {
  id: string;
  athleteId: string;
  inputChecksum: string;
  historyCoverage: HistoryCoverage;
  metadata: JsonRecord;
  createdAt: string;
};

export type PlannedWorkout = {
  id: string;
  planId: string;
  athleteId: string;
  /** Effective calendar date retained for backward-compatible consumers. */
  localDate: string;
  prescribedLocalDate: string;
  effectiveLocalDate: string;
  calendarStatus: "upcoming" | "skipped";
  position: number;
  title: string;
  workoutType: string;
  durationMinutes: number | null;
  distanceM: number | null;
  intensity: string | null;
  details: JsonRecord;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CoachingPlan = {
  id: string;
  athleteId: string;
  version: number;
  goalId: string;
  contextSnapshotId: string | null;
  lifecycle: "proposal" | "active" | "superseded";
  title: string;
  startDate: string;
  endDate: string;
  summary: JsonRecord;
  revision: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  supersededAt: string | null;
  workouts: PlannedWorkout[];
};

export type DailyBrief = {
  id: string;
  athleteId: string;
  localDate: string;
  planId: string | null;
  workoutId: string | null;
  message: string;
  payload: JsonRecord;
  source: string;
  generatedAt: string;
  updatedAt: string;
};

export type ReminderPreferences = {
  athleteId: string;
  enabled: boolean;
  localTime: string;
  timezone: string;
  deliveryChannel: string;
  externalStatus: "not_configured" | "prepared" | "scheduled" | "attention" | "disabled";
  externalReference: string | null;
  preferences: JsonRecord;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanAuditEvent = {
  id: string;
  athleteId: string;
  planId: string;
  workoutId: string | null;
  eventType: string;
  event: JsonRecord;
  createdAt: string;
};

export class CoachingRepositoryError extends Error {
  code: string;
  details?: unknown;
}

export type LocalCoachingRepository = {
  athleteId: string;
  close(): void;
  saveProfile(input?: Partial<Pick<CoachingProfile,
    "displayName" | "timezone" | "preferredUnits" | "motivation" | "constraints" | "preferences"
  >>): CoachingProfile;
  loadProfile(): CoachingProfile | null;
  saveRoutine(input: {
    sessionsPerWeek?: number | null;
    longRunDay?: number | null;
    timezone?: string;
    preferences?: JsonRecord;
    days: Array<Partial<Omit<RoutineDay, "dayOfWeek">> & { dayOfWeek: number }>;
  }): CoachingRoutine;
  loadRoutine(): CoachingRoutine | null;
  createGoal(input: {
    goalType: string;
    title: string;
    targetDate?: string | null;
    isPrimary?: boolean;
    details?: JsonRecord;
  }): CoachingGoal;
  settleGoal(goalId: string): CoachingGoal;
  loadGoal(goalId: string): CoachingGoal | null;
  loadSettledGoal(): CoachingGoal | null;
  listGoals(): CoachingGoal[];
  saveContextSnapshot(input?: { inputChecksum?: string; metadata?: JsonRecord }): ContextSnapshot;
  getLatestContextSnapshot(): ContextSnapshot | null;
  saveValidatedPlan(input: {
    goalId: string;
    contextSnapshotId?: string | null;
    title: string;
    startDate: string;
    endDate: string;
    summary?: JsonRecord;
    workouts: Array<{
      id?: string;
      localDate: string;
      position?: number;
      title: string;
      workoutType: string;
      durationMinutes?: number | null;
      distanceM?: number | null;
      intensity?: string | null;
      details?: JsonRecord;
    }>;
  }): CoachingPlan;
  withdrawPlan(input: {
    planId: string;
    expectedRevision: number;
    actor?: string;
    reason?: string;
  }): CoachingPlan;
  activatePlan(planId: string, options?: {
    expectedRevision?: number;
    sourceHistoryFingerprint?: string;
    acknowledgedHistoryFingerprint?: string;
  }): CoachingPlan;
  loadPlan(planId: string): CoachingPlan | null;
  listPlans(): CoachingPlan[];
  loadActivePlan(): CoachingPlan | null;
  adjustWorkout(input: {
    workoutId: string;
    operation: "reschedule" | "skip" | "restore";
    toDate?: string | null;
    expectedRevision: number;
    actor?: string;
    reason?: string | null;
    requestedAt?: string | null;
  }): PlannedWorkout;
  moveWorkout(input: {
    workoutId: string;
    toDate: string;
    expectedRevision: number;
    reason?: string | null;
  }): PlannedWorkout;
  storeDailyBrief(input: {
    localDate: string;
    message: string;
    payload?: JsonRecord;
    planId?: string | null;
    workoutId?: string | null;
    source?: string;
    generatedAt?: string;
  }): DailyBrief;
  getDailyBrief(localDate: string): DailyBrief | null;
  saveReminderPreferences(input?: Partial<{
    enabled: boolean;
    localTime: string;
    timezone: string;
    deliveryChannel: string;
    externalStatus: ReminderPreferences["externalStatus"];
    externalReference: string | null;
    preferences: JsonRecord;
  }>): ReminderPreferences;
  loadReminderPreferences(): ReminderPreferences | null;
  getHistoryCoverage(): HistoryCoverage;
  listPlanAuditEvents(input: { planId: string; limit?: number }): PlanAuditEvent[];
};

export function createLocalCoachingRepository(options: {
  databasePath: string;
  athleteId?: string;
  clock?: () => Date | string | number;
  idFactory?: () => string;
}): LocalCoachingRepository;
