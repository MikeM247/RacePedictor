-- Add Strava without changing existing source values.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'strava';

-- Cloud sync lifecycle enums.
CREATE TYPE "AthleteAccessRole" AS ENUM ('owner', 'viewer');
CREATE TYPE "Provider" AS ENUM ('strava');
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('disconnected', 'connecting', 'connected', 'attention', 'revoked');
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'queued', 'processed', 'ignored', 'failed');
CREATE TYPE "IngestionJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'dead_letter');
CREATE TYPE "RawObjectKind" AS ENUM ('activity_detail', 'activity_laps', 'activity_streams', 'webhook_event');
CREATE TYPE "SyncOperation" AS ENUM ('upsert', 'delete');
CREATE TYPE "PairedDeviceStatus" AS ENUM ('active', 'revoked');

CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authSubject" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "athletes" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing athlete-scoped row. Access is provisioned separately
-- because the migration must not invent a user identity.
INSERT INTO "athletes" ("id", "createdAt", "updatedAt")
SELECT "athleteId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT "athleteId" FROM "Activity"
    UNION SELECT "athleteId" FROM "imports"
    UNION SELECT "athleteId" FROM "raw_files"
    UNION SELECT "athleteId" FROM "staging_activities"
    UNION SELECT "athleteId" FROM "ActivitySplitKm"
    UNION SELECT "athleteId" FROM "WeeklyFeature"
    UNION SELECT "athleteId" FROM "RouteSignature"
) AS existing_athletes;

CREATE TABLE "athlete_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "role" "AthleteAccessRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "athlete_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerAthleteId" TEXT NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'connected',
    "grantedScopes" TEXT,
    "credentialCiphertext" TEXT NOT NULL,
    "credentialIv" TEXT NOT NULL,
    "credentialAuthTag" TEXT NOT NULL,
    "credentialKeyVersion" TEXT NOT NULL,
    "credentialExpiresAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_webhook_events" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "providerConnectionId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerEventKey" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "providerObjectId" TEXT NOT NULL,
    "aspectType" TEXT NOT NULL,
    "eventOccurredAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'received',
    "processedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "providerConnectionId" TEXT NOT NULL,
    "webhookEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- Raw provider bodies live in object storage. This table stores only their
-- immutable address, integrity metadata, and tenant ownership.
CREATE TABLE "raw_objects" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "providerConnectionId" TEXT,
    "provider" "Provider" NOT NULL,
    "kind" "RawObjectKind" NOT NULL,
    "providerObjectId" TEXT NOT NULL,
    "objectVersion" INTEGER NOT NULL DEFAULT 1,
    "storageProvider" TEXT NOT NULL DEFAULT 'r2',
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "raw_objects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_source_references" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "providerConnectionId" TEXT,
    "rawObjectId" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_source_references_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_revisions" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "rawObjectId" TEXT,
    "revisionNumber" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "normalizerVersion" TEXT NOT NULL,
    "changeSummary" JSONB,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_changes" (
    "id" TEXT NOT NULL,
    "cursor" BIGINT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "entityVersion" INTEGER NOT NULL,
    "selectedFields" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paired_devices" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "pairedByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceKeyHash" TEXT NOT NULL,
    "publicKey" TEXT,
    "status" "PairedDeviceStatus" NOT NULL DEFAULT 'active',
    "lastPullCursor" BIGINT,
    "lastPushRevision" INTEGER,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "paired_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "second_brain_snapshots" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "pairedDeviceId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "selectedFields" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "second_brain_snapshots_pkey" PRIMARY KEY ("id")
);

-- Identity and access indexes.
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");
CREATE UNIQUE INDEX "app_users_authSubject_key" ON "app_users"("authSubject");
CREATE UNIQUE INDEX "athlete_access_userId_athleteId_key" ON "athlete_access"("userId", "athleteId");
CREATE INDEX "athlete_access_athleteId_role_idx" ON "athlete_access"("athleteId", "role");

-- Composite keys are deliberate: tenant identity participates in every
-- cross-table association and prevents cross-athlete references.
CREATE UNIQUE INDEX "Activity_id_athleteId_key" ON "Activity"("id", "athleteId");
CREATE UNIQUE INDEX "imports_id_athleteId_key" ON "imports"("id", "athleteId");
DROP INDEX "imports_idempotencyKey_key";
CREATE UNIQUE INDEX "imports_athleteId_idempotencyKey_key" ON "imports"("athleteId", "idempotencyKey");
CREATE UNIQUE INDEX "raw_files_id_athleteId_key" ON "raw_files"("id", "athleteId");
DROP INDEX "RouteSignature_activityId_key";
CREATE UNIQUE INDEX "RouteSignature_activityId_athleteId_key" ON "RouteSignature"("activityId", "athleteId");

CREATE UNIQUE INDEX "provider_connections_id_athleteId_key" ON "provider_connections"("id", "athleteId");
CREATE UNIQUE INDEX "provider_connections_athleteId_provider_key" ON "provider_connections"("athleteId", "provider");
CREATE UNIQUE INDEX "provider_connections_provider_providerAthleteId_key" ON "provider_connections"("provider", "providerAthleteId");
CREATE INDEX "provider_connections_athleteId_status_idx" ON "provider_connections"("athleteId", "status");

CREATE UNIQUE INDEX "provider_webhook_events_id_athleteId_key" ON "provider_webhook_events"("id", "athleteId");
CREATE UNIQUE INDEX "provider_webhook_events_athleteId_provider_providerEventKey_key" ON "provider_webhook_events"("athleteId", "provider", "providerEventKey");
CREATE INDEX "provider_webhook_events_athleteId_status_receivedAt_idx" ON "provider_webhook_events"("athleteId", "status", "receivedAt");

CREATE INDEX "ingestion_jobs_athleteId_status_availableAt_idx" ON "ingestion_jobs"("athleteId", "status", "availableAt");
CREATE INDEX "ingestion_jobs_webhookEventId_idx" ON "ingestion_jobs"("webhookEventId");
CREATE UNIQUE INDEX "ingestion_jobs_athleteId_idempotencyKey_key" ON "ingestion_jobs"("athleteId", "idempotencyKey");

CREATE UNIQUE INDEX "raw_objects_id_athleteId_key" ON "raw_objects"("id", "athleteId");
CREATE UNIQUE INDEX "raw_objects_storageProvider_storageKey_key" ON "raw_objects"("storageProvider", "storageKey");
CREATE UNIQUE INDEX "raw_objects_athleteId_provider_kind_providerObjectId_objectVersion_key" ON "raw_objects"("athleteId", "provider", "kind", "providerObjectId", "objectVersion");
CREATE INDEX "raw_objects_athleteId_createdAt_idx" ON "raw_objects"("athleteId", "createdAt");

CREATE UNIQUE INDEX "activity_source_references_athleteId_sourceType_sourceObjectId_key" ON "activity_source_references"("athleteId", "sourceType", "sourceObjectId");
CREATE INDEX "activity_source_references_athleteId_activityId_idx" ON "activity_source_references"("athleteId", "activityId");

CREATE UNIQUE INDEX "activity_revisions_athleteId_activityId_revisionNumber_key" ON "activity_revisions"("athleteId", "activityId", "revisionNumber");
CREATE INDEX "activity_revisions_athleteId_recordedAt_idx" ON "activity_revisions"("athleteId", "recordedAt");

CREATE UNIQUE INDEX "sync_changes_athleteId_entityType_entityId_entityVersion_key" ON "sync_changes"("athleteId", "entityType", "entityId", "entityVersion");
CREATE UNIQUE INDEX "sync_changes_athleteId_cursor_key" ON "sync_changes"("athleteId", "cursor");
CREATE INDEX "sync_changes_athleteId_cursor_idx" ON "sync_changes"("athleteId", "cursor");

CREATE UNIQUE INDEX "paired_devices_id_athleteId_key" ON "paired_devices"("id", "athleteId");
CREATE UNIQUE INDEX "paired_devices_athleteId_deviceKeyHash_key" ON "paired_devices"("athleteId", "deviceKeyHash");
CREATE INDEX "paired_devices_athleteId_status_idx" ON "paired_devices"("athleteId", "status");

CREATE UNIQUE INDEX "second_brain_snapshots_athleteId_sourceRevision_key" ON "second_brain_snapshots"("athleteId", "sourceRevision");
CREATE UNIQUE INDEX "second_brain_snapshots_athleteId_contentHash_key" ON "second_brain_snapshots"("athleteId", "contentHash");
CREATE INDEX "second_brain_snapshots_athleteId_createdAt_idx" ON "second_brain_snapshots"("athleteId", "createdAt");

-- Replace legacy single-column links with athlete-qualified links.
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_sourceFileId_fkey";
ALTER TABLE "raw_files" DROP CONSTRAINT "raw_files_importId_fkey";
ALTER TABLE "staging_activities" DROP CONSTRAINT "staging_activities_importId_fkey";
ALTER TABLE "staging_activities" DROP CONSTRAINT "staging_activities_rawFileId_fkey";
ALTER TABLE "ActivitySplitKm" DROP CONSTRAINT "ActivitySplitKm_activityId_fkey";
ALTER TABLE "WeeklyFeature" DROP CONSTRAINT "WeeklyFeature_longestRunId_fkey";
ALTER TABLE "RouteSignature" DROP CONSTRAINT "RouteSignature_activityId_fkey";

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staging_activities" ADD CONSTRAINT "staging_activities_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivitySplitKm" ADD CONSTRAINT "ActivitySplitKm_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeeklyFeature" ADD CONSTRAINT "WeeklyFeature_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteSignature" ADD CONSTRAINT "RouteSignature_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_sourceFileId_athleteId_fkey" FOREIGN KEY ("sourceFileId", "athleteId") REFERENCES "raw_files"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_importId_athleteId_fkey" FOREIGN KEY ("importId", "athleteId") REFERENCES "imports"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staging_activities" ADD CONSTRAINT "staging_activities_importId_athleteId_fkey" FOREIGN KEY ("importId", "athleteId") REFERENCES "imports"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staging_activities" ADD CONSTRAINT "staging_activities_rawFileId_athleteId_fkey" FOREIGN KEY ("rawFileId", "athleteId") REFERENCES "raw_files"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivitySplitKm" ADD CONSTRAINT "ActivitySplitKm_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyFeature" ADD CONSTRAINT "WeeklyFeature_longestRunId_athleteId_fkey" FOREIGN KEY ("longestRunId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteSignature" ADD CONSTRAINT "RouteSignature_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "athlete_access" ADD CONSTRAINT "athlete_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_access" ADD CONSTRAINT "athlete_access_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_providerConnectionId_athleteId_fkey" FOREIGN KEY ("providerConnectionId", "athleteId") REFERENCES "provider_connections"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_providerConnectionId_athleteId_fkey" FOREIGN KEY ("providerConnectionId", "athleteId") REFERENCES "provider_connections"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_webhookEventId_athleteId_fkey" FOREIGN KEY ("webhookEventId", "athleteId") REFERENCES "provider_webhook_events"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_objects" ADD CONSTRAINT "raw_objects_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raw_objects" ADD CONSTRAINT "raw_objects_providerConnectionId_athleteId_fkey" FOREIGN KEY ("providerConnectionId", "athleteId") REFERENCES "provider_connections"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_providerConnectionId_athleteId_fkey" FOREIGN KEY ("providerConnectionId", "athleteId") REFERENCES "provider_connections"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_rawObjectId_athleteId_fkey" FOREIGN KEY ("rawObjectId", "athleteId") REFERENCES "raw_objects"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_revisions" ADD CONSTRAINT "activity_revisions_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_revisions" ADD CONSTRAINT "activity_revisions_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_revisions" ADD CONSTRAINT "activity_revisions_rawObjectId_athleteId_fkey" FOREIGN KEY ("rawObjectId", "athleteId") REFERENCES "raw_objects"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paired_devices" ADD CONSTRAINT "paired_devices_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paired_devices" ADD CONSTRAINT "paired_devices_pairedByUserId_fkey" FOREIGN KEY ("pairedByUserId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "second_brain_snapshots" ADD CONSTRAINT "second_brain_snapshots_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "second_brain_snapshots" ADD CONSTRAINT "second_brain_snapshots_pairedDeviceId_athleteId_fkey" FOREIGN KEY ("pairedDeviceId", "athleteId") REFERENCES "paired_devices"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
