CREATE TABLE "calendar_session_projections" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "prescribedSession" JSONB NOT NULL,
  "effectiveSession" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'upcoming',
  "revision" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_session_projections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_session_projections_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "calendar_session_projections_status_check" CHECK ("status" IN ('upcoming', 'skipped'))
);

CREATE TABLE "calendar_session_amendments" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "changedFields" JSONB NOT NULL,
  "beforeValues" JSONB NOT NULL,
  "afterValues" JSONB NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_session_amendments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_session_amendments_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "calendar_session_amendments_operation_check" CHECK ("operation" IN ('amend', 'reschedule', 'skip', 'restore')),
  CONSTRAINT "calendar_session_amendments_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "calendar_session_amendments_actor_kind_check" CHECK ("actorKind" = 'user')
);

CREATE UNIQUE INDEX "calendar_session_projections_athleteId_planId_sessionId_key"
  ON "calendar_session_projections"("athleteId", "planId", "sessionId");
CREATE INDEX "calendar_session_projections_athleteId_planId_status_idx"
  ON "calendar_session_projections"("athleteId", "planId", "status");
CREATE UNIQUE INDEX "calendar_session_amendments_athleteId_planId_sessionId_revision_key"
  ON "calendar_session_amendments"("athleteId", "planId", "sessionId", "revision");
CREATE UNIQUE INDEX "calendar_session_amendments_athleteId_idempotencyKey_key"
  ON "calendar_session_amendments"("athleteId", "idempotencyKey");
CREATE INDEX "calendar_session_amendments_athleteId_planId_sessionId_createdAt_idx"
  ON "calendar_session_amendments"("athleteId", "planId", "sessionId", "createdAt");

ALTER TABLE "calendar_session_projections"
  ADD CONSTRAINT "calendar_session_projections_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_session_projections"
  ADD CONSTRAINT "calendar_session_projections_athleteId_planId_fkey"
  FOREIGN KEY ("athleteId", "planId") REFERENCES "training_plan_projections"("athleteId", "planId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_session_amendments"
  ADD CONSTRAINT "calendar_session_amendments_athleteId_planId_sessionId_fkey"
  FOREIGN KEY ("athleteId", "planId", "sessionId") REFERENCES "calendar_session_projections"("athleteId", "planId", "sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "calendar_session_projections" (
  "id", "athleteId", "planId", "sessionId", "prescribedSession", "effectiveSession", "status", "revision", "createdAt", "updatedAt"
)
SELECT
  'session_' || md5(projection."athleteId" || ':' || projection."planId" || ':' || (workout.value->>'id')),
  projection."athleteId",
  projection."planId",
  workout.value->>'id',
  workout.value,
  workout.value,
  'upcoming',
  GREATEST(1, COALESCE((projection.plan->>'revision')::INTEGER, 1)),
  projection."publishedAt",
  projection."updatedAt"
FROM "training_plan_projections" projection
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(projection.plan->'workouts', '[]'::jsonb)) AS workout(value)
WHERE NULLIF(btrim(workout.value->>'id'), '') IS NOT NULL
ON CONFLICT ("athleteId", "planId", "sessionId") DO NOTHING;
