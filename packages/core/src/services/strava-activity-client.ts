import {
  projectStravaActivityDetail,
  projectStravaActivitySummaryPage,
  projectStravaLaps,
  projectStravaStreamSet,
} from "../contracts/strava.ts";
import { ZodError } from "zod";
import {
  StravaActivityClientError,
  StravaActivityPayloadError,
  type StravaActivityClient,
  type StravaPayload,
} from "../ports/strava-ingestion.ts";

export type StravaTransportResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
}>;

/**
 * Provider I/O stays outside the application service. An HTTP implementation can
 * inject fetch, observability, and connection pooling without exposing them here.
 */
export interface StravaActivityTransport {
  request(input: {
    accessToken: string;
    path: string;
    query?: Readonly<Record<string, string>>;
  }): Promise<StravaTransportResponse>;
}

/**
 * Converts full Strava responses into minimized DTOs while returning the exact
 * provider bytes alongside the projection for immutable raw storage.
 */
export class ProjectingStravaActivityClient implements StravaActivityClient {
  readonly #transport: StravaActivityTransport;
  readonly #now: () => Date;

  constructor(input: { transport: StravaActivityTransport; now: () => Date }) {
    this.#transport = input.transport;
    this.#now = input.now;
  }

  async fetchActivityDetail(input: { accessToken: string; providerActivityId: string }) {
    const response = await this.#request(input.accessToken, `/activities/${encodeURIComponent(input.providerActivityId)}`);
    return this.#project(response, projectStravaActivityDetail, "DETAIL");
  }

  async fetchActivityLaps(input: { accessToken: string; providerActivityId: string }) {
    const response = await this.#request(
      input.accessToken,
      `/activities/${encodeURIComponent(input.providerActivityId)}/laps`,
    );
    return this.#project(response, projectStravaLaps, "LAPS");
  }

  async fetchActivityStreams(input: Parameters<StravaActivityClient["fetchActivityStreams"]>[0]) {
    const response = await this.#request(
      input.accessToken,
      `/activities/${encodeURIComponent(input.providerActivityId)}/streams`,
      { keys: input.keys.join(","), key_by_type: "true" },
    );
    return this.#project(response, projectStravaStreamSet, "STREAMS");
  }

  async listActivities(input: Parameters<StravaActivityClient["listActivities"]>[0]) {
    const response = await this.#request(input.accessToken, "/athlete/activities", {
      after: String(input.afterEpochSeconds),
      before: String(input.beforeEpochSeconds),
      page: String(input.page),
      per_page: String(input.perPage),
    });
    return projectJson(response.body, projectStravaActivitySummaryPage, "SUMMARY");
  }

  async #request(
    accessToken: string,
    path: string,
    query?: Readonly<Record<string, string>>,
  ): Promise<StravaTransportResponse> {
    let response: StravaTransportResponse;
    try {
      response = await this.#transport.request({ accessToken, path, query });
    } catch (error) {
      throw error instanceof StravaActivityClientError
        ? error
        : new StravaActivityClientError("Strava transport failed", { status: null });
    }
    if (response.status >= 200 && response.status < 300) return response;
    throw new StravaActivityClientError("Strava request was rejected", {
      status: response.status,
      retryAt: response.status === 429 ? retryAtFrom(response.headers, this.#now()) : null,
    });
  }

  #project<T>(response: StravaTransportResponse, project: (payload: unknown) => T, stage: PayloadStage): StravaPayload<T> {
    return {
      data: projectJson(response.body, project, stage),
      rawBody: response.body,
      capturedAt: this.#now().toISOString(),
      contentType: "application/json",
    };
  }
}

type PayloadStage = "DETAIL" | "LAPS" | "STREAMS" | "SUMMARY";

function projectJson<T>(body: Uint8Array, project: (payload: unknown) => T, stage: PayloadStage): T {
  try {
    return project(JSON.parse(new TextDecoder().decode(body)) as unknown);
  } catch (error) {
    throw new StravaActivityPayloadError(undefined, payloadDiagnosticCode(error, stage));
  }
}

function payloadDiagnosticCode(error: unknown, stage: PayloadStage): string {
  if (error instanceof SyntaxError) return `STRAVA_PAYLOAD_INVALID_${stage}_JSON`;
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.filter((part): part is string => typeof part === "string")
      .map((part) => part.toUpperCase().replace(/[^A-Z0-9]+/g, "_"))
      .join("_") || "ROOT";
    return `STRAVA_PAYLOAD_INVALID_${stage}_${field}_${issue?.code.toUpperCase() ?? "SCHEMA"}`.slice(0, 80);
  }
  return `STRAVA_PAYLOAD_INVALID_${stage}_PROJECTION`;
}

function retryAtFrom(headers: Readonly<Record<string, string | undefined>>, now: Date): string | null {
  const value = header(headers, "retry-after");
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return new Date(now.getTime() + Number(value) * 1_000).toISOString();
  }
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function header(headers: Readonly<Record<string, string | undefined>>, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1]?.trim();
}
