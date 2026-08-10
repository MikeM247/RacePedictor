import { createHash } from "node:crypto";
import { assertAthleteScope } from "./athlete-scope.js";

const PROVIDER = "strava";
const NORMALIZER_VERSION = "strava-canonical.v1";
const RAW_KIND = Object.freeze({
  detail: "activity_detail",
  laps: "activity_laps",
  streams: "activity_streams",
});

export class PrismaStravaIngestionUnitOfWork {
  #prisma;

  constructor({ prisma }) {
    if (!prisma || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma client is required");
    }
    this.#prisma = prisma;
  }

  async run(scope, operation) {
    const athleteId = assertAthleteScope(scope);
    if (typeof operation !== "function") throw new Error("A transaction operation is required");
    return this.#prisma.$transaction(async (transaction) => {
      const context = { athleteId, transaction };
      return operation({
        activities: {
          resolveTarget: (candidate) => resolveTarget(context, candidate),
          upsert: (input) => upsertActivity(context, input),
          tombstone: (input) => tombstoneActivity(context, input),
        },
        sync: {
          append: (input) => appendSyncChange(context, input),
        },
        analytics: {
          requestActivityRecompute: (input) => markAnalyticsRecompute(context, input),
        },
      });
    }, { isolationLevel: "Serializable" });
  }
}

async function resolveTarget({ athleteId, transaction }, candidate) {
  assertCandidate(candidate);
  const providerSource = await transaction.activitySourceReference.findUnique({
    where: {
      athleteId_sourceType_sourceObjectId: {
        athleteId,
        sourceType: PROVIDER,
        sourceObjectId: candidate.providerActivityId,
      },
    },
    include: { activity: true },
  });
  if (providerSource?.activity && !providerSource.activity.deletedAt) {
    return resolution("existing_provider", providerSource.activity);
  }

  const exact = await transaction.activity.findUnique({
    where: { athleteId_dedupeHash: { athleteId, dedupeHash: candidate.dedupeHash } },
  });
  if (isCrossSourceCandidate(exact)) return resolution("manual_match", exact);

  const occurredAt = new Date(candidate.occurredAt);
  const candidates = await transaction.activity.findMany({
    where: {
      athleteId,
      sourceType: { in: ["manual", "gpx", "tcx", "csv"] },
      sport: candidate.sport,
      deletedAt: null,
      occurredAt: {
        gte: new Date(occurredAt.getTime() - 5 * 60_000),
        lte: new Date(occurredAt.getTime() + 5 * 60_000),
      },
    },
  });
  const matches = candidates.filter((activity) => fuzzyMatch(activity, candidate));
  if (matches.length === 1) return resolution("manual_match", matches[0]);
  if (matches.length > 1) return { kind: "ambiguous", candidateCount: matches.length };
  return { kind: "new" };
}

function resolution(kind, activity) {
  return {
    kind,
    activityId: activity.id,
    canonicalCreatedAt: iso(activity.createdAt),
    canonicalSource: {
      sourceType: activity.sourceType,
      sourceFileId: activity.sourceFileId ?? null,
      sourceActivityId: activity.sourceActivityId ?? null,
    },
  };
}

async function upsertActivity(context, input) {
  assertUpsertInput(context.athleteId, input);
  const { athleteId, transaction } = context;
  const existing = await transaction.activity.findUnique({
    where: { id_athleteId: { id: input.activity.id, athleteId } },
  });
  const connection = await transaction.providerConnection.findUnique({
    where: { athleteId_provider: { athleteId, provider: PROVIDER } },
  });
  if (!connection) throw new Error("Strava connection is unavailable for canonical persistence");

  const rawObjects = {};
  for (const key of Object.keys(RAW_KIND)) {
    rawObjects[key] = await persistRawObject(transaction, {
      athleteId,
      providerConnectionId: connection.id,
      providerActivityId: input.providerActivityId,
      kind: RAW_KIND[key],
      metadata: input.rawObjects[key],
    });
  }

  const activityData = toActivityData(input.activity);
  if (existing) {
    await transaction.activity.update({
      where: { id_athleteId: { id: input.activity.id, athleteId } },
      data: { ...activityData, deletedAt: null },
    });
  } else {
    await transaction.activity.create({
      data: { id: input.activity.id, athleteId, ...activityData, deletedAt: null },
    });
  }

  await transaction.activitySplitKm.deleteMany({ where: { activityId: input.activity.id, athleteId } });
  if (input.activity.splits.length > 0) {
    await transaction.activitySplitKm.createMany({
      data: input.activity.splits.map((split) => toSplitData(athleteId, input.activity.id, split)),
    });
  }
  await persistRouteSignature(transaction, athleteId, input.activity.id, input.activity.routeSignature ?? null);

  await transaction.activitySourceReference.upsert({
    where: {
      athleteId_sourceType_sourceObjectId: {
        athleteId,
        sourceType: PROVIDER,
        sourceObjectId: input.providerActivityId,
      },
    },
    create: {
      athleteId,
      activityId: input.activity.id,
      providerConnectionId: connection.id,
      rawObjectId: rawObjects.detail.id,
      sourceType: PROVIDER,
      sourceObjectId: input.providerActivityId,
      deletedAt: null,
    },
    update: {
      activityId: input.activity.id,
      providerConnectionId: connection.id,
      rawObjectId: rawObjects.detail.id,
      deletedAt: null,
    },
  });

  const contentHash = canonicalHash({
    activity: input.activity,
    rawChecksums: Object.keys(RAW_KIND).map((key) => [key, input.rawObjects[key].checksumSha256]),
  });
  const latest = await transaction.activityRevision.findFirst({
    where: { athleteId, activityId: input.activity.id },
    orderBy: { revisionNumber: "desc" },
  });
  if (latest?.contentHash === contentHash) {
    return {
      activity: input.activity,
      revision: latest.revisionNumber,
      created: !existing,
      changed: false,
    };
  }

  const revision = (latest?.revisionNumber ?? 0) + 1;
  await transaction.activityRevision.create({
    data: {
      athleteId,
      activityId: input.activity.id,
      rawObjectId: rawObjects.detail.id,
      revisionNumber: revision,
      contentHash,
      normalizerVersion: NORMALIZER_VERSION,
      changeSummary: {
        source: input.source,
        aspect: input.aspect,
        providerObservedAt: input.providerObservedAt,
        providerCapturedAt: input.providerCapturedAt,
        rawObjectIds: Object.fromEntries(Object.entries(rawObjects).map(([key, value]) => [key, value.id])),
      },
      recordedAt: new Date(input.providerCapturedAt),
    },
  });
  return { activity: input.activity, revision, created: !existing, changed: true };
}

async function tombstoneActivity({ athleteId, transaction }, input) {
  assertIdentifier(input?.providerActivityId, "Provider activity id");
  const changedAt = validDate(input.changedAt, "Tombstone time");
  if (!["provider_delete", "provider_not_found"].includes(input.reason)) {
    throw new Error("Tombstone reason is invalid");
  }
  const source = await transaction.activitySourceReference.findUnique({
    where: {
      athleteId_sourceType_sourceObjectId: {
        athleteId,
        sourceType: PROVIDER,
        sourceObjectId: input.providerActivityId,
      },
    },
    include: { activity: true },
  });
  if (!source?.activity) {
    return {
      activityId: `activity_strava_${input.providerActivityId}`,
      occurredAt: changedAt.toISOString(),
      revision: 0,
      changed: false,
    };
  }
  if (source.deletedAt) {
    const latest = await transaction.activityRevision.findFirst({
      where: { athleteId, activityId: source.activity.id },
      orderBy: { revisionNumber: "desc" },
    });
    return {
      activityId: source.activity.id,
      occurredAt: iso(source.activity.occurredAt),
      revision: latest?.revisionNumber ?? 0,
      changed: false,
    };
  }
  const latest = await transaction.activityRevision.findFirst({
    where: { athleteId, activityId: source.activity.id },
    orderBy: { revisionNumber: "desc" },
  });
  await transaction.activitySourceReference.update({
    where: {
      athleteId_sourceType_sourceObjectId: {
        athleteId,
        sourceType: PROVIDER,
        sourceObjectId: input.providerActivityId,
      },
    },
    data: { deletedAt: changedAt },
  });
  if (source.activity.sourceType !== PROVIDER) {
    return {
      activityId: source.activity.id,
      occurredAt: iso(source.activity.occurredAt),
      revision: latest?.revisionNumber ?? 0,
      changed: false,
    };
  }
  if (source.activity.deletedAt) {
    return {
      activityId: source.activity.id,
      occurredAt: iso(source.activity.occurredAt),
      revision: latest?.revisionNumber ?? 0,
      changed: false,
    };
  }

  await transaction.activity.update({
    where: { id_athleteId: { id: source.activity.id, athleteId } },
    data: { deletedAt: changedAt },
  });
  const revision = (latest?.revisionNumber ?? 0) + 1;
  await transaction.activityRevision.create({
    data: {
      athleteId,
      activityId: source.activity.id,
      rawObjectId: source.rawObjectId ?? null,
      revisionNumber: revision,
      contentHash: canonicalHash({
        previousContentHash: latest?.contentHash ?? null,
        tombstone: { changedAt: changedAt.toISOString(), reason: input.reason },
      }),
      normalizerVersion: NORMALIZER_VERSION,
      changeSummary: { aspect: "delete", reason: input.reason, changedAt: changedAt.toISOString() },
      recordedAt: changedAt,
    },
  });
  return {
    activityId: source.activity.id,
    occurredAt: iso(source.activity.occurredAt),
    revision,
    changed: true,
  };
}

async function appendSyncChange({ athleteId, transaction }, input) {
  assertIdentifier(input?.entityId, "Sync entity id");
  if (!Number.isInteger(input.entityRevision) || input.entityRevision < 1) throw new Error("Sync revision is invalid");
  if (!["upsert", "delete"].includes(input.operation)) throw new Error("Sync operation is invalid");
  const latest = await transaction.syncChange.aggregate({
    where: { athleteId },
    _max: { cursor: true },
  });
  await transaction.syncChange.create({
    data: {
      athleteId,
      cursor: (latest._max.cursor ?? 0n) + 1n,
      entityType: "activity",
      entityId: input.entityId,
      operation: input.operation,
      entityVersion: input.entityRevision,
      selectedFields: input.payload,
      occurredAt: validDate(input.changedAt, "Sync change time"),
    },
  });
}

async function markAnalyticsRecompute({ athleteId, transaction }, input) {
  assertIdentifier(input?.activityId, "Analytics activity id");
  if (!["activity_upsert", "activity_delete"].includes(input.reason)) {
    throw new Error("Analytics recompute reason is invalid");
  }
  const activityOccurredAt = validDate(input.occurredAt, "Activity occurrence time");
  await transaction.analyticsRecomputeMarker.upsert({
    where: { athleteId_activityId: { athleteId, activityId: input.activityId } },
    create: {
      athleteId,
      activityId: input.activityId,
      reason: input.reason,
      activityOccurredAt,
      requestedAt: new Date(),
    },
    update: { reason: input.reason, activityOccurredAt, requestedAt: new Date() },
  });
}

async function persistRawObject(transaction, input) {
  assertRawMetadata(input.athleteId, input.metadata);
  const existing = await transaction.rawObject.findUnique({
    where: { storageProvider_storageKey: { storageProvider: "r2", storageKey: input.metadata.key } },
  });
  if (existing) {
    if (
      existing.athleteId !== input.athleteId
      || existing.provider !== PROVIDER
      || existing.kind !== input.kind
      || existing.providerObjectId !== input.providerActivityId
      || existing.checksumSha256 !== input.metadata.checksumSha256
    ) {
      throw new Error("Raw object metadata conflicts with immutable storage");
    }
    return existing;
  }
  const latest = await transaction.rawObject.findFirst({
    where: {
      athleteId: input.athleteId,
      provider: PROVIDER,
      kind: input.kind,
      providerObjectId: input.providerActivityId,
    },
    orderBy: { objectVersion: "desc" },
  });
  return transaction.rawObject.create({
    data: {
      athleteId: input.athleteId,
      providerConnectionId: input.providerConnectionId,
      provider: PROVIDER,
      kind: input.kind,
      providerObjectId: input.providerActivityId,
      objectVersion: (latest?.objectVersion ?? 0) + 1,
      storageProvider: "r2",
      storageKey: input.metadata.key,
      checksumSha256: input.metadata.checksumSha256,
      contentType: input.metadata.contentType,
      byteSize: input.metadata.sizeBytes,
      createdAt: validDate(input.metadata.capturedAt, "Raw object capture time"),
    },
  });
}

async function persistRouteSignature(transaction, athleteId, activityId, route) {
  if (!route) {
    await transaction.routeSignature.deleteMany({ where: { athleteId, activityId } });
    return;
  }
  const data = {
    id: route.id,
    athleteId,
    activityId,
    startLat: route.startLat,
    startLon: route.startLon,
    endLat: route.endLat,
    endLon: route.endLon,
    bboxMinLat: route.bboxMinLat,
    bboxMinLon: route.bboxMinLon,
    bboxMaxLat: route.bboxMaxLat,
    bboxMaxLon: route.bboxMaxLon,
    polyline: route.polyline ?? null,
    elevProfile: route.elevProfile ?? null,
    routeHash: route.routeHash,
    createdAt: validDate(route.createdAt, "Route creation time"),
  };
  await transaction.routeSignature.upsert({
    where: { activityId_athleteId: { activityId, athleteId } },
    create: data,
    update: data,
  });
}

function toActivityData(activity) {
  return {
    sourceType: activity.sourceType,
    sourceFileId: activity.sourceFileId ?? null,
    sourceActivityId: activity.sourceActivityId ?? null,
    title: activity.title ?? null,
    occurredAt: validDate(activity.occurredAt, "Activity occurrence time"),
    localOccurredAt: activity.localOccurredAt ?? null,
    endedAt: validDate(activity.endedAt, "Activity end time"),
    elapsedTimeS: activity.elapsedTimeS,
    movingTimeS: activity.movingTimeS ?? null,
    sport: activity.sport,
    distanceM: activity.distanceM,
    avgPaceSecPerKm: activity.avgPaceSecPerKm,
    best1kSec: activity.best1kSec ?? null,
    best5kSec: activity.best5kSec ?? null,
    elevationGainM: activity.elevationGainM,
    elevationLossM: activity.elevationLossM,
    minElevationM: activity.minElevationM ?? null,
    maxElevationM: activity.maxElevationM ?? null,
    avgHrBpm: activity.avgHrBpm ?? null,
    maxHrBpm: activity.maxHrBpm ?? null,
    minHrBpm: activity.minHrBpm ?? null,
    hrAvailable: activity.hrAvailable,
    avgCadenceSpm: activity.avgCadenceSpm ?? null,
    maxCadenceSpm: activity.maxCadenceSpm ?? null,
    cadenceAvailable: activity.cadenceAvailable,
    calories: activity.calories ?? null,
    avgPowerW: activity.avgPowerW ?? null,
    maxPowerW: activity.maxPowerW ?? null,
    lapCount: activity.lapCount ?? null,
    paceVariability: activity.paceVariability ?? null,
    hrDriftPct: activity.hrDriftPct ?? null,
    hillDifficulty: activity.hillDifficulty ?? null,
    dedupeHash: activity.dedupeHash,
    createdAt: validDate(activity.createdAt, "Activity creation time"),
  };
}

function toSplitData(athleteId, activityId, split) {
  return {
    id: split.id,
    athleteId,
    activityId,
    splitIndex: split.splitIndex,
    startOffsetS: split.startOffsetS,
    endOffsetS: split.endOffsetS,
    durationS: split.durationS,
    distanceM: split.distanceM,
    paceSecPerKm: split.paceSecPerKm,
    elevGainM: split.elevGainM,
    elevLossM: split.elevLossM,
    avgHrBpm: split.avgHrBpm ?? null,
    maxHrBpm: split.maxHrBpm ?? null,
    avgCadenceSpm: split.avgCadenceSpm ?? null,
    createdAt: validDate(split.createdAt, "Split creation time"),
  };
}

function fuzzyMatch(activity, candidate) {
  const elapsed = Number(activity.elapsedTimeS);
  const distance = Number(activity.distanceM);
  const elevation = Number(activity.elevationGainM);
  return Math.abs(elapsed - candidate.elapsedTimeS) <= Math.max(60, candidate.elapsedTimeS * 0.02)
    && Math.abs(distance - candidate.distanceM) <= Math.max(100, candidate.distanceM * 0.02)
    && Math.abs(elevation - candidate.elevationGainM) <= Math.max(20, candidate.elevationGainM * 0.1);
}

function isCrossSourceCandidate(activity) {
  return Boolean(activity && activity.sourceType !== PROVIDER && !activity.deletedAt);
}

function assertCandidate(candidate) {
  assertIdentifier(candidate?.providerActivityId, "Provider activity id");
  validDate(candidate.occurredAt, "Candidate occurrence time");
  if (typeof candidate.dedupeHash !== "string" || candidate.dedupeHash.length === 0) {
    throw new Error("Candidate dedupe hash is invalid");
  }
}

function assertUpsertInput(athleteId, input) {
  assertIdentifier(input?.providerActivityId, "Provider activity id");
  if (!input.activity || input.activity.athleteId !== athleteId) {
    throw new Error("Canonical activity athlete scope is invalid");
  }
  if (!input.rawObjects || Object.keys(RAW_KIND).some((key) => !input.rawObjects[key])) {
    throw new Error("Canonical raw object references are incomplete");
  }
}

function assertRawMetadata(athleteId, metadata) {
  if (
    metadata?.athleteId !== athleteId
    || metadata.provider !== PROVIDER
    || typeof metadata.key !== "string"
    || !/^[a-f0-9]{64}$/u.test(metadata.checksumSha256)
  ) {
    throw new Error("Raw object metadata is invalid for this athlete");
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) {
    throw new Error(`${label} is invalid`);
  }
}

function validDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date;
}

function iso(value) {
  return validDate(value, "Stored date").toISOString();
}

function canonicalHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}
