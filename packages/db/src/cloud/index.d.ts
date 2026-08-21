import type {
  ProviderConnectionRepository,
  ProviderOAuthAttemptRepository,
  RawObjectStore,
} from "../../../core/src/ports/cloud-sync.ts";
import type { StravaIngestionJobRepository } from "../../../core/src/ports/strava-ingestion-worker.ts";
import type {
  StravaCredentialPort,
  StravaIngestionUnitOfWork,
  StravaReadRequestBudget,
} from "../../../core/src/ports/strava-ingestion.ts";
import type { StravaConnectionService } from "../../../core/src/use-cases/strava-connection.ts";
import type { AthleteScope } from "../../../core/src/contracts/auth.ts";
import type { OnlineStatusFacts } from "../../../core/src/services/online-status.ts";
import type { ActivitiesListResponse, ActivityDetail } from "../../../core/src/contracts/activity.ts";
import type { DashboardFetchResult } from "../../../core/src/contracts/dashboard.ts";
import type { CoachingReviewContext, SessionAmendment, TrainingPlan } from "../../../core/src/contracts/coaching.ts";
import type { SyncChangesQuery } from "../../../core/src/contracts/sync.ts";
import type { PairedDeviceRepository, SecondBrainSnapshotRepository, TrainingPlanProjectionPublisher } from "../../../core/src/ports/cloud-sync.ts";
import type { IdentityRepository } from "../../../core/src/ports/cloud-sync.ts";

export interface CredentialEnvelope {
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  credentialKeyVersion: string;
}

export class CredentialEnvelopeCrypto {
  constructor(input: {
    activeKeyVersion: string;
    keys: Readonly<Record<string, string | Uint8Array>> | ReadonlyMap<string, string | Uint8Array>;
  });
  seal(credentials: Readonly<Record<string, unknown>>, binding: {
    athleteId: string;
    provider: string;
  }): CredentialEnvelope;
  open(envelope: CredentialEnvelope, binding: {
    athleteId: string;
    provider: string;
  }): Readonly<Record<string, unknown>>;
}

export class PrismaProviderConnectionRepository implements ProviderConnectionRepository {
  constructor(input: { prisma: unknown; credentialCrypto: CredentialEnvelopeCrypto });
  get: ProviderConnectionRepository["get"];
  beginConnecting: ProviderConnectionRepository["beginConnecting"];
  saveCredentials: ProviderConnectionRepository["saveCredentials"];
  getCredentials: ProviderConnectionRepository["getCredentials"];
  rotateCredentials: ProviderConnectionRepository["rotateCredentials"];
  recordFailure: ProviderConnectionRepository["recordFailure"];
  disconnect: ProviderConnectionRepository["disconnect"];
  revoke: ProviderConnectionRepository["revoke"];
}

export class PrismaProviderOAuthAttemptRepository implements ProviderOAuthAttemptRepository {
  constructor(input: { prisma: unknown });
  create: ProviderOAuthAttemptRepository["create"];
  consume: ProviderOAuthAttemptRepository["consume"];
}

export function getCloudPrismaClient(): unknown;

export class PrismaStravaIngestionJobRepository implements StravaIngestionJobRepository {
  constructor(input: { prisma: unknown });
  enqueueBatch: StravaIngestionJobRepository["enqueueBatch"];
  claimNext: StravaIngestionJobRepository["claimNext"];
  claimById: StravaIngestionJobRepository["claimById"];
  markCompleted: StravaIngestionJobRepository["markCompleted"];
  markRetry: StravaIngestionJobRepository["markRetry"];
  markDeferred: StravaIngestionJobRepository["markDeferred"];
  markTerminal: StravaIngestionJobRepository["markTerminal"];
  markDeadLetter: StravaIngestionJobRepository["markDeadLetter"];
}

export class R2RawObjectStore implements RawObjectStore {
  constructor(input: {
    bucket: string;
    endpoint: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  });
  put: RawObjectStore["put"];
  head: RawObjectStore["head"];
  createPresignedGet: RawObjectStore["createPresignedGet"];
}

export class StravaCredentialAdapter implements StravaCredentialPort {
  constructor(input: {
    connections: ProviderConnectionRepository;
    connectionService: StravaConnectionService;
    now?: () => Date;
    refreshWindowSeconds?: number;
  });
  getAccessToken: StravaCredentialPort["getAccessToken"];
  refreshAccessToken: StravaCredentialPort["refreshAccessToken"];
}

export class PrismaStravaIngestionUnitOfWork implements StravaIngestionUnitOfWork {
  constructor(input: { prisma: unknown });
  run: StravaIngestionUnitOfWork["run"];
}

export class CloudActivityCursorError extends Error {
  readonly code: "INVALID_CURSOR";
}

export class PrismaCloudActivityRepository {
  constructor(input: { prisma: unknown });
  list(scope: AthleteScope, input?: {
    cursor?: string | null;
    limit?: number;
    sport?: string | null;
    search?: string | null;
    from?: string | null;
    to?: string | null;
  }): Promise<ActivitiesListResponse>;
  findById(scope: AthleteScope, activityId: string): Promise<ActivityDetail | null>;
}

export class PrismaCloudDashboardRepository {
  constructor(input: { prisma: unknown });
  getOverview(scope: AthleteScope, generatedAt?: Date): Promise<DashboardFetchResult>;
}

export class CloudCoachingProjectionError extends Error {
  readonly code: "INCONSISTENT_PROJECTION";
}

export class PrismaCloudCoachingRepository {
  constructor(input: { prisma: unknown });
  getActivePlan(scope: AthleteScope): Promise<TrainingPlan | null>;
  listHistory(scope: AthleteScope): Promise<readonly TrainingPlan[]>;
  findPlan(scope: AthleteScope, planId: string): Promise<TrainingPlan | null>;
}

export class PrismaOnlineStatusRepository {
  constructor(input: { prisma: unknown });
  getFacts(scope: AthleteScope): Promise<OnlineStatusFacts>;
}

export class CloudSyncCursorError extends Error {
  readonly code: "INVALID_CURSOR";
}

export class PrismaSyncChangeRepository {
  constructor(input: { prisma: unknown });
  list(scope: AthleteScope, input: SyncChangesQuery): Promise<{
    changes: readonly import("../../../core/src/contracts/sync.ts").SyncChange[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
}

export class PrismaPairedDeviceRepository implements PairedDeviceRepository {
  constructor(input: { prisma: unknown });
  enroll: PairedDeviceRepository["enroll"];
  list: PairedDeviceRepository["list"];
  findCredential: PairedDeviceRepository["findCredential"];
  acknowledge: PairedDeviceRepository["acknowledge"];
  recordFailure: PairedDeviceRepository["recordFailure"];
  revoke: PairedDeviceRepository["revoke"];
}

export class SecondBrainSnapshotConflictError extends Error {
  readonly code: "REVISION_CONFLICT" | "DUPLICATE_CONTENT" | "STALE_REVISION" | "REVISION_GAP";
}

export class PrismaSecondBrainSnapshotRepository implements SecondBrainSnapshotRepository {
  constructor(input: { prisma: unknown });
  storeImmutable(scope: AthleteScope, snapshot: import("../../../core/src/contracts/second-brain-context.ts").SecondBrainContextSnapshot, pairedDeviceId?: string): ReturnType<SecondBrainSnapshotRepository["storeImmutable"]>;
  latest: SecondBrainSnapshotRepository["latest"];
}

export class TrainingPlanProjectionConflictError extends Error {
  readonly code: "PLAN_PROJECTION_CONFLICT";
}

export class PrismaTrainingPlanProjectionPublisher implements TrainingPlanProjectionPublisher {
  constructor(input: { prisma: unknown; now?: () => Date });
  publishApproved: TrainingPlanProjectionPublisher["publishApproved"];
}

export class TrainingPlanActivationError extends Error {
  readonly code: "SESSION_REQUIRED" | "PLAN_NOT_FOUND" | "PLAN_NOT_APPROVED" | "PLAN_ACTIVATION_CONFLICT" | "INCONSISTENT_PROJECTION";
  constructor(code: TrainingPlanActivationError["code"], message: string);
}

export class PrismaTrainingPlanProjectionActivator {
  constructor(input: { prisma: unknown; now?: () => Date });
  activate(scope: AthleteScope, planId: string, expectedActivePlanId: string | null): Promise<{
    activePlan: TrainingPlan;
    retiredPlan: TrainingPlan | null;
    reused: boolean;
  }>;
}

export class CalendarSessionAmendmentError extends Error {
  readonly code: "SESSION_REQUIRED" | "SESSION_NOT_FOUND" | "FUTURE_ONLY" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "INVALID_STATE" | "INCONSISTENT_PROJECTION" | "VALIDATION_ERROR";
  constructor(code: CalendarSessionAmendmentError["code"], message: string);
}

export interface CloudCalendarSession {
  id: string;
  kind: "run" | "strength" | "cross_train" | "rest";
  scheduledDate: string;
  startTime?: string;
  title: string;
  purpose: string;
  prescription: string;
  cautions: string[];
  durationMinutes: number;
  distanceMeters?: number;
  intensityRpe?: number;
  prescribedDate: string;
  effectiveDate: string;
  originalDate: string;
  status: "upcoming" | "skipped";
  revision: number;
  warnings: string[];
  original?: TrainingPlan["workouts"][number];
  amendments: SessionAmendment[];
}

export class PrismaCalendarSessionAmendmentRepository {
  constructor(input: { prisma: unknown; now?: () => Date });
  listActiveCalendar(scope: AthleteScope, input: { from: string; to: string }): Promise<CloudCalendarSession[]>;
  getActiveSession(scope: AthleteScope, sessionId: string): Promise<CloudCalendarSession | null>;
  listHistory(scope: AthleteScope, sessionId: string): Promise<SessionAmendment[]>;
  getReviewContext(scope: AthleteScope): Promise<CoachingReviewContext | null>;
  amend(scope: AthleteScope, sessionId: string, input: {
    operation: "amend" | "reschedule" | "skip" | "restore";
    expectedRevision: number;
    reason: string;
    idempotencyKey: string;
    changes: Record<string, unknown>;
  }): Promise<{ session: CloudCalendarSession | null; amendment: SessionAmendment; reused: boolean }>;
}

export class PrismaOperationalUsageRepository {
  constructor(input: { prisma: unknown });
  recordInvocation(occurredAt?: Date): Promise<unknown>;
  recordBandwidth(bytes: number, occurredAt?: Date): Promise<unknown>;
  recordProviderResponse(bytes: number, occurredAt?: Date): Promise<void>;
  reserve(input: Parameters<StravaReadRequestBudget["reserve"]>[0]): ReturnType<StravaReadRequestBudget["reserve"]>;
  readUsage(occurredAt?: Date): Promise<import("../../../core/src/services/operational-guardrails.ts").OperationalUsage>;
}

export class PrismaReconciliationScopeRepository {
  constructor(input: { prisma: unknown });
  listConnectedAthleteIds(limit: number): Promise<readonly string[]>;
}

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(input: { prisma: unknown });
  findByAuthSubject: IdentityRepository["findByAuthSubject"];
  provisionOwner(input: {
    authSubject: string;
    athleteId: string;
    displayName?: string | null;
  }): Promise<{ userId: string; athleteId: string }>;
}
