import { syncChangesResponseSchema } from "../../core/src/contracts/sync.ts";
import { secondBrainContextPublishApiResponseSchema } from "../../core/src/contracts/second-brain-context.ts";

export class RacePredictorSyncClient {
  #baseUrl;
  #fetch;

  constructor({ baseUrl, fetchImpl = globalThis.fetch }) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Local sync requires HTTPS outside localhost");
    }
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
    this.#baseUrl = url.origin;
    this.#fetch = fetchImpl;
  }

  async getChanges(token, { after, limit }) {
    const url = new URL("/api/v1/sync/device/changes", this.#baseUrl);
    if (after) url.searchParams.set("after", after);
    url.searchParams.set("limit", String(limit));
    return syncChangesResponseSchema.parse(await this.#request(token, url, { method: "GET" }));
  }

  async acknowledge(token, cursor) {
    return this.#request(token, new URL("/api/v1/sync/device/acknowledge", this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor }),
    });
  }

  async reportFailure(token, diagnosticCode) {
    return this.#request(token, new URL("/api/v1/sync/device/failure", this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagnosticCode }),
    });
  }

  async publishSecondBrain(token, snapshot) {
    return secondBrainContextPublishApiResponseSchema.parse(await this.#request(
      token,
      new URL("/api/v1/second-brain-context/snapshots", this.#baseUrl),
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) },
    ));
  }

  async publishApprovedPlan(token, plan) {
    return this.#request(token, new URL("/api/v1/sync/device/plans", this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan),
    });
  }

  async #request(token, url, init) {
    if (typeof token !== "string" || !token) throw new LocalSyncHttpError("DEVICE_CREDENTIAL_MISSING", 401);
    let response;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${token}` },
      });
    } catch {
      throw new LocalSyncHttpError("CLOUD_UNREACHABLE", 0);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.error?.code === "UNAUTHENTICATED" ? "DEVICE_AUTHENTICATION_FAILED"
        : response.status === 409 ? "SYNC_CONFLICT"
          : response.status >= 500 ? "CLOUD_UNAVAILABLE" : "CLOUD_REQUEST_REJECTED";
      throw new LocalSyncHttpError(code, response.status);
    }
    return payload;
  }
}

export class LocalSyncHttpError extends Error {
  constructor(code, status) {
    super("Local cloud sync request failed");
    this.name = "LocalSyncHttpError";
    this.code = code;
    this.status = status;
  }
}
