CREATE TABLE "coach_run_review_activations" (
  "athleteId" TEXT NOT NULL,
  "activatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_run_review_activations_pkey" PRIMARY KEY ("athleteId"),
  CONSTRAINT "coach_run_review_activations_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "activity_run_review_states" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "completedReflectionRevision" INTEGER,
  "suppressedAt" TIMESTAMPTZ(3),
  "reopenedAt" TIMESTAMPTZ(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "activity_run_review_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_run_review_states_athlete_activity_key" UNIQUE ("athleteId", "activityId"),
  CONSTRAINT "activity_run_review_states_activity_athlete_key" UNIQUE ("activityId", "athleteId"),
  CONSTRAINT "activity_run_review_states_id_athlete_key" UNIQUE ("id", "athleteId"),
  CONSTRAINT "activity_run_review_states_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "activity_run_review_states_activity_athlete_fkey"
    FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "activity_run_review_states_athlete_completed_idx" ON "activity_run_review_states"("athleteId", "completedAt");

CREATE TABLE "coach_run_review_offers" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "loginId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "tabId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "outcome" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_run_review_offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_run_review_offers_athlete_login_key" UNIQUE ("athleteId", "loginId"),
  CONSTRAINT "coach_run_review_offers_athlete_token_key" UNIQUE ("athleteId", "token"),
  CONSTRAINT "coach_run_review_offers_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coach_run_review_offers_activity_athlete_fkey"
    FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "coach_run_review_offers_athlete_activity_idx" ON "coach_run_review_offers"("athleteId", "activityId");
CREATE INDEX "coach_run_review_offers_expires_idx" ON "coach_run_review_offers"("expiresAt");

CREATE TABLE "activity_reflection_mutations" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "appliedRevision" INTEGER NOT NULL,
  "appliedStateRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_reflection_mutations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_reflection_mutations_athlete_request_key" UNIQUE ("athleteId", "requestId"),
  CONSTRAINT "activity_reflection_mutations_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "activity_reflection_mutations_activity_athlete_fkey"
    FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "activity_reflection_mutations_athlete_activity_created_idx" ON "activity_reflection_mutations"("athleteId", "activityId", "createdAt");

-- Existing optional reflections remain historical journal entries. Suppress
-- their automatic review without claiming they satisfy the new form.
INSERT INTO "activity_run_review_states" ("id", "athleteId", "activityId", "suppressedAt", "revision")
SELECT 'legacy_run_review_' || md5(r."athleteId" || ':' || r."activityId"), r."athleteId", r."activityId", CURRENT_TIMESTAMP, 1
FROM "activity_reflections" AS r
WHERE r."answers" <> '{}'::jsonb OR r."sections" <> '[]'::jsonb
ON CONFLICT ("athleteId", "activityId") DO NOTHING;

ALTER TABLE "coach_turns"
  ADD COLUMN "reviewActivityId" TEXT,
  ADD COLUMN "reviewReflectionRevision" INTEGER;
CREATE UNIQUE INDEX "coach_turns_conversation_generation_review_revision_key"
  ON "coach_turns"("conversationId", "generation", "reviewActivityId", "reviewReflectionRevision");

ALTER TABLE "coach_messages"
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "activityReflectionRevision" INTEGER,
  ADD COLUMN "eventPayload" JSONB;

ALTER TABLE "activity_review_requests"
  ADD COLUMN "reflectionRevision" INTEGER;
