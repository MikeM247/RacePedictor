import { readCloudEnvironment, type CloudEnvironment } from "./cloud-environment.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("online-ui-mode");

export function shouldRenderOnlineUi(
  environment: CloudEnvironment = readCloudEnvironment(),
  dataSource = process.env.RACEPREDICTOR_DATA_SOURCE,
) {
  if (environment.cloudMode === "enabled") return true;
  return environment.runtime !== "production" && dataSource === "online-fixture";
}
