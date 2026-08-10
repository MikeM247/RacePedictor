import type { ActivityDetail } from "../contracts/activity.ts";
import type { AthleteScope } from "../contracts/auth.ts";
import type {
  ProviderAuthorizationResult,
  ProviderConnectionStatus,
  ProviderKey,
} from "../contracts/providers.ts";
import type { SecondBrainContextSnapshot } from "../contracts/second-brain-context.ts";
import type { PairedDevice, SyncChange } from "../contracts/sync.ts";
import type { TrainingPlan } from "../contracts/coaching.ts";

export type AuthenticatedIdentity = Readonly<{
  userId: string;
  permittedAthleteIds: readonly string[];
}>;

export interface IdentityRepository {
  findByAuthSubject(authSubject: string): Promise<AuthenticatedIdentity | null>;
}

export type ProviderTokenGrant = Readonly<{
  providerAthleteId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: readonly string[];
}>;

export type ProviderTokenRefreshGrant = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}>;

export type ProviderCredentialGrant = ProviderTokenGrant;

export type ProviderOAuthAttempt = Readonly<{
  athleteId: string;
  userId: string;
  provider: ProviderKey;
  stateHash: string;
  redirectUri: string;
  returnTo: string;
  expiresAt: string;
  consumedAt: string | null;
}>;

export type OAuthAttemptConsumption =
  | Readonly<{ outcome: "consumed"; attempt: ProviderOAuthAttempt }>
  | Readonly<{ outcome: "invalid" | "expired" | "replayed"; attempt: null }>;

export type ProviderWebhookEvent = Readonly<{
  provider: ProviderKey;
  providerEventId: string;
  providerAthleteId: string;
  objectType: "activity" | "athlete";
  aspectType: "create" | "update" | "delete";
  objectId: string;
  occurredAt: string;
}>;

export type ProviderActivity = Readonly<{
  provider: ProviderKey;
  providerActivityId: string;
  capturedAt: string;
  rawPayload: Uint8Array;
}>;

export interface ProviderAdapter {
  readonly provider: ProviderKey;
  createAuthorization(input: {
    state: string;
    redirectUri: string;
  }): Promise<ProviderAuthorizationResult>;
  exchangeAuthorizationCode(input: { code: string; redirectUri: string }): Promise<ProviderTokenGrant>;
  refreshAuthorization(refreshToken: string): Promise<ProviderTokenRefreshGrant>;
  revokeAuthorization(input: {
    token: string;
    tokenTypeHint: "access_token" | "refresh_token";
  }): Promise<void>;
  verifyWebhook(input: { headers: Readonly<Record<string, string>>; rawBody: Uint8Array }): Promise<ProviderWebhookEvent>;
  fetchActivity(input: { accessToken: string; providerActivityId: string }): Promise<ProviderActivity>;
  listRecentActivities(input: { accessToken: string; after: string; before: string }): Promise<readonly ProviderActivity[]>;
}

export interface ActivityRepository {
  findById(scope: AthleteScope, activityId: string): Promise<ActivityDetail | null>;
  findByProviderReference(scope: AthleteScope, provider: ProviderKey, providerActivityId: string): Promise<ActivityDetail | null>;
  upsertProviderActivity(scope: AthleteScope, input: {
    provider: ProviderKey;
    providerActivityId: string;
    activity: ActivityDetail;
    rawObjectKey: string;
  }): Promise<{ activity: ActivityDetail; revision: number; created: boolean }>;
  tombstoneProviderActivity(scope: AthleteScope, input: {
    provider: ProviderKey;
    providerActivityId: string;
    occurredAt: string;
  }): Promise<{ activityId: string; revision: number; changed: boolean }>;
}

export interface ProviderConnectionRepository {
  get(scope: AthleteScope, provider: ProviderKey): Promise<ProviderConnectionStatus | null>;
  beginConnecting(scope: AthleteScope, provider: ProviderKey, occurredAt: string): Promise<ProviderConnectionStatus>;
  saveCredentials(scope: AthleteScope, provider: ProviderKey, input: ProviderCredentialGrant & {
    contactedAt: string;
  }): Promise<ProviderConnectionStatus>;
  getCredentials(scope: AthleteScope, provider: ProviderKey): Promise<ProviderCredentialGrant | null>;
  rotateCredentials(scope: AthleteScope, provider: ProviderKey, input: ProviderTokenRefreshGrant & {
    contactedAt: string;
  }): Promise<ProviderConnectionStatus>;
  recordFailure(scope: AthleteScope, provider: ProviderKey, input: {
    diagnosticCode: string;
    occurredAt: string;
  }): Promise<ProviderConnectionStatus>;
  disconnect(scope: AthleteScope, provider: ProviderKey, input: {
    occurredAt: string;
    diagnosticCode?: string;
  }): Promise<ProviderConnectionStatus>;
  revoke(scope: AthleteScope, provider: ProviderKey, occurredAt: string): Promise<ProviderConnectionStatus>;
}

export interface ProviderOAuthAttemptRepository {
  create(scope: AthleteScope, attempt: Omit<ProviderOAuthAttempt, "athleteId" | "userId" | "consumedAt">): Promise<void>;
  consume(scope: AthleteScope, input: {
    provider: ProviderKey;
    stateHash: string;
    now: string;
  }): Promise<OAuthAttemptConsumption>;
}

export type RawObjectMetadata = Readonly<{
  athleteId: string;
  provider: ProviderKey;
  key: string;
  checksumSha256: string;
  contentType: string;
  sizeBytes: number;
  capturedAt: string;
}>;

export interface RawObjectStore {
  put(scope: AthleteScope, input: { metadata: RawObjectMetadata; body: Uint8Array }): Promise<RawObjectMetadata>;
  head(scope: AthleteScope, key: string): Promise<RawObjectMetadata | null>;
  createPresignedGet(scope: AthleteScope, input: { key: string; expiresInSeconds: number }): Promise<string>;
}

export type IngestionJob = Readonly<{
  id: string;
  athleteId: string;
  provider: ProviderKey;
  providerEventId: string;
  attempt: number;
}>;

export interface JobQueue {
  enqueue(scope: AthleteScope, input: Omit<IngestionJob, "id" | "attempt" | "athleteId">): Promise<IngestionJob>;
  claim(scope: AthleteScope, workerId: string): Promise<IngestionJob | null>;
  complete(scope: AthleteScope, jobId: string): Promise<void>;
  retry(scope: AthleteScope, input: { jobId: string; diagnosticCode: string; retryAt: string }): Promise<void>;
  fail(scope: AthleteScope, input: { jobId: string; diagnosticCode: string }): Promise<void>;
}

export interface SyncRepository {
  append(scope: AthleteScope, change: Omit<SyncChange, "cursor" | "athleteId">): Promise<SyncChange>;
  listAfter(scope: AthleteScope, input: { cursor: string | null; limit: number }): Promise<readonly SyncChange[]>;
  acknowledge(scope: AthleteScope, input: { deviceId: string; cursor: string }): Promise<void>;
}

export type SnapshotStoreResult = Readonly<{
  snapshot: SecondBrainContextSnapshot;
  reused: boolean;
}>;

export interface SecondBrainSnapshotRepository {
  storeImmutable(scope: AthleteScope, snapshot: SecondBrainContextSnapshot, pairedDeviceId?: string): Promise<SnapshotStoreResult>;
  latest(scope: AthleteScope): Promise<SecondBrainContextSnapshot | null>;
}

export interface LocalProjectionRepository {
  getCursor(athleteId: string): Promise<string | null>;
  applyTransactionally(athleteId: string, changes: readonly SyncChange[]): Promise<string | null>;
  registerDevice(athleteId: string, device: PairedDevice): Promise<void>;
}

export type PairedDeviceCredential = Readonly<{
  device: PairedDevice;
  deviceKeyHash: string;
}>;

export interface PairedDeviceRepository {
  enroll(scope: AthleteScope, input: {
    id: string;
    displayName: string;
    deviceKeyHash: string;
    enrollmentKeyHash: string;
    occurredAt: string;
  }): Promise<{ device: PairedDevice; replayed: boolean }>;
  list(scope: AthleteScope): Promise<readonly PairedDevice[]>;
  findCredential(deviceId: string): Promise<PairedDeviceCredential | null>;
  acknowledge(scope: AthleteScope, input: {
    deviceId: string;
    cursor: string;
    occurredAt: string;
  }): Promise<PairedDevice>;
  recordFailure(scope: AthleteScope, input: {
    deviceId: string;
    diagnosticCode: string;
    occurredAt: string;
  }): Promise<PairedDevice>;
  revoke(scope: AthleteScope, input: { deviceId: string; occurredAt: string }): Promise<PairedDevice | null>;
}

export interface TrainingPlanProjectionPublisher {
  publishApproved(scope: AthleteScope, plan: TrainingPlan, pairedDeviceId: string): Promise<{
    plan: TrainingPlan;
    reused: boolean;
  }>;
}
