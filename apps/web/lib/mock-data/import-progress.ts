import {
  importProgressSchema,
  type ImportProgress,
} from "../../../../packages/core/src/contracts";

export const importProgressFixture: ImportProgress = importProgressSchema.parse({
  importId: "imp_20260220_001",
  status: "normalizing",
  stagedCount: 312,
  normalizedCount: 248,
  duplicateCount: 41,
  rejectedCount: 2,
  updatedAt: "2026-02-20T08:18:32.000Z",
});
