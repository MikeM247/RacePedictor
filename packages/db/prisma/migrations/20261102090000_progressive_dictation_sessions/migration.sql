ALTER TABLE "coach_voice_usage_buckets"
  DROP CONSTRAINT "coach_voice_usage_buckets_windowKind_check";
ALTER TABLE "coach_voice_usage_buckets"
  ADD CONSTRAINT "coach_voice_usage_buckets_windowKind_check"
  CHECK ("windowKind" IN ('minute', 'day', 'month', 'chunk_minute'));

CREATE TABLE "coach_progressive_dictation_sessions" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "conversationId" TEXT,
  "generation" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "topic" TEXT NOT NULL,
  "selectedRecordType" TEXT,
  "selectedRecordId" TEXT,
  "contextFingerprint" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "admissionMonthStart" TIMESTAMPTZ(3) NOT NULL,
  "reservedMicroUsd" BIGINT NOT NULL,
  "chargedMicroUsd" BIGINT NOT NULL DEFAULT 0,
  "capturedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "admittedChunks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "coach_progressive_dictation_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_progressive_dictation_sessions_state_check" CHECK ("state" IN ('active', 'closed', 'cancelled', 'expired')),
  CONSTRAINT "coach_progressive_dictation_sessions_binding_check" CHECK ("generation" > 0 AND "sequence" >= 0 AND length("contextFingerprint") = 64),
  CONSTRAINT "coach_progressive_dictation_sessions_counters_check" CHECK ("reservedMicroUsd" > 0 AND "chargedMicroUsd" >= 0 AND "chargedMicroUsd" <= "reservedMicroUsd" AND "capturedSeconds" >= 0 AND "admittedChunks" BETWEEN 0 AND 90),
  CONSTRAINT "coach_progressive_dictation_sessions_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "coach_progressive_dictation_sessions_athleteId_state_leaseExpiresAt_idx"
  ON "coach_progressive_dictation_sessions"("athleteId", "state", "leaseExpiresAt");
CREATE INDEX "coach_progressive_dictation_sessions_athleteId_admissionMonthStart_idx"
  ON "coach_progressive_dictation_sessions"("athleteId", "admissionMonthStart");

ALTER TABLE "coach_voice_attempts"
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "chunkIndex" INTEGER,
  ADD COLUMN "retryOrdinal" INTEGER;
ALTER TABLE "coach_voice_attempts"
  ADD CONSTRAINT "coach_voice_attempts_progressive_binding_check"
  CHECK (("sessionId" IS NULL AND "chunkIndex" IS NULL AND "retryOrdinal" IS NULL)
    OR ("sessionId" IS NOT NULL AND "chunkIndex" BETWEEN 0 AND 89 AND "retryOrdinal" IN (0, 1)));
ALTER TABLE "coach_voice_attempts"
  ADD CONSTRAINT "coach_voice_attempts_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "coach_progressive_dictation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "coach_voice_attempts_athleteId_sessionId_chunkIndex_retryOrdinal_key"
  ON "coach_voice_attempts"("athleteId", "sessionId", "chunkIndex", "retryOrdinal");
CREATE INDEX "coach_voice_attempts_athleteId_sessionId_chunkIndex_idx"
  ON "coach_voice_attempts"("athleteId", "sessionId", "chunkIndex");
