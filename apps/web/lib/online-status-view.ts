import type { OnlineStatus, OnlineSignalState } from "../../../packages/core/src/contracts/sync.ts";

export const onlineSignalStateLabel: Record<OnlineSignalState, string> = {
  never: "Not available yet",
  current: "Current",
  stale: "Stale",
  retrying: "Retrying",
  action_required: "Action required",
  unavailable: "Unavailable",
};

export function toOnlineStatusSignals(status: OnlineStatus) {
  return [
    {
      key: "activities",
      label: "Workout data",
      state: status.activityData.state,
      detail: status.activityData.lastCanonicalUpdateAt,
      suffix: null,
    },
    {
      key: "ingestion",
      label: "Strava ingestion",
      state: status.ingestion.state,
      detail: status.ingestion.lastEventAt,
      suffix: status.ingestion.pendingJobs > 0 ? `${status.ingestion.pendingJobs} pending` : null,
    },
    {
      key: "provider",
      label: "Strava connection",
      state: status.providerConnection.state,
      detail: status.providerConnection.lastProviderContactAt,
      suffix: null,
    },
    {
      key: "second-brain",
      label: "Second Brain context",
      state: status.secondBrain.state,
      detail: status.secondBrain.publishedAt,
      suffix: status.secondBrain.latestRevision ? `Revision ${status.secondBrain.latestRevision}` : null,
    },
    {
      key: "local-device",
      label: "Local sync device",
      state: status.localDevice.state,
      detail: status.localDevice.lastSeenAt,
      suffix: status.localDevice.deviceName
        ? `${status.localDevice.deviceName}${status.localDevice.pairedAt ? ` · paired ${new Date(status.localDevice.pairedAt).toLocaleDateString()}` : ""}`
        : null,
    },
  ] as const;
}
