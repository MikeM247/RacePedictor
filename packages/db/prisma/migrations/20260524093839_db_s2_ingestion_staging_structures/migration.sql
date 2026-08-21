-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'normalizing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "StagingRowStatus" AS ENUM ('staged', 'duplicate', 'rejected', 'normalized', 'error');

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'uploaded',
    "stagedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "nextCursor" TEXT,
    "hasMore" BOOLEAN NOT NULL DEFAULT false,
    "parseWarnings" JSONB,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_files" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "checksum" TEXT NOT NULL,
    "storagePath" TEXT,
    "parserVersion" TEXT,
    "parseWarnings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_activities" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rawFileId" TEXT,
    "athleteId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceActivityId" TEXT,
    "dedupeHash" TEXT,
    "occurredAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "elapsedTimeS" INTEGER,
    "distanceM" DECIMAL(12,3),
    "sport" "Sport",
    "status" "StagingRowStatus" NOT NULL DEFAULT 'staged',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staging_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imports_status_createdAt_idx" ON "imports"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "imports_athleteId_createdAt_idx" ON "imports"("athleteId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "imports_idempotencyKey_key" ON "imports"("idempotencyKey");

-- CreateIndex
CREATE INDEX "raw_files_importId_createdAt_idx" ON "raw_files"("importId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "raw_files_athleteId_checksum_key" ON "raw_files"("athleteId", "checksum");

-- CreateIndex
CREATE INDEX "staging_activities_importId_status_createdAt_idx" ON "staging_activities"("importId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "staging_activities_importId_sourceActivityId_idx" ON "staging_activities"("importId", "sourceActivityId");

-- CreateIndex
CREATE INDEX "staging_activities_importId_dedupeHash_idx" ON "staging_activities"("importId", "dedupeHash");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "raw_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_activities" ADD CONSTRAINT "staging_activities_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_activities" ADD CONSTRAINT "staging_activities_rawFileId_fkey" FOREIGN KEY ("rawFileId") REFERENCES "raw_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
