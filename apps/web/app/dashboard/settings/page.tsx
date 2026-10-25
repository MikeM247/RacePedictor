import { SettingsPage } from "../../../components/coaching/coaching-pages";
import { OnlineSyncSettings } from "../../../components/sync/online-sync-settings.tsx";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode.ts";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment.ts";

export const dynamic = "force-dynamic";

export default function SettingsRoute() {
  const environment = readCloudEnvironment();
  return shouldRenderOnlineUi(environment) ? <OnlineSyncSettings /> : <SettingsPage />;
}
