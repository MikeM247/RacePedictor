import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("api-response");

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_STATE_EXPIRED"
  | "OAUTH_STATE_REPLAYED"
  | "OAUTH_ACCESS_DENIED"
  | "OAUTH_SCOPE_INSUFFICIENT"
  | "INTERNAL_ERROR";

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown[];

  constructor(status: number, code: ApiErrorCode, message: string, details: unknown[] = []) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function success(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

export function failure(error: unknown) {
  if (error instanceof ApiHttpError) {
    return Response.json({
      error: { code: error.code, message: error.message, details: error.details },
    }, { status: error.status });
  }

  if (error instanceof Error && (error as { code?: unknown }).code === "CONFIGURATION_ERROR") {
    return Response.json({
      error: { code: "CONFIGURATION_ERROR", message: "Server configuration is invalid", details: [] },
    }, { status: 503 });
  }

  return Response.json({
    error: { code: "INTERNAL_ERROR", message: "Request failed", details: [] },
  }, { status: 500 });
}
