import { SettingsPage } from "../../../components/coaching/coaching-pages";
import { OnlineSyncSettings } from "../../../components/sync/online-sync-settings.tsx";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode.ts";

export const dynamic = "force-dynamic";

export default function SettingsRoute() {
  return shouldRenderOnlineUi() ? <OnlineSyncSettings /> : <SettingsPage />;
}
