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
  | "RATE_LIMITED"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_STATE_EXPIRED"
  | "OAUTH_STATE_REPLAYED"
  | "OAUTH_ACCESS_DENIED"
  | "OAUTH_SCOPE_INSUFFICIENT"
  | "INTERNAL_ERROR"
  | "PROVIDER_NOT_CONFIGURED"
  | "MODEL_UNAVAILABLE"
  | "CATALOG_UNAVAILABLE"
  | "VOICE_PROVIDER_NOT_CONFIGURED"
  | "VOICE_PROVIDER_TIMEOUT"
  | "VOICE_PROVIDER_UNAVAILABLE"
  | "VOICE_PROVIDER_RATE_LIMITED"
  | "VOICE_PROVIDER_REJECTED"
  | "VOICE_PROVIDER_INVALID_RESPONSE"
  | "VOICE_PROVIDER_AUDIO_TOO_LARGE"
  | "VOICE_TRANSCRIPT_TOO_LONG"
  | "VOICE_NO_SPEECH"
  | "VOICE_INVALID_AUDIO"
  | "VOICE_UNAVAILABLE"
  | "VOICE_BUDGET_EXHAUSTED"
  | "VOICE_OPERATION_BUSY"
  | "VOICE_OPERATION_CONFLICT"
  | "VOICE_REQUEST_CANCELLED"
  | "VOICE_CONTEXT_CHANGED"
  | "VOICE_RATE_LIMITED"
  | "VOICE_REPLY_TOO_LONG";

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown[];
  readonly headers: HeadersInit;

  constructor(status: number, code: ApiErrorCode, message: string, details: unknown[] = [], headers: HeadersInit = {}) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export function success(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

export function failure(error: unknown) {
  if (error instanceof ApiHttpError) {
    return Response.json({
      error: { code: error.code, message: error.message, details: error.details },
    }, { status: error.status, headers: error.headers });
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
