-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "idempotencyKey" TEXT,
    "stagedCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "normalizeCursor" TEXT,
    "normalizeHasMore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RawFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileChecksum" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "parserSummary" TEXT,
    "metadataSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RawFile_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StagingActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "stagingIndex" INTEGER NOT NULL,
    "normalizeStatus" TEXT NOT NULL DEFAULT 'pending',
    "sourceActivityId" TEXT,
    "dedupeHash" TEXT,
    "occurredAt" DATETIME,
    "parsePayload" TEXT,
    "parseError" TEXT,
    "normalizedActivityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StagingActivity_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Import_idempotencyKey_key" ON "Import"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Import_status_createdAt_idx" ON "Import"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RawFile_importId_fileChecksum_key" ON "RawFile"("importId", "fileChecksum");

-- CreateIndex
CREATE INDEX "RawFile_fileChecksum_idx" ON "RawFile"("fileChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "StagingActivity_importId_stagingIndex_key" ON "StagingActivity"("importId", "stagingIndex");

-- CreateIndex
CREATE INDEX "StagingActivity_importId_normalizeStatus_stagingIndex_idx" ON "StagingActivity"("importId", "normalizeStatus", "stagingIndex");

-- CreateIndex
CREATE INDEX "StagingActivity_athleteId_sourceType_occurredAt_idx" ON "StagingActivity"("athleteId", "sourceType", "occurredAt" DESC);
