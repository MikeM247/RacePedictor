CREATE TABLE "coach_conversation_archives" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK ("generation" > 0),
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "archivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalSequence" INTEGER NOT NULL CHECK ("finalSequence" > 0),
  CONSTRAINT "coach_conversation_archives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_archives_conversation_athlete_fkey" FOREIGN KEY ("conversationId", "athleteId")
    REFERENCES "coach_conversations"("id", "athleteId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "coach_conversation_archives_conversationId_generation_key"
  ON "coach_conversation_archives"("conversationId", "generation");
CREATE UNIQUE INDEX "coach_conversation_archives_athleteId_requestId_key"
  ON "coach_conversation_archives"("athleteId", "requestId");
CREATE INDEX "coach_conversation_archives_athleteId_generation_idx"
  ON "coach_conversation_archives"("athleteId", "generation" DESC);
