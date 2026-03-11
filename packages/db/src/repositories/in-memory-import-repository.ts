import type {
  ImportCreateInput,
  ImportProgressPatch,
  ImportRecord,
  ImportRepository,
  RawFileCreateInput,
  RawFileRecord,
  RawFileRepository,
  StagingActivityCreateManyInput,
  StagingActivityRecord,
  StagingActivityRepository,
} from "./import-repository";

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class InMemoryImportRepository implements ImportRepository {
  private readonly records = new Map<string, ImportRecord>();

  async create(data: ImportCreateInput): Promise<{ id: string }> {
    const id = randomId("imp");
    this.records.set(id, {
      id,
      status: data.status ?? "uploaded",
      sourceType: String(data.sourceType),
      idempotencyKey: data.idempotencyKey ?? null,
      stagedCount: data.stagedCount ?? 0,
      normalizedCount: data.normalizedCount ?? 0,
      duplicateCount: data.duplicateCount ?? 0,
      rejectedCount: data.rejectedCount ?? 0,
      errorCount: data.errorCount ?? 0,
      normalizeCursor: data.normalizeCursor ?? null,
      normalizeHasMore: data.normalizeHasMore ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { id };
  }

  async updateProgress(importId: string, patch: ImportProgressPatch): Promise<void> {
    const current = this.records.get(importId);
    if (!current) return;
    this.records.set(importId, {
      ...current,
      ...patch,
      updatedAt: new Date(),
    });
  }
}

export class InMemoryRawFileRepository implements RawFileRepository {
  private readonly records = new Map<string, RawFileRecord>();

  async create(data: RawFileCreateInput): Promise<{ id: string }> {
    const id = randomId("raw");
    this.records.set(id, {
      id,
      importId: String(data.import.connect?.id),
      fileName: data.fileName,
      fileChecksum: data.fileChecksum,
      fileSizeBytes: data.fileSizeBytes ?? null,
      mimeType: data.mimeType ?? null,
      parserSummary: data.parserSummary ?? null,
      metadataSummary: data.metadataSummary ?? null,
      createdAt: new Date(),
    });
    return { id };
  }
}

export class InMemoryStagingActivityRepository implements StagingActivityRepository {
  private readonly records: StagingActivityRecord[] = [];

  async createMany(data: StagingActivityCreateManyInput[]): Promise<number> {
    for (const item of data) {
      this.records.push({
        id: randomId("stg"),
        importId: item.importId,
        athleteId: item.athleteId,
        sourceType: String(item.sourceType),
        stagingIndex: item.stagingIndex,
        normalizeStatus: item.normalizeStatus ?? "pending",
        sourceActivityId: item.sourceActivityId ?? null,
        dedupeHash: item.dedupeHash ?? null,
        occurredAt: item.occurredAt ?? null,
        parsePayload: item.parsePayload ?? null,
        parseError: item.parseError ?? null,
        normalizedActivityId: item.normalizedActivityId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return data.length;
  }
}
