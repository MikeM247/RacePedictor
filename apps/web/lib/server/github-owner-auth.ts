import { randomUUID } from "node:crypto";
import { buildActorContext, type ActorContext } from "../../../../packages/core/src/contracts/auth.ts";
import type { IdentityRepository } from "../../../../packages/core/src/ports/cloud-sync.ts";
import { getCloudPrismaClient, PrismaIdentityRepository } from "../../../../packages/db/src/cloud/index.js";
import {
  readOwnerAuthConfiguration,
  type OwnerAuthConfiguration,
} from "./github-owner-configuration.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("github-owner-auth");

export type OwnerAuthSession = Readonly<{ user?: Readonly<{ id?: string | null }> | null }> | null;

export function createOwnerActorResolver(input: {
  identities: IdentityRepository;
  readSession(request: Request): Promise<OwnerAuthSession>;
  readConfiguration?: () => OwnerAuthConfiguration | null;
  requestId?: () => string;
}) {
  const readConfiguration = input.readConfiguration ?? (() => readOwnerAuthConfiguration());
  const requestId = input.requestId ?? randomUUID;

  return async (request: Request): Promise<ActorContext | null> => {
    const configuration = readConfiguration();
    if (!configuration) return null;
    const session = await input.readSession(request);
    if (session?.user?.id !== configuration.authSubject) return null;
    const identity = await input.identities.findByAuthSubject(configuration.authSubject);
    const activeAthleteId = identity?.permittedAthleteIds[0];
    if (!identity || !activeAthleteId) return null;
    return buildActorContext({
      userId: identity.userId,
      permittedAthleteIds: [...identity.permittedAthleteIds],
      activeAthleteId,
      requestId: requestId(),
      credentialKind: "session",
    });
  };
}

export async function resolveConfiguredOwnerActor(request: Request): Promise<ActorContext | null> {
  if (!readOwnerAuthConfiguration()) return null;
  const [{ auth }, prisma] = await Promise.all([
    import("../../auth.ts"),
    Promise.resolve(getCloudPrismaClient()),
  ]);
  const resolver = createOwnerActorResolver({
    identities: new PrismaIdentityRepository({ prisma }),
    readSession: async () => await auth(),
  });
  return resolver(request);
}
