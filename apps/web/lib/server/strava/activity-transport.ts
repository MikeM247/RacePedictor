import type {
  StravaActivityTransport,
  StravaTransportResponse,
} from "../../../../../packages/core/src/services/strava-activity-client.ts";
import { assertServerRuntime } from "../server-runtime.ts";

assertServerRuntime("strava/activity-transport");

const STRAVA_API_ORIGIN = "https://www.strava.com";
const STRAVA_API_PREFIX = "/api/v3";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface FetchStravaActivityTransportOptions {
  fetch?: typeof fetch;
  maxResponseBytes?: number;
  observeResponse?: (input: { bodyBytes: number; headers: Readonly<Record<string, string | undefined>> }) => void | Promise<void>;
}

/**
 * Server-only transport for the minimized core Strava client. It exposes only
 * response headers used for retry decisions and never includes a bearer token
 * in a returned value or diagnostic.
 */
export class FetchStravaActivityTransport implements StravaActivityTransport {
  readonly #fetch: typeof fetch;
  readonly #maxResponseBytes: number;
  readonly #observeResponse: FetchStravaActivityTransportOptions["observeResponse"];

  constructor(options: FetchStravaActivityTransportOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    this.#observeResponse = options.observeResponse;
    if (!Number.isInteger(this.#maxResponseBytes) || this.#maxResponseBytes < 1 || this.#maxResponseBytes > MAX_RESPONSE_BYTES) {
      throw new Error("Strava response limit is invalid");
    }
  }

  async request(input: {
    accessToken: string;
    path: string;
    query?: Readonly<Record<string, string>>;
  }): Promise<StravaTransportResponse> {
    assertAccessToken(input.accessToken);
    const url = stravaApiUrl(input.path, input.query);
    const response = await this.#fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
      redirect: "error",
    });

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.#maxResponseBytes) {
      throw new Error("Strava response exceeded the configured limit");
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > this.#maxResponseBytes) {
      throw new Error("Strava response exceeded the configured limit");
    }

    const headers = Object.freeze({
        "content-type": response.headers.get("content-type") ?? undefined,
        "retry-after": response.headers.get("retry-after") ?? undefined,
        "x-ratelimit-limit": response.headers.get("x-ratelimit-limit") ?? undefined,
        "x-ratelimit-usage": response.headers.get("x-ratelimit-usage") ?? undefined,
        "x-readratelimit-limit": response.headers.get("x-readratelimit-limit") ?? undefined,
        "x-readratelimit-usage": response.headers.get("x-readratelimit-usage") ?? undefined,
      });
    await this.#observeResponse?.({ bodyBytes: body.byteLength, headers });
    return Object.freeze({
      status: response.status,
      headers,
      body,
    });
  }
}

export function stravaApiUrl(path: string, query: Readonly<Record<string, string>> = {}) {
  if (
    typeof path !== "string"
    || !path.startsWith("/")
    || path.startsWith("//")
    || path.includes("\\")
    || path.split("/").includes("..")
  ) {
    throw new Error("Strava API path is invalid");
  }
  const url = new URL(`${STRAVA_API_PREFIX}${path}`, STRAVA_API_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (!/^[a-z_]+$/.test(key) || typeof value !== "string" || value.length > 512) {
      throw new Error("Strava API query is invalid");
    }
    url.searchParams.set(key, value);
  }
  return url;
}

function assertAccessToken(value: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || /[\r\n]/.test(value)) {
    throw new Error("Strava access token is invalid");
  }
}
