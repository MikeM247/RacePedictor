import { z } from "zod";
import { activityDetailSchema } from "./activity.ts";

const id = z.string().trim().min(1).max(128);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pace = z.number().finite().positive().max(36000);
const bounds = { firstSplitIndex: z.number().int().nonnegative(), lastSplitIndex: z.number().int().nonnegative(), label: z.string().trim().min(1).max(300) };
export const paceBlockSchema = z.discriminatedUnion("kind", [
  z.object({ ...bounds, kind: z.literal("exact"), paceSecPerKm: pace }).strict(),
  z.object({ ...bounds, kind: z.literal("approximate"), paceSecPerKm: pace }).strict(),
  z.object({ ...bounds, kind: z.literal("range"), minPaceSecPerKm: pace, maxPaceSecPerKm: pace }).strict(),
  z.object({ ...bounds, kind: z.literal("effort"), guidance: z.string().trim().min(1).max(1000) }).strict(),
]);
export const paceSourceSchema = z.object({
  planId: id, planVersion: z.number().int().positive(), approvalContentHash: hash,
  sessionId: id, sessionRevision: z.number().int().positive().nullable(),
  sessionTitle: z.string().min(1).max(200), prescription: z.string().min(1).max(4000),
}).strict();
const body = {
  schema: z.literal("activity-pace-comparison.v1"), athleteId: id, activityId: id,
  splitFingerprint: hash, source: paceSourceSchema, blocks: z.array(paceBlockSchema).max(1000),
};
export const paceDraftSchema = z.object({ ...body,
  expectedActivityRevision: z.number().int().nonnegative(), expectedComparisonRevision: z.number().int().nonnegative(),
}).strict().superRefine(validateBlocks);
export const paceArtifactSchema = z.object({ ...body,
  expectedActivityRevision: z.number().int().nonnegative(), expectedComparisonRevision: z.number().int().nonnegative(),
  artifactId: id, artifactHash: hash, approvedAt: z.string().datetime({ offset: true }),
}).strict().superRefine(validateBlocks);
export const paceComparisonSchema = z.object({ ...body,
  revision: z.number().int().positive(), artifactId: id, artifactHash: hash,
  approvedAt: z.string().datetime({ offset: true }), publishedAt: z.string().datetime({ offset: true }),
}).strict().superRefine(validateBlocks);
function validateBlocks(value: { blocks: z.infer<typeof paceBlockSchema>[] }, ctx: z.RefinementCtx) {
  let previous = -1;
  value.blocks.forEach((block, index) => {
    if (block.firstSplitIndex > block.lastSplitIndex || block.firstSplitIndex <= previous) ctx.addIssue({ code: "custom", path: ["blocks", index], message: "Blocks must be ordered, non-overlapping inclusive split ranges" });
    if (block.kind === "range" && block.minPaceSecPerKm > block.maxPaceSecPerKm) ctx.addIssue({ code: "custom", path: ["blocks", index], message: "Pace range must be ordered from faster to slower" });
    previous = block.lastSplitIndex;
  });
}
export const paceComparisonReadSchema = z.object({ data: z.object({
  activityId: id, status: z.enum(["ready", "none", "stale"]), comparison: paceComparisonSchema.nullable(),
}).strict() }).strict();
export const paceContextSchema = z.object({
  activity: activityDetailSchema, activityRevision: z.number().int().nonnegative(),
  comparisonRevision: z.number().int().nonnegative(), source: paceSourceSchema,
}).strict();
export type PaceBlock = z.infer<typeof paceBlockSchema>;
export type PaceSource = z.infer<typeof paceSourceSchema>;
export type PaceDraft = z.infer<typeof paceDraftSchema>;
export type PaceArtifact = z.infer<typeof paceArtifactSchema>;
export type PaceComparison = z.infer<typeof paceComparisonSchema>;
export type PaceComparisonRead = z.infer<typeof paceComparisonReadSchema>;
export type PaceContext = z.infer<typeof paceContextSchema>;
