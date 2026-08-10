import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class PrismaOnlineStatusRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.providerConnection || !prisma?.ingestionJob || !prisma?.activity) {
      throw new Error("A Prisma cloud status client is required");
    }
    this.#prisma = prisma;
  }

  async getFacts(scope) {
    const athleteId = assertAthleteScope(scope);
    const [provider, pendingJobs, failedJobs, event, revision, activity, device, snapshot] = await Promise.all([
      this.#prisma.providerConnection.findUnique({
        where: { athleteId_provider: { athleteId, provider: "strava" } },
        select: {
          status: true,
          connectedAt: true,
          lastProviderContactAt: true,
          lastErrorCode: true,
        },
      }),
      this.#prisma.ingestionJob.count({
        where: { athleteId, status: { in: ["queued", "processing"] } },
      }),
      this.#prisma.ingestionJob.count({
        where: { athleteId, status: { in: ["failed", "dead_letter"] } },
      }),
      this.#prisma.providerWebhookEvent.findFirst({
        where: { athleteId },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      this.#prisma.activityRevision.findFirst({
        where: { athleteId },
        orderBy: { recordedAt: "desc" },
        select: { recordedAt: true },
      }),
      this.#prisma.activity.findFirst({
        where: { athleteId, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      this.#prisma.pairedDevice.findFirst({
        where: { athleteId },
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
        select: { name: true, status: true, createdAt: true, lastSeenAt: true, lastErrorCode: true },
      }),
      this.#prisma.secondBrainSnapshot.findFirst({
        where: { athleteId },
        orderBy: { sourceRevision: "desc" },
        select: { sourceRevision: true, publishedAt: true },
      }),
    ]);

    return immutableCopy({
      athleteId,
      provider: provider ? {
        displayStatus: displayStatus(provider.status, provider.lastErrorCode),
        connectedAt: provider.connectedAt?.toISOString() ?? null,
        lastProviderContactAt: provider.lastProviderContactAt?.toISOString() ?? null,
      } : null,
      ingestion: {
        lastEventAt: event?.receivedAt.toISOString() ?? null,
        lastCanonicalUpdateAt: revision?.recordedAt.toISOString() ?? null,
        pendingJobs,
        failedJobs,
      },
      latestActivityAt: activity?.occurredAt.toISOString() ?? null,
      device: device ? {
        name: device.name,
        status: device.status,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        lastErrorCode: device.lastErrorCode,
      } : null,
      secondBrain: snapshot ? {
        revision: snapshot.sourceRevision,
        publishedAt: snapshot.publishedAt.toISOString(),
      } : null,
    });
  }
}

function displayStatus(status, errorCode) {
  if (status === "connected") return "connected";
  if (status === "attention" || status === "revoked") {
    return errorCode?.endsWith("_FAILED") ? "error" : "action_required";
  }
  return errorCode ? "error" : "disconnected";
}
