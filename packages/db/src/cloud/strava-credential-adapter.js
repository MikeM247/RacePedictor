import { assertAthleteScope } from "./athlete-scope.js";

const DEFAULT_REFRESH_WINDOW_SECONDS = 60 * 60;

/**
 * Bridges the ingestion service to the encrypted provider-connection store.
 * Refresh is deliberately delegated to StravaConnectionService so token
 * rotation remains a single, atomic repository operation.
 */
export class StravaCredentialAdapter {
  #connections;
  #connectionService;
  #now;
  #refreshWindowMs;

  constructor({
    connections,
    connectionService,
    now = () => new Date(),
    refreshWindowSeconds = DEFAULT_REFRESH_WINDOW_SECONDS,
  }) {
    if (!connections || typeof connections.getCredentials !== "function") {
      throw new Error("A provider connection repository is required");
    }
    if (!connectionService || typeof connectionService.refresh !== "function") {
      throw new Error("A Strava connection service is required");
    }
    if (!Number.isInteger(refreshWindowSeconds) || refreshWindowSeconds < 0) {
      throw new Error("Credential refresh window is invalid");
    }
    this.#connections = connections;
    this.#connectionService = connectionService;
    this.#now = now;
    this.#refreshWindowMs = refreshWindowSeconds * 1_000;
  }

  async getAccessToken(scope) {
    assertAthleteScope(scope);
    const credentials = await this.#load(scope);
    const expiresAt = Date.parse(credentials.expiresAt);
    if (!Number.isFinite(expiresAt)) throw new Error("Stored Strava credentials are invalid");
    if (expiresAt <= this.#now().getTime() + this.#refreshWindowMs) {
      return this.refreshAccessToken(scope);
    }
    return credentials.accessToken;
  }

  async refreshAccessToken(scope) {
    assertAthleteScope(scope);
    await this.#connectionService.refresh(scope);
    return (await this.#load(scope)).accessToken;
  }

  async #load(scope) {
    const credentials = await this.#connections.getCredentials(scope, "strava");
    if (!credentials?.accessToken || !credentials.refreshToken || !credentials.expiresAt) {
      throw new Error("Strava is not connected for this athlete");
    }
    return credentials;
  }
}
