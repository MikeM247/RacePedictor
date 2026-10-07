CREATE TABLE "activity_reflections" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "activityRevision" INTEGER NOT NULL,
    "type" TEXT,
    "answers" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "questionnaireVersion" TEXT NOT NULL DEFAULT 'activity-reflection.v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_reflections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_reflections_athleteId_activityId_key" ON "activity_reflections"("athleteId", "activityId");
CREATE UNIQUE INDEX "activity_reflections_id_athleteId_key" ON "activity_reflections"("id", "athleteId");
CREATE INDEX "activity_reflections_athleteId_updatedAt_idx" ON "activity_reflections"("athleteId", "updatedAt" DESC);
ALTER TABLE "activity_reflections" ADD CONSTRAINT "activity_reflections_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_reflections" ADD CONSTRAINT "activity_reflections_activityId_athleteId_fkey" FOREIGN KEY ("activityId", "athleteId") REFERENCES "Activity"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "daily_wellbeing_check_ins" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "questionnaireVersion" TEXT NOT NULL DEFAULT 'daily-wellbeing.v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daily_wellbeing_check_ins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_wellbeing_check_ins_athleteId_localDate_key" ON "daily_wellbeing_check_ins"("athleteId", "localDate");
CREATE UNIQUE INDEX "daily_wellbeing_check_ins_id_athleteId_key" ON "daily_wellbeing_check_ins"("id", "athleteId");
CREATE INDEX "daily_wellbeing_check_ins_athleteId_localDate_idx" ON "daily_wellbeing_check_ins"("athleteId", "localDate");
ALTER TABLE "daily_wellbeing_check_ins" ADD CONSTRAINT "daily_wellbeing_check_ins_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
