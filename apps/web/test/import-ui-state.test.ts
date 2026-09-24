import assert from "node:assert/strict";
import test from "node:test";
import { importUploadResponseSchema } from "../../../packages/core/src/contracts/imports.ts";
import { canStartImport, fileImportPresentation } from "../lib/import-ui-state.ts";

const base = {
  importId: "import_test_01", status: "completed" as const, sourceType: "gpx" as const,
  stagedCount: 3, normalizedCount: 3, duplicateCount: 0, rejectedCount: 0, parseWarnings: [],
};

test("file outcome keeps accepted, duplicates, rejections, warnings, reuse and processing distinct", () => {
  assert.match(fileImportPresentation(importUploadResponseSchema.parse(base)).consequence, /Accepted activities/u);
  const duplicate = fileImportPresentation(importUploadResponseSchema.parse({ ...base, normalizedCount: 0, duplicateCount: 3 }));
  assert.match(duplicate.consequence, /already in Training/u);
  assert.equal(duplicate.action, "return");
  const rejected = fileImportPresentation(importUploadResponseSchema.parse({ ...base, normalizedCount: 2, rejectedCount: 1 }));
  assert.equal(rejected.action, "correct");
  assert.match(rejected.consequence, /rejected rows/u);
  const warning = fileImportPresentation(importUploadResponseSchema.parse({ ...base, parseWarnings: ["/private/path: analytics snapshot failed"], analyticsRefreshed: false }));
  assert.match(warning.consequence, /assessment remains older/u);
  assert.doesNotMatch(warning.warnings[0], /private\/path/u);
  const reused = fileImportPresentation(importUploadResponseSchema.parse({ ...base, reused: true }));
  assert.match(reused.consequence, /existing import/u);
  const processing = fileImportPresentation(importUploadResponseSchema.parse({ ...base, status: "normalizing", normalizedCount: undefined }));
  assert.equal(processing.statusLabel, "Processing");
  assert.equal(processing.counts.find((item) => item.label === "Normalized")?.value, "Not confirmed");
  const failed = fileImportPresentation(importUploadResponseSchema.parse({ ...base, status: "failed", normalizedCount: undefined }));
  assert.equal(failed.statusLabel, "Failed");
  assert.match(failed.consequence, /not confirmed/u);
  assert.doesNotMatch(failed.consequence, /Accepted activities/u);
});

test("file submission dispatch guard allows exactly one pending request", () => {
  assert.equal(canStartImport(false, true), true);
  assert.equal(canStartImport(true, true), false);
  assert.equal(canStartImport(false, false), false);
});
