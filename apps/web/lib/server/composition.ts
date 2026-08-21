import { createServerAuth } from "./auth.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("composition");

/** Production stays closed unless both the M8 flag and real GitHub owner configuration are present. */
export function getServerAuth() {
  const environment = readCloudEnvironment();
  return createServerAuth({
    environment,
    productionActorResolver: async (request) => {
      const { resolveConfiguredOwnerActor } = await import("./github-owner-auth.ts");
      return resolveConfiguredOwnerActor(request);
    },
  });
}
