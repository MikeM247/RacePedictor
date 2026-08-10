import assert from "node:assert/strict";
import test from "node:test";
import { projectOnlineStatus } from "../../../packages/core/src/services/online-status.ts";
import { onlineSignalStateLabel, toOnlineStatusSignals } from "../lib/online-status-view.ts";

test("online status view keeps all five freshness signals independent and truthful", () => {
  const status = projectOnlineStatus({
    athleteId: "athlete-a",
    provider: { displayStatus: "connected", connectedAt: "2026-08-01T00:00:00.000Z", lastProviderContactAt: "2026-08-10T10:00:00.000Z" },
    ingestion: { pendingJobs: 2, failedJobs: 0, lastEventAt: "2026-08-10T10:00:00.000Z", lastCanonicalUpdateAt: "2026-08-10T10:00:00.000Z" },
    latestActivityAt: "2026-08-10T09:00:00.000Z",
    device: { name: "Home computer", status: "active", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-01T00:00:00.000Z", lastErrorCode: null },
    secondBrain: { revision: 4, publishedAt: "2026-08-01T00:00:00.000Z" },
  }, new Date("2026-08-10T12:00:00.000Z"));
  const signals = toOnlineStatusSignals(status);
  assert.deepEqual(signals.map((signal) => signal.key), ["activities", "ingestion", "provider", "second-brain", "local-device"]);
  assert.equal(signals.find((signal) => signal.key === "activities")?.state, "current");
  assert.equal(signals.find((signal) => signal.key === "local-device")?.state, "stale");
  assert.equal(signals.find((signal) => signal.key === "ingestion")?.suffix, "2 pending");
  assert.match(signals.find((signal) => signal.key === "local-device")?.suffix ?? "", /Home computer · paired/u);
  assert.equal(onlineSignalStateLabel.action_required, "Action required");
});
