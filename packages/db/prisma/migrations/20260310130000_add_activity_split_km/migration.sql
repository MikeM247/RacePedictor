-- CreateTable
CREATE TABLE "ActivitySplitKm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "splitIndex" INTEGER NOT NULL,
    "startOffsetS" INTEGER NOT NULL,
    "endOffsetS" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL,
    "distanceM" REAL NOT NULL,
    "paceSecPerKm" REAL NOT NULL,
    "elevGainM" REAL NOT NULL,
    "elevLossM" REAL NOT NULL,
    "avgHrBpm" INTEGER,
    "maxHrBpm" INTEGER,
    "avgCadenceSpm" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivitySplitKm_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySplitKm_activityId_splitIndex_key" ON "ActivitySplitKm"("activityId", "splitIndex");

-- CreateIndex
CREATE INDEX "ActivitySplitKm_athleteId_createdAt_idx" ON "ActivitySplitKm"("athleteId", "createdAt");
