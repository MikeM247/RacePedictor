-- A connection exists while consent is in progress and after local revocation,
-- so provider identity and credential-envelope fields must be nullable.
ALTER TABLE "provider_connections"
  ALTER COLUMN "providerAthleteId" DROP NOT NULL,
  ALTER COLUMN "credentialCiphertext" DROP NOT NULL,
  ALTER COLUMN "credentialIv" DROP NOT NULL,
  ALTER COLUMN "credentialAuthTag" DROP NOT NULL,
  ALTER COLUMN "credentialKeyVersion" DROP NOT NULL,
  ADD COLUMN "connectedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastProviderContactAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastEventReceivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastErrorCode" TEXT;

-- Only a SHA-256 state digest is retained. The opaque state itself exists only
-- in the browser redirect and is consumed once by an actor/athlete-bound row.
CREATE TABLE "provider_oauth_attempts" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "Provider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_oauth_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_oauth_attempts_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_oauth_attempts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "provider_oauth_attempts_provider_stateHash_key"
  ON "provider_oauth_attempts"("provider", "stateHash");
CREATE INDEX "provider_oauth_attempts_athleteId_userId_provider_expiresAt_idx"
  ON "provider_oauth_attempts"("athleteId", "userId", "provider", "expiresAt");
