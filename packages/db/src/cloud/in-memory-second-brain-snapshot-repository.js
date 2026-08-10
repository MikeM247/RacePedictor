import { createHash } from "node:crypto";
import {
  canonicalSecondBrainHashInput,
  secondBrainContextSnapshotSchema,
} from "../../../core/src/contracts/second-brain-context.ts";
import { assertAthleteOwnership, assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class InMemorySecondBrainSnapshotRepository {
  #snapshotsByAthlete = new Map();

  async storeImmutable(scope, snapshot) {
    const athleteId = assertAthleteScope(scope);
    const parsed = secondBrainContextSnapshotSchema.parse(snapshot);
    assertAthleteOwnership(scope, parsed.athleteId);
    verifyContentHash(parsed);

    const snapshots = this.#snapshotsByAthlete.get(athleteId) ?? [];
    const existingAtRevision = snapshots.find((candidate) => candidate.revision === parsed.revision);
    if (existingAtRevision) {
      if (JSON.stringify(existingAtRevision) === JSON.stringify(parsed)) {
        return immutableCopy({ snapshot: existingAtRevision, reused: true });
      }
      if (parsed.revision < snapshots.at(-1).revision) {
        throw new Error("Second Brain snapshot revision is stale");
      }
      throw new Error("Second Brain snapshot revision conflicts with an immutable snapshot");
    }

    const latest = snapshots.at(-1);
    const expectedRevision = latest ? latest.revision + 1 : 1;
    if (parsed.revision < expectedRevision) throw new Error("Second Brain snapshot revision is stale");
    if (parsed.revision > expectedRevision) throw new Error("Second Brain snapshot revision is not the next monotonic revision");
    if (snapshots.some((candidate) => candidate.contentHash === parsed.contentHash)) {
      throw new Error("Second Brain snapshot content already exists at another revision");
    }

    const stored = immutableCopy(parsed);
    snapshots.push(stored);
    this.#snapshotsByAthlete.set(athleteId, snapshots);
    return immutableCopy({ snapshot: stored, reused: false });
  }

  async latest(scope) {
    const athleteId = assertAthleteScope(scope);
    const latest = this.#snapshotsByAthlete.get(athleteId)?.at(-1);
    return latest ? immutableCopy(latest) : null;
  }
}

function verifyContentHash(snapshot) {
  const expected = createHash("sha256")
    .update(canonicalSecondBrainHashInput(snapshot), "utf8")
    .digest("hex");
  if (snapshot.contentHash !== expected) {
    throw new Error("Second Brain snapshot content hash does not match its canonical content");
  }
}
