CREATE TYPE "ActivityReviewRequestStatus" AS ENUM ('queued', 'processing', 'ready', 'retry_wait', 'attention', 'cancelled');

CREATE TABLE "activity_review_requests" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "status" "ActivityReviewRequestStatus" NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseToken" TEXT,
    "lastErrorCode" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_review_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_coach_reviews" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "comparison" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_coach_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_review_requests_athleteId_activityId_key" ON "activity_review_requests"("athleteId", "activityId");
CREATE UNIQUE INDEX "activity_review_requests_id_athleteId_key" ON "activity_review_requests"("id", "athleteId");
CREATE INDEX "activity_review_requests_athleteId_status_availableAt_idx" ON "activity_review_requests"("athleteId", "status", "availableAt");
CREATE UNIQUE INDEX "activity_coach_reviews_athleteId_activityId_revision_key" ON "activity_coach_reviews"("athleteId", "activityId", "revision");
CREATE UNIQUE INDEX "activity_coach_reviews_id_athleteId_key" ON "activity_coach_reviews"("id", "athleteId");
CREATE INDEX "activity_coach_reviews_athleteId_publishedAt_idx" ON "activity_coach_reviews"("athleteId", "publishedAt" DESC);
CREATE INDEX "activity_coach_reviews_athleteId_activityId_revision_idx" ON "activity_coach_reviews"("athleteId", "activityId", "revision" DESC);

ALTER TABLE "activity_review_requests" ADD CONSTRAINT "activity_review_requests_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_review_requests" ADD CONSTRAINT "activity_review_requests_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_coach_reviews" ADD CONSTRAINT "activity_coach_reviews_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_coach_reviews" ADD CONSTRAINT "activity_coach_reviews_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_coach_reviews" ADD CONSTRAINT "activity_coach_reviews_requestId_athleteId_fkey" FOREIGN KEY ("requestId", "athleteId") REFERENCES "activity_review_requests"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;
