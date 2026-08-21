import { createHash } from "node:crypto";
import {
  SECOND_BRAIN_CONTEXT_SCHEMA_VERSION,
  canonicalSecondBrainHashInput,
  secondBrainContextSchema,
  secondBrainContextSnapshotSchema,
  secondBrainSelectedFieldSchema,
  type SecondBrainContext,
  type SecondBrainSelectedField,
} from "../contracts/second-brain-context.ts";

export function buildSelectedSecondBrainSnapshot(input: {
  athleteId: string;
  revision: number;
  publishedAt: string;
  selectedFields: readonly SecondBrainSelectedField[];
  sourceContext: unknown;
}) {
  const selectedFields = [...input.selectedFields].map((field) => secondBrainSelectedFieldSchema.parse(field));
  if (new Set(selectedFields).size !== selectedFields.length) throw new Error("Selected Second Brain fields must be unique");
  const source = secondBrainContextSchema.parse(input.sourceContext);
  const context = Object.fromEntries(selectedFields.map((field) => {
    const value = source[field];
    if (value === undefined) throw new Error(`Selected Second Brain field ${field} is unavailable`);
    return [field, value];
  })) as SecondBrainContext;
  const hashInput = {
    schemaVersion: SECOND_BRAIN_CONTEXT_SCHEMA_VERSION,
    athleteId: input.athleteId,
    selectedFields,
    context,
  };
  const contentHash = createHash("sha256")
    .update(canonicalSecondBrainHashInput(hashInput), "utf8")
    .digest("hex");
  return secondBrainContextSnapshotSchema.parse({
    ...hashInput,
    revision: input.revision,
    publishedAt: input.publishedAt,
    contentHash,
  });
}
