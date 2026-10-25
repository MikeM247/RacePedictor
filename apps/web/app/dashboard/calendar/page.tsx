import { CalendarPage } from "../../../components/coaching/coaching-pages";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment";

type CalendarSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarRoute({ searchParams }: { searchParams: CalendarSearchParams }) {
  const params = await searchParams;
  const initialDate = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : undefined;
  const focusSessionId = typeof params.session === "string" ? params.session : undefined;
  const environment = readCloudEnvironment();
  return <CalendarPage
    initialDate={initialDate}
    focusSessionId={focusSessionId}
    onlineMode={shouldRenderOnlineUi(environment)}
  />;
}
