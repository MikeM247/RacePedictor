CREATE TABLE "coach_conversations" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "lastReflectedActivityId" TEXT,
  "lastReflectedActivityAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "coach_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_conversations_generation_check" CHECK ("generation" > 0),
  CONSTRAINT "coach_conversations_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "coach_conversations_id_athleteId_key" UNIQUE ("id", "athleteId"),
  CONSTRAINT "coach_conversations_athleteId_key" UNIQUE ("athleteId"),
  CONSTRAINT "coach_conversations_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "coach_turns" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "clientTurnId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "contextFingerprint" TEXT NOT NULL,
  "contextSnapshot" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'processing',
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "lastRetryId" TEXT,
  "retryRequestHash" TEXT,
  "safeErrorCode" TEXT,
  "model" TEXT,
  "providerRequestId" TEXT,
  "providerInputTokens" INTEGER,
  "providerOutputTokens" INTEGER,
  "providerLatencyMs" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "coach_turns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_turns_state_check" CHECK ("state" IN ('processing', 'completed', 'failed', 'abandoned', 'expired')),
  CONSTRAINT "coach_turns_topic_check" CHECK ("topic" IN ('reflect', 'prepare', 'general')),
  CONSTRAINT "coach_turns_generation_attempt_check" CHECK ("generation" > 0 AND "attemptCount" > 0),
  CONSTRAINT "coach_turns_conversationId_generation_clientTurnId_key" UNIQUE ("conversationId", "generation", "clientTurnId"),
  CONSTRAINT "coach_turns_id_athleteId_conversationId_generation_key" UNIQUE ("id", "athleteId", "conversationId", "generation"),
  CONSTRAINT "coach_turns_conversationId_athleteId_fkey" FOREIGN KEY ("conversationId", "athleteId") REFERENCES "coach_conversations"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coach_turns_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "coach_turns_athleteId_conversationId_generation_state_createdAt_idx" ON "coach_turns"("athleteId", "conversationId", "generation", "state", "createdAt" DESC);

CREATE TABLE "coach_messages" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "turnId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "topic" TEXT,
  "selectedRecordType" TEXT,
  "selectedRecordId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_messages_role_check" CHECK ("role" IN ('user', 'assistant')),
  CONSTRAINT "coach_messages_topic_check" CHECK ("topic" IS NULL OR "topic" IN ('reflect', 'prepare', 'general')),
  CONSTRAINT "coach_messages_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "coach_messages_conversationId_generation_sequence_key" UNIQUE ("conversationId", "generation", "sequence"),
  CONSTRAINT "coach_messages_conversationId_athleteId_fkey" FOREIGN KEY ("conversationId", "athleteId") REFERENCES "coach_conversations"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coach_messages_turnId_athleteId_conversationId_generation_fkey" FOREIGN KEY ("turnId", "athleteId", "conversationId", "generation") REFERENCES "coach_turns"("id", "athleteId", "conversationId", "generation") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coach_messages_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "coach_messages_one_assistant_per_turn_key" ON "coach_messages"("turnId") WHERE "role" = 'assistant';
CREATE INDEX "coach_messages_athleteId_conversationId_generation_sequence_idx" ON "coach_messages"("athleteId", "conversationId", "generation", "sequence" DESC);

CREATE TABLE "coach_usage_buckets" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "windowKind" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowEnd" TIMESTAMPTZ(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" BIGINT NOT NULL DEFAULT 0,
  "outputTokens" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "coach_usage_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_usage_buckets_windowKind_check" CHECK ("windowKind" IN ('minute', 'day')),
  CONSTRAINT "coach_usage_buckets_counters_check" CHECK ("attemptCount" >= 0 AND "inputTokens" >= 0 AND "outputTokens" >= 0),
  CONSTRAINT "coach_usage_buckets_athleteId_windowKind_windowStart_key" UNIQUE ("athleteId", "windowKind", "windowStart"),
  CONSTRAINT "coach_usage_buckets_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "coach_usage_buckets_athleteId_windowKind_windowEnd_idx" ON "coach_usage_buckets"("athleteId", "windowKind", "windowEnd");
