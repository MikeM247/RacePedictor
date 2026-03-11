import type { ImportStatus, Prisma, StagingNormalizeStatus } from "@prisma/client";

export type ImportCreateInput = Prisma.ImportCreateInput;

export interface ImportProgressPatch {
  stagedCount?: number;
  normalizedCount?: number;
  duplicateCount?: number;
  rejectedCount?: number;
  errorCount?: number;
  normalizeCursor?: string | null;
  normalizeHasMore?: boolean;
  status?: ImportStatus;
}

export interface ImportRecord {
  id: string;
  status: ImportStatus;
  sourceType: string;
  idempotencyKey: string | null;
  stagedCount: number;
  normalizedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorCount: number;
  normalizeCursor: string | null;
  normalizeHasMore: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RawFileCreateInput = Prisma.RawFileCreateInput;

export interface RawFileRecord {
  id: string;
  importId: string;
  fileName: string;
  fileChecksum: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  parserSummary: string | null;
  metadataSummary: string | null;
  createdAt: Date;
}

export type StagingActivityCreateManyInput = Prisma.StagingActivityCreateManyInput;

export interface StagingActivityRecord {
  id: string;
  importId: string;
  athleteId: string;
  sourceType: string;
  stagingIndex: number;
  normalizeStatus: StagingNormalizeStatus;
  sourceActivityId: string | null;
  dedupeHash: string | null;
  occurredAt: Date | null;
  parsePayload: string | null;
  parseError: string | null;
  normalizedActivityId: string | null;
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
