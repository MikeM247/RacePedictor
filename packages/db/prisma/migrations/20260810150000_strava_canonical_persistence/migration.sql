-- Canonical Strava projections retain only normalized fields. Raw provider
-- bodies remain in private object storage and are referenced by raw_objects.
ALTER TABLE "Activity"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "localOccurredAt" TEXT,
  ADD COLUMN "calories" DECIMAL(10,3),
  ADD COLUMN "avgPowerW" DECIMAL(10,3),
  ADD COLUMN "maxPowerW" DECIMAL(10,3),
  ADD COLUMN "lapCount" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

ALTER TABLE "activity_source_references"
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE TABLE "analytics_recompute_markers" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "activityOccurredAt" TIMESTAMPTZ(3) NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_recompute_markers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_recompute_markers_athleteId_activityId_key"
  ON "analytics_recompute_markers"("athleteId", "activityId");
CREATE UNIQUE INDEX "analytics_recompute_markers_activityId_athleteId_key"
  ON "analytics_recompute_markers"("activityId", "athleteId");
CREATE INDEX "analytics_recompute_markers_athleteId_requestedAt_idx"
  ON "analytics_recompute_markers"("athleteId", "requestedAt");

ALTER TABLE "analytics_recompute_markers"
  ADD CONSTRAINT "analytics_recompute_markers_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analytics_recompute_markers"
  ADD CONSTRAINT "analytics_recompute_markers_activityId_athleteId_fkey"
  FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId")
  ON DELETE CASCADE ON UPDATE CASCADE;
