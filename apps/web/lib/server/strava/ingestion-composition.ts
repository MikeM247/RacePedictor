import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server.js";
import type { AthleteScope } from "../../../../../packages/core/src/contracts/auth.ts";
import type { StravaBackfillRequest } from "../../../../../packages/core/src/contracts/strava.ts";
import { ProjectingStravaActivityClient } from "../../../../../packages/core/src/services/strava-activity-client.ts";
import { StravaIngestionService } from "../../../../../packages/core/src/services/strava-ingestion-service.ts";
import { StravaIngestionJobProcessor } from "../../../../../packages/core/src/use-cases/strava-ingestion-worker.ts";
import {
  PrismaStravaIngestionJobRepository,
  PrismaStravaIngestionUnitOfWork,
  PrismaOperationalUsageRepository,
  R2RawObjectStore,
  StravaCredentialAdapter,
} from "../../../../../packages/db/src/cloud/index.js";
import { CloudEnvironmentError, readCloudEnvironment } from "../cloud-environment.ts";
import { assertServerRuntime } from "../server-runtime.ts";
import { FetchStravaActivityTransport } from "./activity-transport.ts";
import { getStravaConnectionComposition } from "./composition.ts";

assertServerRuntime("strava/ingestion-composition");

const INITIAL_BACKFILL_DAYS = 90;
let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const environment = readCloudEnvironment();
  if (environment.cloudMode !== "enabled" || !environment.features.stravaIngestion) {
    throw new CloudEnvironmentError("Strava ingestion is disabled");
  }

  const connection = getStravaConnectionComposition();
  const now = () => new Date();
  const usage = new PrismaOperationalUsageRepository({ prisma: connection.prisma });
  const rawObjects = new R2RawObjectStore({
    bucket: required("R2_BUCKET"),
    endpoint: required("R2_ENDPOINT"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  });
  const jobs = new PrismaStravaIngestionJobRepository({ prisma: connection.prisma });
  const ingestion = new StravaIngestionService({
    client: new ProjectingStravaActivityClient({
      transport: new FetchStravaActivityTransport({
        observeResponse: ({ bodyBytes }) => usage.recordProviderResponse(bodyBytes, now()),
      }),
      now,
    }),
    credentials: new StravaCredentialAdapter({
      connections: connection.connections,
      connectionService: connection.service,
      now,
    }),
    rawObjects,
    unitOfWork: new PrismaStravaIngestionUnitOfWork({ prisma: connection.prisma }),
    digest: { sha256: (value) => createHash("sha256").update(value).digest("hex") },
    now,
  });
  const processor = new StravaIngestionJobProcessor({
    jobs,
    ingestion,
    connections: connection.service,
    now,
    createLeaseToken: () => randomUUID(),
  });

  const schedule = (jobId: string) => {
    const invocationId = `vercel:${randomUUID()}`;
    after(async () => {
      await processor.processJob(jobId, invocationId);
    });
  };

  return Object.freeze({
    processor,
    usage,
    schedule,
    async enqueueBackfill(scope: AthleteScope, request: StravaBackfillRequest) {
      const queued = await processor.enqueueBackfill(scope, request);
      schedule(queued.jobId);
      return queued;
    },
    async enqueueInitialBackfill(scope: AthleteScope) {
      const before = now();
      const afterDate = new Date(before.getTime() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1_000);
      const queued = await processor.enqueueBackfill(scope, {
        after: afterDate.toISOString(),
        before: before.toISOString(),
        pageSize: 30,
        maxPages: 5,
        maxActivities: 150,
      });
      schedule(queued.jobId);
      return queued;
    },
  });
}

export function getStravaIngestionComposition() {
  singleton ??= buildComposition();
  return singleton;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.length > 1024) throw new CloudEnvironmentError(`${name} is not configured`);
  return value;
}
