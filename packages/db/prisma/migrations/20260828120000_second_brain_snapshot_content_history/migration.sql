-- Immutable snapshot history permits returning to an earlier selected context.
-- No-op detection is enforced against the latest revision by the repository.
DROP INDEX IF EXISTS "second_brain_snapshots_athleteId_contentHash_key";

CREATE INDEX IF NOT EXISTS "second_brain_snapshots_athleteId_contentHash_idx"
  ON "second_brain_snapshots"("athleteId", "contentHash");
