import { CloudEnvironmentError, publicCloudEnvironmentStatus, readCloudEnvironment } from "../../../../lib/server/cloud-environment.ts";
import { failure, success } from "../../../../lib/server/api-response.ts";

export const dynamic = "force-dynamic";

/**
 * Deliberately unauthenticated and non-sensitive. It is safe for deployment
 * probes because it exposes status only, never credentials or service URLs.
 */
export async function GET() {
  try {
    const environment = readCloudEnvironment();
    const healthy = environment.runtime !== "production" || environment.ownerAuthConfigured;
    return success({
      status: healthy ? "ok" : "degraded",
      ...publicCloudEnvironmentStatus(environment),
    }, healthy ? 200 : 503);
  } catch (error) {
    if (error instanceof CloudEnvironmentError) {
      return failure(error);
    }
    return failure(error);
  }
}
