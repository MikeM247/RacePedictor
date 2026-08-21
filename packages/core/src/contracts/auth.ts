import { z } from "zod";

const scopedIdSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, "Expected a stable identifier");

export const actorCredentialKindSchema = z.enum(["session", "device", "internal"]);

export const actorContextInputSchema = z.object({
  userId: scopedIdSchema,
  permittedAthleteIds: z.array(scopedIdSchema).min(1).max(100),
  activeAthleteId: scopedIdSchema,
  requestId: scopedIdSchema,
  credentialKind: actorCredentialKindSchema,
}).strict();

export const actorContextSchema = actorContextInputSchema.superRefine((actor, ctx) => {
  if (new Set(actor.permittedAthleteIds).size !== actor.permittedAthleteIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permittedAthleteIds"],
      message: "Permitted athlete ids must be unique",
    });
  }
  if (!actor.permittedAthleteIds.includes(actor.activeAthleteId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activeAthleteId"],
      message: "Active athlete must be included in permitted athlete ids",
    });
  }
});

export type ActorCredentialKind = z.infer<typeof actorCredentialKindSchema>;
export type ActorContextInput = z.input<typeof actorContextInputSchema>;
type ParsedActorContext = z.infer<typeof actorContextSchema>;
export type ActorContext = Readonly<Omit<ParsedActorContext, "permittedAthleteIds"> & {
  permittedAthleteIds: readonly string[];
}>;

export type AthleteScope = Readonly<{
  actor: ActorContext;
  athleteId: string;
}>;

export const buildActorContext = (input: ActorContextInput): ActorContext => {
  const parsed = actorContextSchema.parse(input);
  return Object.freeze({
    ...parsed,
    permittedAthleteIds: Object.freeze([...parsed.permittedAthleteIds]),
  });
};

export const assertActorCanAccessAthlete = (
  actor: ActorContext,
  athleteId: string,
): void => {
  if (!actor.permittedAthleteIds.includes(athleteId)) {
    throw new Error("Actor is not authorized for the requested athlete");
  }
};

export const athleteScopeFor = (
  actor: ActorContext,
  athleteId: string = actor.activeAthleteId,
): AthleteScope => {
  assertActorCanAccessAthlete(actor, athleteId);
  return Object.freeze({ actor, athleteId });
};
