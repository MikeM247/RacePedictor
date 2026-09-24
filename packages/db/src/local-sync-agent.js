import { buildSelectedSecondBrainSnapshot } from "../../core/src/services/second-brain-publisher.ts";
import { renderCloudSyncSummary, updateCloudSyncNote } from "./local-sync-note.js";

export class LocalCloudSyncAgent {
  #athleteId;
  #credentialStore;
  #client;
  #projection;
  #notePath;
  #noteWriter;
  #now;

  constructor({ athleteId, credentialStore, client, projection, notePath, noteWriter = updateCloudSyncNote, now = () => new Date() }) {
    if (typeof athleteId !== "string" || !athleteId) throw new Error("athleteId is required");
    this.#athleteId = athleteId;
    this.#credentialStore = credentialStore;
    this.#client = client;
    this.#projection = projection;
    this.#notePath = notePath;
    this.#noteWriter = noteWriter;
    this.#now = now;
  }

  async sync({ pageSize = 100, maxPages = 20 } = {}) {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error("pageSize is invalid");
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error("maxPages is invalid");
    const token = await this.#credentialStore.load();
    if (!token) throw new Error("No paired device credential is stored");
    let cursor = this.#projection.getCursor(this.#athleteId);
    let applied = 0;
    try {
      for (let page = 0; page < maxPages; page += 1) {
        const response = await this.#client.getChanges(token, { after: cursor, limit: pageSize });
        const changes = response.data.changes;
        if (changes.length === 0) {
          if (cursor) await this.#client.acknowledge(token, cursor);
          break;
        }
        const nextCursor = this.#projection.applyChanges(this.#athleteId, changes);
        if (!nextCursor) throw new Error("Cloud sync page did not produce a cursor");
        await this.#noteWriter(this.#notePath, renderCloudSyncSummary({
          cursor: nextCursor,
          entities: this.#projection.getCloudSyncNoteProjection(this.#athleteId),
        }));
        this.#projection.commitCursor(this.#athleteId, nextCursor);
        await this.#client.acknowledge(token, nextCursor);
        cursor = nextCursor;
        applied += changes.length;
        if (!response.data.hasMore) break;
        if (page === maxPages - 1) throw new Error("Cloud sync page limit reached");
      }
      return { athleteId: this.#athleteId, cursor, applied, status: "current" };
    } catch (error) {
      const code = diagnosticCode(error);
      this.#projection.recordFailure(this.#athleteId, code);
      await this.#client.reportFailure?.(token, code).catch(() => undefined);
      throw error;
    }
  }

  async publishSelectedSecondBrain({ selectedFields, sourceContext, logicalSourceRefs = [] }) {
    const snapshot = buildSelectedSecondBrainSnapshot({
      athleteId: this.#athleteId,
      revision: this.#projection.getNextSecondBrainRevision(this.#athleteId),
      publishedAt: this.#now().toISOString(),
      selectedFields,
      sourceContext,
    });
    const queued = this.#projection.queueSecondBrainPublication(this.#athleteId, snapshot, logicalSourceRefs);
    if (queued.status === "already_published") {
      return { snapshot: null, reused: true, skipped: true };
    }
    return this.drainSelectedSecondBrainOutbox();
  }

  async drainSelectedSecondBrainOutbox() {
    const pending = this.#projection.listPendingSecondBrainPublications(this.#athleteId);
    if (pending.length === 0) return { snapshot: null, reused: true, skipped: true };
    const token = await this.#credentialStore.load();
    if (!token) throw new Error("No paired device credential is stored");
    let result = null;
    try {
      for (const publication of pending) {
        this.#projection.markSecondBrainPublicationAttempt(this.#athleteId, publication.snapshot);
        const response = await this.#client.publishSecondBrain(token, publication.snapshot);
        if (!sameSnapshot(response.data.snapshot, publication.snapshot)) {
          throw new Error("Cloud Second Brain publication response does not match the queued snapshot");
        }
        this.#projection.recordSecondBrainPublication(
          this.#athleteId,
          response.data.snapshot,
          publication.logicalSourceRefs,
        );
        result = response.data;
      }
      return result;
    } catch (error) {
      const code = diagnosticCode(error) === "LOCAL_SYNC_FAILED" ? "SNAPSHOT_PUBLICATION_FAILED" : diagnosticCode(error);
      this.#projection.recordFailure(this.#athleteId, code);
      await this.#client.reportFailure?.(token, code).catch(() => undefined);
      throw error;
    }
  }

  async syncAndPublish(loadSelectedContext, syncOptions) {
    if (typeof loadSelectedContext !== "function") throw new Error("A selected Second Brain context loader is required");
    const sync = await outcome(() => this.sync(syncOptions));
    const source = await outcome(loadSelectedContext);
    const publication = source.status === "fulfilled"
      ? await outcome(() => this.publishSelectedSecondBrain(source.value))
      : await outcome(() => this.drainSelectedSecondBrainOutbox());
    return { sync, source, publication };
  }

  async publishApprovedPlan(plan) {
    const token = await this.#credentialStore.load();
    if (!token) throw new Error("No paired device credential is stored");
    return this.#client.publishApprovedPlan(token, plan);
  }
}

function diagnosticCode(error) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  return "LOCAL_SYNC_FAILED";
}

function sameSnapshot(left, right) {
  return left.athleteId === right.athleteId
    && left.revision === right.revision
    && left.contentHash === right.contentHash
    && left.publishedAt === right.publishedAt
    && JSON.stringify(left) === JSON.stringify(right);
}

async function outcome(operation) {
  try {
    return { status: "fulfilled", value: await operation() };
  } catch (error) {
    return { status: "rejected", error };
  }
}
