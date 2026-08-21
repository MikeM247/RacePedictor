import { onlineStatusSchema, type OnlineStatus } from "../contracts/sync.ts";

const DEVICE_STALE_MS = 24 * 60 * 60 * 1_000;
const SECOND_BRAIN_STALE_MS = 48 * 60 * 60 * 1_000;

export type OnlineStatusFacts = Readonly<{
  athleteId: string;
  provider: null | Readonly<{
    displayStatus: "connected" | "action_required" | "disconnected" | "error";
    connectedAt: string | null;
    lastProviderContactAt: string | null;
  }>;
  ingestion: Readonly<{
    lastEventAt: string | null;
    lastCanonicalUpdateAt: string | null;
    pendingJobs: number;
    failedJobs: number;
  }>;
  latestActivityAt: string | null;
  device: null | Readonly<{
    name: string;
    status: "active" | "revoked";
    createdAt: string;
    lastSeenAt: string | null;
    lastErrorCode: string | null;
  }>;
  secondBrain: null | Readonly<{
    revision: number;
    publishedAt: string;
  }>;
}>;

export function projectOnlineStatus(facts: OnlineStatusFacts, now: Date): OnlineStatus {
  if (Number.isNaN(now.getTime())) throw new Error("Online status time is invalid");
  const updatedAt = now.toISOString();
  const providerState = !facts.provider
    ? "never"
    : facts.provider.displayStatus === "connected"
      ? "current"
      : facts.provider.displayStatus === "error"
        ? "unavailable"
        : facts.provider.displayStatus === "disconnected" && !facts.provider.connectedAt
          ? "never"
          : "action_required";

  const ingestionState = facts.ingestion.failedJobs > 0
    ? "action_required"
    : facts.ingestion.pendingJobs > 0
      ? "retrying"
      : providerState === "unavailable"
        ? "unavailable"
        : providerState === "action_required"
          ? "action_required"
          : !facts.ingestion.lastEventAt && !facts.ingestion.lastCanonicalUpdateAt
            ? "never"
            : "current";

  const activityState = !facts.latestActivityAt
    ? "never"
    : facts.ingestion.lastEventAt
      && (!facts.ingestion.lastCanonicalUpdateAt
        || Date.parse(facts.ingestion.lastEventAt) > Date.parse(facts.ingestion.lastCanonicalUpdateAt))
      ? "stale"
      : "current";

  const deviceStaleAfter = facts.device?.lastSeenAt
    ? new Date(Date.parse(facts.device.lastSeenAt) + DEVICE_STALE_MS).toISOString()
    : null;
  const deviceState = !facts.device
    ? "never"
    : facts.device.status === "revoked"
      ? "action_required"
      : facts.device.lastErrorCode
        ? "unavailable"
      : !facts.device.lastSeenAt
        ? "never"
        : Date.parse(deviceStaleAfter!) <= now.getTime()
          ? "stale"
          : "current";

  const secondBrainStaleAfter = facts.secondBrain
    ? new Date(Date.parse(facts.secondBrain.publishedAt) + SECOND_BRAIN_STALE_MS).toISOString()
    : null;
  const secondBrainState = !facts.secondBrain
    ? "never"
    : Date.parse(secondBrainStaleAfter!) <= now.getTime()
      ? "stale"
      : "current";

  return onlineStatusSchema.parse({
    athleteId: facts.athleteId,
    providerConnection: {
      state: providerState,
      provider: "strava",
      displayStatus: facts.provider?.displayStatus ?? "disconnected",
      lastSuccessfulAt: facts.provider?.lastProviderContactAt ?? null,
      lastProviderContactAt: facts.provider?.lastProviderContactAt ?? null,
      staleAfter: null,
    },
    ingestion: {
      state: ingestionState,
      lastSuccessfulAt: facts.ingestion.lastCanonicalUpdateAt,
      staleAfter: null,
      lastEventAt: facts.ingestion.lastEventAt,
      lastCanonicalUpdateAt: facts.ingestion.lastCanonicalUpdateAt,
      pendingJobs: facts.ingestion.pendingJobs,
      failedJobs: facts.ingestion.failedJobs,
    },
    activityData: {
      state: activityState,
      lastSuccessfulAt: facts.ingestion.lastCanonicalUpdateAt,
      staleAfter: activityState === "stale" ? facts.ingestion.lastEventAt : null,
      latestActivityAt: facts.latestActivityAt,
      lastCanonicalUpdateAt: facts.ingestion.lastCanonicalUpdateAt,
    },
    localDevice: {
      state: deviceState,
      lastSuccessfulAt: facts.device?.lastSeenAt ?? null,
      staleAfter: deviceStaleAfter,
      deviceName: facts.device?.name ?? null,
      deviceStatus: facts.device?.status ?? null,
      pairedAt: facts.device?.createdAt ?? null,
      lastSeenAt: facts.device?.lastSeenAt ?? null,
      lastErrorCode: facts.device?.lastErrorCode ?? null,
    },
    secondBrain: {
      state: secondBrainState,
      lastSuccessfulAt: facts.secondBrain?.publishedAt ?? null,
      staleAfter: secondBrainStaleAfter,
      latestRevision: facts.secondBrain?.revision ?? null,
      publishedAt: facts.secondBrain?.publishedAt ?? null,
    },
    updatedAt,
  });
}
