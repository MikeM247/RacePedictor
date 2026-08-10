import { createHash, randomUUID } from "node:crypto";
import {
  canonicalSecondBrainHashInput,
  secondBrainContextSnapshotSchema,
} from "../../../core/src/contracts/second-brain-context.ts";
import { assertAthleteOwnership, assertAthleteScope } from "./athlete-scope.js";

export class SecondBrainSnapshotConflictError extends Error {
  constructor(code) {
    super("Second Brain snapshot conflicts with immutable history");
    this.name = "SecondBrainSnapshotConflictError";
    this.code = code;
  }
}
export class PrismaSecondBrainSnapshotRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.secondBrainSnapshot || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma Second Brain snapshot client is required");
    }
    this.#prisma = prisma;
  }

  async storeImmutable(scope, snapshot, pairedDeviceId) {
    const athleteId = assertAthleteScope(scope);
    const parsed = secondBrainContextSnapshotSchema.parse(snapshot);
    assertAthleteOwnership(scope, parsed.athleteId);
    verifyHash(parsed);
    if (typeof pairedDeviceId !== "string" || !pairedDeviceId) throw new Error("Paired device is required");

    return this.#prisma.$transaction(async (transaction) => {
      const device = await transaction.pairedDevice.findUnique({
        where: { id_athleteId: { id: pairedDeviceId, athleteId } },
      });
      if (!device || device.status !== "active") throw new Error("Paired device is unavailable");
      const [atRevision, byHash, latest] = await Promise.all([
        transaction.secondBrainSnapshot.findUnique({
          where: { athleteId_sourceRevision: { athleteId, sourceRevision: parsed.revision } },
        }),
        transaction.secondBrainSnapshot.findUnique({
          where: { athleteId_contentHash: { athleteId, contentHash: parsed.contentHash } },
        }),
        transaction.secondBrainSnapshot.findFirst({
          where: { athleteId },
          orderBy: { sourceRevision: "desc" },
        }),
      ]);
      if (atRevision) {
        const existing = toSnapshot(atRevision);
        if (JSON.stringify(existing) === JSON.stringify(parsed)) return { snapshot: existing, reused: true };
        throw new SecondBrainSnapshotConflictError("REVISION_CONFLICT");
      }
      if (byHash) throw new SecondBrainSnapshotConflictError("DUPLICATE_CONTENT");
      const expected = latest ? latest.sourceRevision + 1 : 1;
      if (parsed.revision < expected) throw new SecondBrainSnapshotConflictError("STALE_REVISION");
      if (parsed.revision > expected) throw new SecondBrainSnapshotConflictError("REVISION_GAP");
      const row = await transaction.secondBrainSnapshot.create({
        data: {
          id: `snapshot_${randomUUID().replaceAll("-", "")}`,
          athleteId,
          pairedDeviceId,
          schemaVersion: parsed.schemaVersion,
          sourceRevision: parsed.revision,
          contentHash: parsed.contentHash,
          selectedFields: parsed.selectedFields,
          context: parsed.context,
          publishedAt: new Date(parsed.publishedAt),
        },
      });
      return { snapshot: toSnapshot(row), reused: false };
    });
  }

  async latest(scope) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.secondBrainSnapshot.findFirst({
      where: { athleteId },
      orderBy: { sourceRevision: "desc" },
    });
    return row ? toSnapshot(row) : null;
  }
}

function toSnapshot(row) {
  return secondBrainContextSnapshotSchema.parse({
    schemaVersion: row.schemaVersion,
    athleteId: row.athleteId,
    revision: row.sourceRevision,
    publishedAt: row.publishedAt.toISOString(),
    contentHash: row.contentHash,
    selectedFields: row.selectedFields,
    context: row.context,
  });
}

function verifyHash(snapshot) {
  const expected = createHash("sha256")
    .update(canonicalSecondBrainHashInput(snapshot), "utf8")
    .digest("hex");
  if (snapshot.contentHash !== expected) throw new Error("Second Brain snapshot content hash is invalid");
}
