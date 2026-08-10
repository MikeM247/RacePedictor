-- A fencing token prevents a stale serverless invocation from completing a
-- lease after another worker has reclaimed it. Global indexes support bounded
-- polling and stale-lease recovery across athlete partitions.
CREATE TYPE "IngestionJobKind" AS ENUM ('webhook', 'backfill', 'reconciliation');

ALTER TABLE "ingestion_jobs"
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "kind" "IngestionJobKind" NOT NULL DEFAULT 'webhook',
  ADD COLUMN "payload" JSONB;

CREATE INDEX "ingestion_jobs_status_availableAt_idx"
  ON "ingestion_jobs"("status", "availableAt");

CREATE INDEX "ingestion_jobs_status_lockedAt_idx"
  ON "ingestion_jobs"("status", "lockedAt");
