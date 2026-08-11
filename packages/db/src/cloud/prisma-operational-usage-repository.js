import { operationalUsageSchema } from "../../../core/src/services/operational-guardrails.ts";

const metrics = new Set(["invocations_daily", "bandwidth_bytes_daily", "provider_requests_15m", "provider_requests_daily"]);

export class PrismaOperationalUsageRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.operationalUsageBucket || !prisma?.rawObject || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma operational usage client is required");
    }
    this.#prisma = prisma;
  }

  recordInvocation(occurredAt = new Date()) {
    return this.#increment("invocations_daily", 1, occurredAt);
  }

  recordBandwidth(bytes, occurredAt = new Date()) {
    return this.#increment("bandwidth_bytes_daily", validAmount(bytes), occurredAt);
  }

  async recordProviderResponse(bytes, occurredAt = new Date()) {
    const time = validDate(occurredAt);
    const amount = validAmount(bytes);
    await this.#prisma.$transaction(async (transaction) => {
      await increment(transaction, "provider_requests_15m", 1, time);
      await increment(transaction, "provider_requests_daily", 1, time);
      await increment(transaction, "bandwidth_bytes_daily", amount, time);
    });
  }

  async readUsage(occurredAt = new Date()) {
    const time = validDate(occurredAt);
    const day = windowFor("invocations_daily", time);
    const quarter = windowFor("provider_requests_15m", time);
    const [raw, databaseRows, daily, providerQuarter] = await Promise.all([
      this.#prisma.rawObject.aggregate({ _sum: { byteSize: true } }),
      this.#prisma.$queryRawUnsafe("SELECT pg_database_size(current_database())::bigint AS bytes"),
      this.#prisma.operationalUsageBucket.findMany({
        where: { windowStart: day.start, metric: { in: ["invocations_daily", "bandwidth_bytes_daily", "provider_requests_daily"] } },
      }),
      this.#prisma.operationalUsageBucket.findUnique({
        where: { metric_windowStart: { metric: "provider_requests_15m", windowStart: quarter.start } },
      }),
    ]);
    const value = (metric) => daily.find((row) => row.metric === metric)?.amount ?? 0n;
    const databaseBytes = Array.isArray(databaseRows) ? Number(databaseRows[0]?.bytes ?? 0) : 0;
    return operationalUsageSchema.parse({
      rawStorageBytes: Number(raw._sum.byteSize ?? 0),
      databaseBytes,
      invocationsDaily: Number(value("invocations_daily")),
      bandwidthBytesDaily: Number(value("bandwidth_bytes_daily")),
      providerRequests15Minutes: Number(providerQuarter?.amount ?? 0),
      providerRequestsDaily: Number(value("provider_requests_daily")),
    });
  }

  #increment(metric, amount, occurredAt) {
    if (!metrics.has(metric)) throw new Error("Operational usage metric is invalid");
    return increment(this.#prisma, metric, amount, validDate(occurredAt));
  }
}

async function increment(client, metric, amount, occurredAt) {
  const window = windowFor(metric, occurredAt);
  return client.operationalUsageBucket.upsert({
    where: { metric_windowStart: { metric, windowStart: window.start } },
    create: { metric, windowStart: window.start, windowEnd: window.end, amount },
    update: { amount: { increment: amount }, windowEnd: window.end },
  });
}

function windowFor(metric, occurredAt) {
  const start = new Date(occurredAt);
  if (metric === "provider_requests_15m") {
    start.setUTCMinutes(Math.floor(start.getUTCMinutes() / 15) * 15, 0, 0);
    return { start, end: new Date(start.getTime() + 15 * 60 * 1_000) };
  }
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1_000) };
}

function validAmount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Operational usage amount is invalid");
  return value;
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Operational usage time is invalid");
  return date;
}
