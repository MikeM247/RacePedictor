-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "athleteId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceFileId" TEXT,
    "sourceActivityId" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "elapsedTimeS" INTEGER NOT NULL,
    "movingTimeS" INTEGER,
    "sport" TEXT NOT NULL,
    "distanceM" REAL NOT NULL,
    "avgPaceSecPerKm" REAL NOT NULL,
    "best1kSec" REAL,
    "best5kSec" REAL,
    "elevationGainM" REAL NOT NULL,
    "elevationLossM" REAL NOT NULL,
    "minElevationM" REAL,
    "maxElevationM" REAL,
    "avgHrBpm" INTEGER,
    "maxHrBpm" INTEGER,
    "minHrBpm" INTEGER,
    "hrAvailable" BOOLEAN NOT NULL,
    "avgCadenceSpm" REAL,
    "maxCadenceSpm" REAL,
    "cadenceAvailable" BOOLEAN NOT NULL,
    "paceVariability" REAL,
    "hrDriftPct" REAL,
    "hillDifficulty" REAL,
    "dedupeHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Activity_athleteId_occurredAt_idx" ON "Activity"("athleteId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Activity_athleteId_sport_occurredAt_idx" ON "Activity"("athleteId", "sport", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Activity_athleteId_sourceType_occurredAt_idx" ON "Activity"("athleteId", "sourceType", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_athleteId_sourceType_sourceActivityId_key" ON "Activity"("athleteId", "sourceType", "sourceActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_athleteId_dedupeHash_key" ON "Activity"("athleteId", "dedupeHash");
