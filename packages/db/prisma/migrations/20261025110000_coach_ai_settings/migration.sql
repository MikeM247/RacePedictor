CREATE TYPE "CoachAiProvider" AS ENUM ('openai', 'openrouter');

CREATE TABLE "coach_ai_configurations" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "provider" "CoachAiProvider" NOT NULL,
  "modelId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "coach_ai_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coach_ai_configurations_athleteId_key" ON "coach_ai_configurations"("athleteId");
ALTER TABLE "coach_ai_configurations" ADD CONSTRAINT "coach_ai_configurations_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_review_requests"
  ADD COLUMN "executionTarget" TEXT NOT NULL DEFAULT 'cloud',
  ADD COLUMN "provider" "CoachAiProvider",
  ADD COLUMN "requestedModel" TEXT,
  ADD COLUMN "configurationRevision" INTEGER,
  ADD COLUMN "forceRegenerate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expectedReviewRevision" INTEGER;
ALTER TABLE "activity_coach_reviews"
  ADD COLUMN "provider" "CoachAiProvider",
  ADD COLUMN "requestedModel" TEXT,
  ADD COLUMN "configurationRevision" INTEGER;

-- Keep already-running paired-device leases publishable across the rollout.
UPDATE "activity_review_requests" SET "executionTarget" = 'device'
  WHERE "status" = 'processing' AND COALESCE("lockedBy", '') <> 'cloud-coach-worker';

ALTER TABLE "activity_review_requests" ADD COLUMN "providerReturnedModel" VARCHAR(120);
