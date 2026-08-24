import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import {
  registerPairedDeviceRequestSchema,
  syncAcknowledgeRequestSchema,
  syncChangesQuerySchema,
  syncFailureRequestSchema,
} from "../../../../packages/core/src/contracts/sync.ts";
import { secondBrainContextSnapshotSchema } from "../../../../packages/core/src/contracts/second-brain-context.ts";
import { trainingPlanSchema } from "../../../../packages/core/src/contracts/coaching.ts";
import { PairedDeviceError, type AuthenticatedDevice } from "../../../../packages/core/src/use-cases/paired-device.ts";
import {
  CloudSyncCursorError,
  SecondBrainSnapshotConflictError,
  TrainingPlanProjectionConflictError,
} from "../../../../packages/db/src/cloud/index.js";
import { ApiHttpError, success } from "./api-response.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { getDeviceSyncComposition } from "./device-sync-composition.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

export type DeviceSyncComposition = ReturnType<typeof getDeviceSyncComposition>;
export type GetDeviceSyncComposition = () => DeviceSyncComposition;

export async function handleListDevices(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  return success({ devices: await getComposition().deviceService.list(requireOwnerScope(security)) });
}

export async function handleEnrollDevice(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  const scope = requireOwnerScope(security);
  const body = await readJson(request);
  const parsed = registerPairedDeviceRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Device enrollment is invalid");
  try {
    return success(await getComposition().deviceService.enroll(scope, parsed.data), 201);
  } catch (error) {
    if (error instanceof PairedDeviceError && error.code === "ENROLLMENT_REPLAYED") {
      throw new ApiHttpError(409, "CONFLICT", "This device enrollment was already used");
    }
    if (error instanceof PairedDeviceError) {
      throw new ApiHttpError(404, "NOT_FOUND", "Device enrollment is unavailable");
    }
    throw error;
  }
}

export async function handleRevokeDevice(
  security: SensitiveRouteContext,
  deviceId: string,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  try {
    return success({ device: await getComposition().deviceService.revoke(requireOwnerScope(security), normalizedId(deviceId)) });
  } catch (error) {
    if (error instanceof PairedDeviceError) {
      throw new ApiHttpError(404, "NOT_FOUND", "Paired device was not found");
    }
    throw error;
  }
}

export async function handleDeviceChanges(
  security: AuthenticatedDevice,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  const params = new URL(request.url).searchParams;
  const parsed = syncChangesQuerySchema.safeParse({
    after: params.get("after"),
    limit: params.has("limit") ? Number(params.get("limit")) : undefined,
  });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Sync query is invalid");
  try {
    const result = await getComposition().changes.list(athleteScopeFor(security.actor), parsed.data);
    await getComposition().usage.recordBandwidth(new TextEncoder().encode(JSON.stringify(result)).byteLength);
    return success(result);
  } catch (error) {
    if (error instanceof CloudSyncCursorError) {
      throw new ApiHttpError(409, "CONFLICT", "The sync cursor is invalid or no longer available");
    }
    throw error;
  }
}

export async function handleDeviceAcknowledge(
  security: AuthenticatedDevice,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  const parsed = syncAcknowledgeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Sync acknowledgement is invalid");
  const device = await getComposition().deviceService.acknowledge(
    athleteScopeFor(security.actor),
    security.device.id,
    parsed.data.cursor,
  );
  return success({ device });
}

export async function handleDeviceFailure(
  security: AuthenticatedDevice,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  const parsed = syncFailureRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Sync failure report is invalid");
  const device = await getComposition().deviceService.recordFailure(
    athleteScopeFor(security.actor), security.device.id, parsed.data.diagnosticCode,
  );
  return success({ device });
}

export async function handlePublishSecondBrainSnapshot(
  security: AuthenticatedDevice,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
  isSecondBrainSyncEnabled: () => boolean = () => readCloudEnvironment().features.secondBrainSync,
) {
  if (!isSecondBrainSyncEnabled()) {
    throw new ApiHttpError(503, "UNAVAILABLE", "Selected Second Brain sync is not enabled");
  }
  const parsed = secondBrainContextSnapshotSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Selected Second Brain context is invalid");
  try {
    return success(await getComposition().snapshots.storeImmutable(
      athleteScopeFor(security.actor),
      parsed.data,
      security.device.id,
    ), 201);
  } catch (error) {
    if (error instanceof SecondBrainSnapshotConflictError) {
      throw new ApiHttpError(409, "CONFLICT", "The Second Brain revision conflicts with immutable history");
    }
    throw error;
  }
}

export async function handlePublishApprovedPlan(
  security: AuthenticatedDevice,
  request: Request,
  getComposition: GetDeviceSyncComposition = getDeviceSyncComposition,
) {
  const parsed = trainingPlanSchema.safeParse(await readJson(request));
  if (!parsed.success || !["active", "retired"].includes(parsed.data.status)) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Only an explicitly approved plan can be published");
  }
  try {
    return success(await getComposition().plans.publishApproved(
      athleteScopeFor(security.actor), parsed.data, security.device.id,
    ), 201);
  } catch (error) {
    if (error instanceof TrainingPlanProjectionConflictError) {
      throw new ApiHttpError(409, "CONFLICT", "The approved plan conflicts with its immutable projection");
    }
    throw error;
  }
}

function requireOwnerScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated" || security.actor.credentialKind === "device") {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Owner authentication is required");
  }
  return athleteScopeFor(security.actor);
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

function normalizedId(value: string) {
  const result = decodeURIComponent(value).trim();
  if (!/^device_[A-Za-z0-9]+$/u.test(result)) throw new ApiHttpError(404, "NOT_FOUND", "Paired device was not found");
  return result;
}
