import { ActivitiesShell } from "../../../components/activities/activities-shell";
import { getActivities } from "../../../lib/local-activities-data-source";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment.ts";

export const dynamic = "force-dynamic";

export default function ActivitiesPage() {
  if (readCloudEnvironment().cloudMode === "enabled") {
    return <ActivitiesShell initialData={{ items: [] }} onlineMode />;
  }
  try {
    const initialData = getActivities({ limit: 40 });
    return <ActivitiesShell initialData={initialData} />;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown data error";
    return <ActivitiesShell initialData={{ items: [] }} initialError={`Activities could not be loaded. ${detail}`} />;
  }
}
