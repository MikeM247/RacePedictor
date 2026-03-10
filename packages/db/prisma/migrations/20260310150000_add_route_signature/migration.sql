-- CreateTable
CREATE TABLE "RouteSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "startLat" REAL NOT NULL,
    "startLon" REAL NOT NULL,
    "endLat" REAL NOT NULL,
    "endLon" REAL NOT NULL,
    "bboxMinLat" REAL NOT NULL,
    "bboxMinLon" REAL NOT NULL,
    "bboxMaxLat" REAL NOT NULL,
    "bboxMaxLon" REAL NOT NULL,
    "polyline" TEXT,
    "elevProfile" TEXT,
    "routeHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteSignature_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteSignature_activityId_key" ON "RouteSignature"("activityId");

-- CreateIndex
CREATE INDEX "RouteSignature_athleteId_routeHash_idx" ON "RouteSignature"("athleteId", "routeHash");
