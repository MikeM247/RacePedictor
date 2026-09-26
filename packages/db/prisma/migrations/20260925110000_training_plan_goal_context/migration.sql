CREATE TABLE "training_plan_goal_context_projections" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "goalId" TEXT NOT NULL,
    "goalRevision" INTEGER NOT NULL,
    "approvalContentHash" TEXT NOT NULL,
    "goal" JSONB NOT NULL,
    "milestones" JSONB NOT NULL,
    "contextHash" TEXT NOT NULL,
    "pairedDeviceId" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plan_goal_context_projections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_plan_goal_context_projections_athleteId_planId_key"
    ON "training_plan_goal_context_projections"("athleteId", "planId");

CREATE UNIQUE INDEX "training_plan_goal_context_projections_athleteId_contextHash_key"
    ON "training_plan_goal_context_projections"("athleteId", "contextHash");

CREATE INDEX "training_plan_goal_context_projections_athleteId_publishedAt_idx"
    ON "training_plan_goal_context_projections"("athleteId", "publishedAt" DESC);

ALTER TABLE "training_plan_goal_context_projections"
    ADD CONSTRAINT "training_plan_goal_context_projections_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_plan_goal_context_projections"
    ADD CONSTRAINT "training_plan_goal_context_projections_athleteId_planId_fkey"
    FOREIGN KEY ("athleteId", "planId") REFERENCES "training_plan_projections"("athleteId", "planId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_plan_goal_context_projections"
    ADD CONSTRAINT "training_plan_goal_context_projections_pairedDeviceId_athleteId_fkey"
    FOREIGN KEY ("pairedDeviceId", "athleteId") REFERENCES "paired_devices"("id", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
