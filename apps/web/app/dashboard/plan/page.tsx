import { PlanPage } from "../../../components/coaching/coaching-pages";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode";

export const dynamic = "force-dynamic";

export default function PlanRoute() {
  return <PlanPage onlineMode={shouldRenderOnlineUi()} />;
}
