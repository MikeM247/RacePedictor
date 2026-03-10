-- CreateTable
CREATE TABLE "WeeklyFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "athleteId" TEXT NOT NULL,
    "weekStartDate" DATETIME NOT NULL,
    "weekEndDate" DATETIME NOT NULL,
    "runCount" INTEGER NOT NULL,
    "totalDistanceM" REAL NOT NULL,
    "totalElapsedTimeS" INTEGER NOT NULL,
    "totalElevationGainM" REAL NOT NULL,
    "longRunDistanceM" REAL NOT NULL,
    "longestRunId" TEXT,
    "easyDistanceM" REAL NOT NULL,
    "moderateDistanceM" REAL NOT NULL,
    "hardDistanceM" REAL NOT NULL,
    "avgPaceSecPerKm" REAL,
    "avgHrBpm" INTEGER,
    "strainScore" REAL,
    "monotonyScore" REAL,
    "consistencyScore" REAL,
    "dataCompleteness" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFeature_athleteId_weekStartDate_key" ON "WeeklyFeature"("athleteId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyFeature_athleteId_weekStartDate_idx" ON "WeeklyFeature"("athleteId", "weekStartDate" DESC);

-- CreateIndex
CREATE INDEX "WeeklyFeature_weekStartDate_idx" ON "WeeklyFeature"("weekStartDate" DESC);
