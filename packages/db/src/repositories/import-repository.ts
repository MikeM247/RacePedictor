import type { ImportStatus, Prisma, StagingRowStatus } from "@prisma/client";

export type ImportCreateInput = Prisma.ImportCreateInput;

export interface ImportProgressPatch {
  stagedCount?: number;
  normalizedCount?: number;
  duplicateCount?: number;
  rejectedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  parseWarnings?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  status?: ImportStatus;
}

export interface ImportRecord {
  id: string;
  athleteId: string;
  status: ImportStatus;
  idempotencyKey: string | null;
  stagedCount: number;
  normalizedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  skippedCount: number;
  errorCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  parseWarnings: Prisma.JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RawFileCreateInput = Prisma.RawFileCreateInput;

export interface RawFileRecord {
  id: string;
  importId: string;
  athleteId: string;
  sourceType: string;
  filename: string;
  mimeType: string | null;
  byteSize: number | null;
  checksum: string;
  storagePath: string | null;
  parserVersion: string | null;
  parseWarnings: Prisma.JsonValue | null;
  createdAt: Date;
}

export type StagingActivityCreateManyInput = Prisma.StagingActivityCreateManyInput;

export interface StagingActivityRecord {
  id: string;
  importId: string;
  rawFileId: string | null;
  athleteId: string;
  sourceType: string;
  sourceActivityId: string | null;
  dedupeHash: string | null;
  occurredAt: Date | null;
  endedAt: Date | null;
  elapsedTimeS: number | null;
  distanceM: Prisma.Decimal | null;
  sport: string | null;
  status: StagingRowStatus;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportRepository {
  create(data: ImportCreateInput): Promise<{ id: string }>;
  updateProgress(importId: string, patch: ImportProgressPatch): Promise<void>;
}

export interface RawFileRepository {
  create(data: RawFileCreateInput): Promise<{ id: string }>;
}

export interface StagingActivityRepository {
  createMany(data: StagingActivityCreateManyInput[]): Promise<number>;
}

export function buildNormalizeCursor(stagingIndex: number): string {
  return `idx:${stagingIndex}`;
}
