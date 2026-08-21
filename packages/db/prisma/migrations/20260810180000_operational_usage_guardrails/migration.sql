CREATE TABLE "operational_usage_buckets" (
  "id" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowEnd" TIMESTAMPTZ(3) NOT NULL,
  "amount" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "operational_usage_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_usage_buckets_metric_windowStart_key"
  ON "operational_usage_buckets"("metric", "windowStart");
CREATE INDEX "operational_usage_buckets_metric_windowEnd_idx"
  ON "operational_usage_buckets"("metric", "windowEnd");
