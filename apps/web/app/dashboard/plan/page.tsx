import { PlanPage } from "../../../components/coaching/coaching-pages";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment";

export const dynamic = "force-dynamic";

export default function PlanRoute() {
  const environment = readCloudEnvironment();
  const onlineMode = shouldRenderOnlineUi(environment);
  return <PlanPage onlineMode={onlineMode} />;
}
