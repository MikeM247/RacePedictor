ALTER TABLE "activity_coach_reviews"
  ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'legacy_combined';
ALTER TABLE "activity_review_requests"
  ADD COLUMN "activityRevision" INTEGER,
  ADD COLUMN "inputFingerprint" TEXT,
  ADD COLUMN "planComparison" JSONB,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "providerInputTokens" INTEGER,
  ADD COLUMN "providerOutputTokens" INTEGER,
  ADD COLUMN "providerLatencyMs" INTEGER;

CREATE TABLE "activity_athlete_feedback" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "activityRevision" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_athlete_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_athlete_feedback_athleteId_activityId_revision_key"
  ON "activity_athlete_feedback"("athleteId", "activityId", "revision");
CREATE UNIQUE INDEX "activity_athlete_feedback_id_athleteId_key"
  ON "activity_athlete_feedback"("id", "athleteId");
CREATE UNIQUE INDEX "activity_athlete_feedback_athleteId_activityId_artifactId_key"
  ON "activity_athlete_feedback"("athleteId", "activityId", "artifactId");
CREATE INDEX "activity_athlete_feedback_athleteId_activityId_revision_idx"
  ON "activity_athlete_feedback"("athleteId", "activityId", "revision" DESC);

ALTER TABLE "activity_athlete_feedback"
  ADD CONSTRAINT "activity_athlete_feedback_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_athlete_feedback"
  ADD CONSTRAINT "activity_athlete_feedback_activityId_athleteId_fkey"
  FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
