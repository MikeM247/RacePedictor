import type { ImportUploadResponse } from "../../../packages/core/src/contracts/imports.ts";

/** Presentation rules for the existing upload contract.  This intentionally
 * does not infer domain completion from a successful HTTP response. */
export type FileImportPresentation = {
  statusLabel: string;
  counts: Array<{ label: string; value: number | "Not confirmed" }>;
  consequence: string;
  action: "return" | "correct" | "check";
  warnings: string[];
};

export function fileImportPresentation(result: ImportUploadResponse): FileImportPresentation {
  const processing = result.status === "uploaded" || result.status === "normalizing";
  const normalized = typeof result.normalizedCount === "number" ? result.normalizedCount : "Not confirmed";
  const warningCount = result.parseWarnings.length;
  const rejected = result.rejectedCount > 0;
  const duplicateOnly = !processing && !rejected && warningCount === 0 && normalized === 0 && result.duplicateCount > 0;
  const reused = result.reused === true;

  let consequence: string;
  let action: FileImportPresentation["action"];
  if (result.status === "failed") {
    consequence = "The server reported this import as failed. Whether any records were added is not confirmed, so this is not presented as accepted history.";
    action = "check";
  } else if (processing) {
    consequence = "The file is staged or processing; completed activity normalization has not been confirmed.";
    action = "check";
  } else if (rejected) {
    consequence = "Some source records were not added. Accepted records remain available, but the rejected rows need correction in the source file.";
    action = "correct";
  } else if (duplicateOnly) {
    consequence = "These records were already in Training and were not added again. Duplicate records alone do not need correction.";
    action = "return";
  } else if (reused) {
    consequence = "This response describes an existing import. It does not mean this attempt added new activities.";
    action = "return";
  } else if (warningCount > 0 || result.analyticsRefreshed === false) {
    consequence = result.analyticsRefreshed === false
      ? "The accepted history may be available while the assessment remains older because analytics refresh was not confirmed."
      : "The import completed with a recorded limitation. Review and prediction readiness remain separate from import acceptance.";
    action = "return";
  } else {
    consequence = "Accepted activities can be viewed in Training. Import acceptance does not establish that a review, prediction, or readiness assessment has recomputed.";
    action = "return";
  }

  return {
    statusLabel: processing ? (result.status === "uploaded" ? "Staged" : "Processing") : result.status === "failed" ? "Failed" : "Completed",
    counts: [
      { label: "Staged", value: result.stagedCount },
      { label: "Normalized", value: normalized },
      { label: "Duplicates", value: result.duplicateCount },
      { label: "Rejected", value: result.rejectedCount },
      { label: "Warnings", value: warningCount },
    ],
    consequence,
    action,
    warnings: safeImportWarnings(result.parseWarnings),
  };
}

/** Upload parsing may contain local implementation errors. Never echo those
 * errors, paths, or file contents in routine UI copy. */
export function safeImportWarnings(warnings: readonly string[]) {
  if (warnings.length === 0) return [];
  return warnings.map((warning) => {
    if (/analytics snapshot|analytics refresh/iu.test(warning)) {
      return "Activity history was accepted, but the analytics refresh was not confirmed.";
    }
    const row = warning.match(/\b(?:row|record)\s+(\d+)\b/iu);
    return row ? `Source row ${row[1]} needs attention.` : "The import reported a limitation that cannot be safely detailed here.";
  });
}

export function canStartImport(isPending: boolean, hasFile: boolean) {
  return !isPending && hasFile;
}
