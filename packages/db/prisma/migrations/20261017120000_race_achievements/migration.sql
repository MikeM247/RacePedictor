CREATE TABLE "race_achievements" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "record" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "race_achievements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "race_achievements_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "race_achievements_athleteId_id_key" ON "race_achievements"("athleteId", "id");
CREATE INDEX "race_achievements_athleteId_updatedAt_idx" ON "race_achievements"("athleteId", "updatedAt");

CREATE TABLE "dashboard_appearance" (
  "athleteId" TEXT NOT NULL,
  "heroImage" BYTEA NOT NULL,
  "version" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dashboard_appearance_pkey" PRIMARY KEY ("athleteId"),
  CONSTRAINT "dashboard_appearance_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
