import { z } from "zod";
import { milestoneSourceSchema } from "./milestone-timeline.ts";
export const milestoneImageCatalogue = [
  {
    id: "oldies",
    title: "Oldies 10 km · Durban North",
    url: "/milestone-images/oldies-durban-north-logo.png",
  },
  {
    id: "best-of-the-best",
    title: "Best of the Best Marathon 2027",
    url: "/milestone-images/best-of-the-best-2027-logo.png",
  },
  {
    id: "comrades",
    title: "Comrades Marathon",
    url: "/milestone-images/comrades-logo.png",
  },
] as const;
export const catalogueIdSchema = z.enum([
  "oldies",
  "best-of-the-best",
  "comrades",
]);
export const imageChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("catalogue"), id: catalogueIdSchema }).strict(),
  z
    .object({
      kind: z.literal("upload"),
      id: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type ImageChoice = z.infer<typeof imageChoiceSchema>;
export const imageBindingSchema = z
  .object({
    source: milestoneSourceSchema,
    choice: imageChoiceSchema.nullable(),
    defaultCatalogueId: catalogueIdSchema.optional(),
    label: z.string().trim().max(200).optional(),
  })
  .strict();
export const imageStateSchema = z
  .object({
    schema: z.literal("milestone-images.v1"),
    bindings: z.array(imageBindingSchema).max(512),
  })
  .strict()
  .refine(
    (x) =>
      new Set(x.bindings.map((b) => `${b.source.kind}:${b.source.id}`)).size ===
      x.bindings.length,
    "Duplicate image source",
  );
export type ImageState = z.infer<typeof imageStateSchema>;
export const emptyImageState = (): ImageState => ({
  schema: "milestone-images.v1",
  bindings: [],
});
export const imageViewSchema = z.object({
  revision: z.number().int().nonnegative(),
  state: imageStateSchema,
  sourceVersion: z.string(),
  sync: z.enum(["online", "local", "pending", "conflict"]),
  cloudRevision: z.number().int().nonnegative().nullable(),
  remoteState: imageStateSchema.nullable().optional(),
});
export type ImageView = z.infer<typeof imageViewSchema>;
export const imageChangeSchema = z
  .object({
    entryId: z.string().min(1).max(300),
    expectedRevision: z.number().int().nonnegative(),
    sourceVersion: z.string().min(1).max(128),
    choice: imageChoiceSchema.nullable(),
    label: z.string().trim().max(200).optional(),
  })
  .strict();
export const imageResolutionSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    choice: imageChoiceSchema.nullable(),
  })
  .strict();
export const imageAssetTransferSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().min(1).max(512),
    height: z.number().int().min(1).max(512),
    bytes: z.string().max(700000),
  })
  .strict();
