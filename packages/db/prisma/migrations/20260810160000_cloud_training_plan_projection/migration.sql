CREATE TABLE "training_plan_projections" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "planStatus" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_plan_projections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_plan_projections_athleteId_planId_key"
    ON "training_plan_projections"("athleteId", "planId");

CREATE UNIQUE INDEX "training_plan_projections_athleteId_contentHash_key"
    ON "training_plan_projections"("athleteId", "contentHash");

CREATE INDEX "training_plan_projections_athleteId_active_planVersion_idx"
    ON "training_plan_projections"("athleteId", "active", "planVersion" DESC);

ALTER TABLE "training_plan_projections"
    ADD CONSTRAINT "training_plan_projections_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
