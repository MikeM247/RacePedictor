CREATE TABLE "coach_voice_usage_buckets" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "windowKind" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowEnd" TIMESTAMPTZ(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "reservedMicroUsd" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_voice_usage_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_voice_usage_buckets_windowKind_check" CHECK ("windowKind" IN ('minute', 'day', 'month')),
  CONSTRAINT "coach_voice_usage_buckets_counters_check" CHECK ("attemptCount" >= 0 AND "reservedMicroUsd" >= 0),
  CONSTRAINT "coach_voice_usage_buckets_athleteId_fkey" FOREIGN KEY ("athleteId")
    REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "coach_voice_usage_buckets_athleteId_windowKind_windowStart_key"
  ON "coach_voice_usage_buckets"("athleteId", "windowKind", "windowStart");
CREATE INDEX "coach_voice_usage_buckets_athleteId_windowKind_windowEnd_idx"
  ON "coach_voice_usage_buckets"("athleteId", "windowKind", "windowEnd");

CREATE TABLE "coach_voice_attempts" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'processing',
  "inputUnits" INTEGER NOT NULL,
  "reservedMicroUsd" BIGINT NOT NULL,
  "latencyMs" INTEGER,
  "safeErrorCode" TEXT,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_voice_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_voice_attempts_kind_check" CHECK ("kind" IN ('transcription', 'speech')),
  CONSTRAINT "coach_voice_attempts_state_check" CHECK ("state" IN ('processing', 'completed', 'failed', 'expired')),
  CONSTRAINT "coach_voice_attempts_counters_check" CHECK ("inputUnits" > 0 AND "reservedMicroUsd" > 0 AND ("latencyMs" IS NULL OR "latencyMs" >= 0)),
  CONSTRAINT "coach_voice_attempts_athleteId_fkey" FOREIGN KEY ("athleteId")
    REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "coach_voice_attempts_athleteId_operationId_key"
  ON "coach_voice_attempts"("athleteId", "operationId");
CREATE INDEX "coach_voice_attempts_athleteId_state_leaseExpiresAt_idx"
  ON "coach_voice_attempts"("athleteId", "state", "leaseExpiresAt");
CREATE INDEX "coach_voice_attempts_athleteId_createdAt_idx"
  ON "coach_voice_attempts"("athleteId", "createdAt");
