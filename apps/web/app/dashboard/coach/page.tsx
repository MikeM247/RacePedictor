import { redirect } from "next/navigation";
import { CoachChatShell } from "../../../components/coaching/coach-chat-shell";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const environment = readCloudEnvironment();
  if (!shouldRenderOnlineUi(environment) || !environment.features.coachUi) redirect("/dashboard");
  return <CoachChatShell />;
}
