import { buildActorContext } from "../../../../packages/core/src/contracts/auth.ts";
import { createServerAuth } from "./auth.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("composition");

/** Production stays closed unless both the M8 flag and real GitHub owner configuration are present. */
export function getServerAuth() {
  const environment = readCloudEnvironment();
  const testActorEnabled = environment.runtime !== "production"
    && process.env.RACEPREDICTOR_DATA_SOURCE === "online-fixture"
    && process.env.RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED === "true";
  return createServerAuth({
    environment,
    // This fixed actor exists only in explicitly enabled online-fixture browser
    // runs. It is never read from a request and createServerAuth ignores it in
    // production, where only the configured GitHub owner resolver is accepted.
    syntheticActorResolver: testActorEnabled ? () => buildActorContext({
      userId: "racepredictor-e2e-owner",
      permittedAthleteIds: ["racepredictor-e2e-athlete"],
      activeAthleteId: "racepredictor-e2e-athlete",
      requestId: "racepredictor-e2e-request",
      credentialKind: "session",
    }) : undefined,
    productionActorResolver: async (request) => {
      const { resolveConfiguredOwnerActor } = await import("./github-owner-auth.ts");
      return resolveConfiguredOwnerActor(request);
    },
  });
}
