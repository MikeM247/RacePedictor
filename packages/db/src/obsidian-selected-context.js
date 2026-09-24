import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { secondBrainContextSchema, secondBrainSelectedFieldSchema } from "../../core/src/contracts/second-brain-context.ts";

export const SELECTED_SECOND_BRAIN_CONTEXT_RELATIVE_PATH = path.join(
  "RacePredictor",
  "second-brain-context.v1.json",
);

const logicalSourceReferenceSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u, "Expected a logical source reference without a path");

const selectedSecondBrainSourceSchema = z.object({
  selectedFields: z.array(secondBrainSelectedFieldSchema)
    .min(1)
    .max(5)
    .refine((fields) => new Set(fields).size === fields.length, "Selected Second Brain fields must be unique"),
  context: secondBrainContextSchema,
  logicalSourceRefs: z.array(logicalSourceReferenceSchema)
    .max(20)
    .refine((references) => new Set(references).size === references.length, "Logical source references must be unique")
    .optional(),
}).strict();

export function selectedSecondBrainContextPath(vaultPath) {
  if (typeof vaultPath !== "string" || !vaultPath) throw new Error("vaultPath is required");
  return path.join(vaultPath, SELECTED_SECOND_BRAIN_CONTEXT_RELATIVE_PATH);
}

export function parseSelectedSecondBrainSource(rawSource) {
  const parsed = selectedSecondBrainSourceSchema.parse(rawSource);
  const present = Object.keys(parsed.context);
  if (present.length !== parsed.selectedFields.length
    || present.some((field) => !parsed.selectedFields.includes(field))) {
    throw new Error("Selected Second Brain fields must exactly match the sections present in context");
  }
  return {
    selectedFields: parsed.selectedFields,
    sourceContext: parsed.context,
    logicalSourceRefs: parsed.logicalSourceRefs ?? [],
  };
}

export async function readSelectedSecondBrainSource({ vaultPath }) {
  const sourcePath = selectedSecondBrainContextPath(vaultPath);
  let raw;
  try {
    raw = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("Selected Second Brain context source is missing");
    }
    throw error;
  }
  let source;
  try {
    source = JSON.parse(raw);
  } catch {
    throw new Error("Selected Second Brain context source must contain valid JSON");
  }
  return parseSelectedSecondBrainSource(source);
}
