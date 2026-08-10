-- CreateIndex
CREATE INDEX "Activity_athleteId_sourceActivityId_idx" ON "Activity"("athleteId", "sourceActivityId");

-- CreateIndex
CREATE INDEX "staging_activities_importId_status_id_idx" ON "staging_activities"("importId", "status", "id");
