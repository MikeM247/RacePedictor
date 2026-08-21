-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('gpx', 'tcx', 'csv', 'manual');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('run', 'trail_run', 'treadmill_run', 'other');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceFileId" TEXT,
    "sourceActivityId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "elapsedTimeS" INTEGER NOT NULL,
    "movingTimeS" INTEGER,
    "sport" "Sport" NOT NULL,
    "distanceM" DECIMAL(12,3) NOT NULL,
    "avgPaceSecPerKm" DECIMAL(10,3) NOT NULL,
    "best1kSec" INTEGER,
    "best5kSec" INTEGER,
    "elevationGainM" DECIMAL(10,3) NOT NULL,
    "elevationLossM" DECIMAL(10,3) NOT NULL,
    "minElevationM" DECIMAL(10,3),
    "maxElevationM" DECIMAL(10,3),
    "avgHrBpm" INTEGER,
    "maxHrBpm" INTEGER,
    "minHrBpm" INTEGER,
    "hrAvailable" BOOLEAN NOT NULL DEFAULT false,
    "avgCadenceSpm" DECIMAL(10,3),
    "maxCadenceSpm" DECIMAL(10,3),
    "cadenceAvailable" BOOLEAN NOT NULL DEFAULT false,
    "paceVariability" DECIMAL(10,4),
    "hrDriftPct" DECIMAL(10,4),
    "hillDifficulty" DECIMAL(10,4),
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySplitKm" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "splitIndex" INTEGER NOT NULL,
    "startOffsetS" INTEGER NOT NULL,
    "endOffsetS" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL,
    "distanceM" DECIMAL(10,3) NOT NULL,
    "paceSecPerKm" DECIMAL(10,3) NOT NULL,
    "elevGainM" DECIMAL(10,3) NOT NULL,
    "elevLossM" DECIMAL(10,3) NOT NULL,
    "avgHrBpm" INTEGER,
    "maxHrBpm" INTEGER,
    "avgCadenceSpm" DECIMAL(10,3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySplitKm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyFeature" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMPTZ(3) NOT NULL,
    "weekEndDate" TIMESTAMPTZ(3) NOT NULL,
    "runCount" INTEGER NOT NULL,
    "totalDistanceM" DECIMAL(12,3) NOT NULL,
    "totalElapsedTimeS" INTEGER NOT NULL,
    "totalElevationGainM" DECIMAL(12,3) NOT NULL,
    "longRunDistanceM" DECIMAL(12,3) NOT NULL,
    "longestRunId" TEXT,
    "easyDistanceM" DECIMAL(12,3) NOT NULL,
    "moderateDistanceM" DECIMAL(12,3) NOT NULL,
    "hardDistanceM" DECIMAL(12,3) NOT NULL,
    "avgPaceSecPerKm" DECIMAL(10,3),
    "avgHrBpm" INTEGER,
    "strainScore" DECIMAL(10,4),
    "monotonyScore" DECIMAL(10,4),
    "consistencyScore" DECIMAL(10,4),
    "dataCompleteness" DECIMAL(6,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteSignature" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "startLat" DECIMAL(10,7) NOT NULL,
    "startLon" DECIMAL(10,7) NOT NULL,
    "endLat" DECIMAL(10,7) NOT NULL,
    "endLon" DECIMAL(10,7) NOT NULL,
    "bboxMinLat" DECIMAL(10,7) NOT NULL,
    "bboxMinLon" DECIMAL(10,7) NOT NULL,
    "bboxMaxLat" DECIMAL(10,7) NOT NULL,
    "bboxMaxLon" DECIMAL(10,7) NOT NULL,
    "polyline" TEXT,
    "elevProfile" JSONB,
    "routeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_athleteId_occurredAt_idx" ON "Activity"("athleteId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Activity_athleteId_sport_occurredAt_idx" ON "Activity"("athleteId", "sport", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_athleteId_dedupeHash_key" ON "Activity"("athleteId", "dedupeHash");

-- CreateIndex
CREATE INDEX "ActivitySplitKm_activityId_splitIndex_idx" ON "ActivitySplitKm"("activityId", "splitIndex");

-- CreateIndex
CREATE INDEX "ActivitySplitKm_athleteId_createdAt_idx" ON "ActivitySplitKm"("athleteId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyFeature_athleteId_weekStartDate_idx" ON "WeeklyFeature"("athleteId", "weekStartDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFeature_athleteId_weekStartDate_key" ON "WeeklyFeature"("athleteId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "RouteSignature_activityId_key" ON "RouteSignature"("activityId");

-- CreateIndex
CREATE INDEX "RouteSignature_athleteId_routeHash_idx" ON "RouteSignature"("athleteId", "routeHash");

-- AddForeignKey
ALTER TABLE "ActivitySplitKm" ADD CONSTRAINT "ActivitySplitKm_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyFeature" ADD CONSTRAINT "WeeklyFeature_longestRunId_fkey" FOREIGN KEY ("longestRunId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSignature" ADD CONSTRAINT "RouteSignature_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
