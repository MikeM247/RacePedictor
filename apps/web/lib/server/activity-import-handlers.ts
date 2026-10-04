import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { after } from "next/server.js";
import { importUploadRequestSchema } from "../../../../packages/core/src/contracts/imports.ts";
import { CloudActivityImportError } from "../../../../packages/db/src/cloud/index.js";
import { getActivityImportComposition } from "./activity-import-composition.ts";
import { ApiHttpError, success } from "./api-response.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

function ownerScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated") throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Cloud upload is not available in local mode");
  if (security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  if (!security.actor.activeAthleteId) throw new ApiHttpError(403, "FORBIDDEN", "An active athlete is required");
  return athleteScopeFor(security.actor);
}

export async function handleCloudUploadInitiate(security: SensitiveRouteContext, request: Request) {
  const scope = ownerScope(security);
  const body = await json(request);
  const parsed = importUploadRequestSchema.safeParse({ name: body?.name, type: body?.type, size: body?.size });
  if (!parsed.success || typeof body?.checksumSha256 !== "string") throw new ApiHttpError(400, "VALIDATION_ERROR", "Upload metadata is invalid");
  try {
    return success(await getActivityImportComposition().imports.initiate(scope, { filename: parsed.data.name, contentType: parsed.data.type, sizeBytes: parsed.data.size, checksumSha256: body.checksumSha256, idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null }));
  } catch (error) { throw mapImportError(error); }
}

export async function handleCloudUploadComplete(security: SensitiveRouteContext, request: Request) {
  const scope = ownerScope(security);
  const body = await json(request);
  if (!body || typeof body.importId !== "string" || typeof body.name !== "string" || typeof body.type !== "string" || typeof body.size !== "number" || typeof body.checksumSha256 !== "string") throw new ApiHttpError(400, "VALIDATION_ERROR", "Upload completion metadata is invalid");
  try {
    const result = await getActivityImportComposition().imports.complete(scope, { importId: body.importId, filename: body.name, contentType: body.type, sizeBytes: body.size, checksumSha256: body.checksumSha256, utcOffset: typeof body.utcOffset === "string" ? body.utcOffset : "+02:00" });
    scheduleCoach(scope.athleteId);
    return success(result);
  } catch (error) { throw mapImportError(error); }
}

export async function handleCloudMultipartUpload(security: SensitiveRouteContext, file: File) {
  const scope = ownerScope(security);
  const metadata = importUploadRequestSchema.safeParse({ name: file.name, type: file.type, size: file.size });
  if (!metadata.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Uploaded file metadata is invalid");
  try {
    const result = await getActivityImportComposition().imports.importMultipart(scope, { filename: file.name, contentType: file.type, body: new Uint8Array(await file.arrayBuffer()) });
    scheduleCoach(scope.athleteId);
    return success(result);
  } catch (error) { throw mapImportError(error); }
}

async function json(request: Request) {
  try { return await request.json(); } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
}

function mapImportError(error: unknown) {
  if (error instanceof CloudActivityImportError) return new ApiHttpError(error.httpStatus, mapCode(error.code), error.message);
  return error;
}

function mapCode(code: string) {
  if (code === "NOT_FOUND") return "NOT_FOUND" as const;
  if (code === "INTEGRITY_ERROR") return "CONFLICT" as const;
  if (code === "PAYLOAD_TOO_LARGE") return "VALIDATION_ERROR" as const;
  if (code === "UNAVAILABLE") return "UNAVAILABLE" as const;
  return "VALIDATION_ERROR" as const;
}

function scheduleCoach(athleteId: string) {
  after(async () => {
    try {
      const { runCloudCoachFeedbackBatch } = await import("./activity-coach-worker.ts");
      await runCloudCoachFeedbackBatch({ athleteId, limit: 5 });
    } catch (error) {
      console.warn("Uploaded activity coach feedback could not be scheduled", error instanceof Error ? error.message : "unknown error");
    }
  });
}
