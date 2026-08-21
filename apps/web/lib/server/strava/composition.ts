import { createHash, randomBytes } from "node:crypto";
import { createStravaConnectionService } from "../../../../../packages/core/src/use-cases/strava-connection.ts";
import {
  CredentialEnvelopeCrypto,
  getCloudPrismaClient,
  PrismaProviderConnectionRepository,
  PrismaProviderOAuthAttemptRepository,
} from "../../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "../server-runtime.ts";
import { readStravaConnectionConfiguration } from "./configuration.ts";
import { createStravaOAuthClient } from "./oauth-client.ts";

assertServerRuntime("strava/composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const configuration = readStravaConnectionConfiguration();
  const credentialCrypto = new CredentialEnvelopeCrypto({
    activeKeyVersion: configuration.tokenEncryptionKeyVersion,
    keys: {
      [configuration.tokenEncryptionKeyVersion]: configuration.tokenEncryptionKey,
    },
  });
  const prisma = getCloudPrismaClient();
  const connections = new PrismaProviderConnectionRepository({ prisma, credentialCrypto });
  return Object.freeze({
    redirectUri: configuration.redirectUri,
    prisma,
    connections,
    service: createStravaConnectionService({
      provider: createStravaOAuthClient(configuration),
      connections,
      attempts: new PrismaProviderOAuthAttemptRepository({ prisma }),
      now: () => new Date(),
      createOpaqueState: () => randomBytes(32).toString("base64url"),
      hashState: (state) => createHash("sha256").update(state, "utf8").digest("hex"),
    }),
  });
}

export function getStravaConnectionComposition() {
  singleton ??= buildComposition();
  return singleton;
}
