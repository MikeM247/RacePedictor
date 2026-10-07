CREATE TABLE "activity_pace_comparisons" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "artifactId" TEXT NOT NULL,
  "artifactHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_pace_comparisons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_pace_comparisons_activity_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "activity_pace_comparisons_athleteId_activityId_revision_key" ON "activity_pace_comparisons"("athleteId", "activityId", "revision");
CREATE UNIQUE INDEX "activity_pace_comparisons_athleteId_activityId_artifactId_key" ON "activity_pace_comparisons"("athleteId", "activityId", "artifactId");
