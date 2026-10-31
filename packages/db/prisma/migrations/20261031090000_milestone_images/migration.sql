CREATE TABLE milestone_image_state (
  "athleteId" TEXT PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0), state JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE milestone_image_assets (
  "athleteId" TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL, bytes BYTEA NOT NULL CHECK(octet_length(bytes)<=524288),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 512), height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 512),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("athleteId",id)
);
CREATE TABLE milestone_image_uploads (
  id TEXT PRIMARY KEY, "athleteId" TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "storageKey" TEXT NOT NULL UNIQUE, "byteSize" INTEGER NOT NULL CHECK("byteSize" BETWEEN 1 AND 5242880),
  checksum TEXT NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL, "assetId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX milestone_image_assets_age ON milestone_image_assets("createdAt");
CREATE INDEX milestone_image_uploads_expiry ON milestone_image_uploads("expiresAt");
