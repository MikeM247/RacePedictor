import { ZodError } from "zod";
import {
  LocalCoachingServiceError,
  createLocalCoachingService,
  type LocalCoachingService,
} from "../../../../lib/local-coaching-service.ts";

export class CoachingHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown[] = [],
  ) {
    super(message);
    this.name = "CoachingHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const conflictCodes = new Set([
  "CONFLICT",
  "REVISION_CONFLICT",
  "PLAN_ACTIVATION_REJECTED",
  "PLAN_NOT_READY",
  "ACTIVE_PLAN_REQUIRED",
  "GOAL_VERSION_MISMATCH",
  "ROUTINE_VERSION_MISMATCH",
  "CONTEXT_VERSION_MISMATCH",
  "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED",
]);

const notFoundCodes = new Set(["NOT_FOUND"]);

export function success(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

function failure(error: unknown) {
  if (error instanceof CoachingHttpError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })),
      },
    }, { status: 400 });
  }
  if (error instanceof LocalCoachingServiceError) {
    const status = notFoundCodes.has(error.code) ? 404 : conflictCodes.has(error.code) ? 409 : 400;
    const details = error.details === undefined
      ? []
      : Array.isArray(error.details)
        ? error.details
        : [error.details];
    return Response.json({
      error: {
        code: error.code,
        message: error.message,
        details,
      },
    }, { status });
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Coaching request failed", details: [] } },
    { status: 500 },
  );
}

export async function readJson(request: Request, { optional = false } = {}) {
  const text = await request.text();
  if (!text.trim()) {
    if (optional) return {};
    throw new CoachingHttpError(400, "VALIDATION_ERROR", "A JSON request body is required");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CoachingHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

export function parseDate(value: string | null, name: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CoachingHttpError(400, "VALIDATION_ERROR", `${name} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new CoachingHttpError(400, "VALIDATION_ERROR", `${name} must be a real calendar date`);
  }
  return value;
}

export async function withCoachingService(
  handler: (service: LocalCoachingService) => unknown | Promise<unknown>,
  options: { clock?: () => Date } = {},
) {
  let service: LocalCoachingService | undefined;
  try {
    service = createLocalCoachingService({
      athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
      clock: options.clock,
    });
    return success(await handler(service));
  } catch (error) {
    return failure(error);
  } finally {
    service?.close();
  }
}
