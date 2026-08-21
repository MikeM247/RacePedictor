ALTER TABLE "paired_devices"
    ADD COLUMN "enrollmentKeyHash" TEXT,
    ADD COLUMN "lastErrorCode" TEXT;

UPDATE "paired_devices"
SET "enrollmentKeyHash" = md5("id") || md5("id" || ':migration')
WHERE "enrollmentKeyHash" IS NULL;

ALTER TABLE "paired_devices"
    ALTER COLUMN "enrollmentKeyHash" SET NOT NULL;

CREATE UNIQUE INDEX "paired_devices_athleteId_enrollmentKeyHash_key"
    ON "paired_devices"("athleteId", "enrollmentKeyHash");
