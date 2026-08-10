import assert from "node:assert/strict";
import test from "node:test";
import { onlineStatusSchema } from "../src/contracts/sync.ts";
import { projectOnlineStatus, type OnlineStatusFacts } from "../src/services/online-status.ts";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function facts(overrides: Partial<OnlineStatusFacts> = {}): OnlineStatusFacts {
  return {
    athleteId: "athlete-a",
    provider: {
      displayStatus: "connected",
      connectedAt: "2026-08-01T12:00:00.000Z",
      lastProviderContactAt: "2026-08-10T11:55:00.000Z",
    },
    ingestion: {
      lastEventAt: "2026-08-10T11:50:00.000Z",
      lastCanonicalUpdateAt: "2026-08-10T11:51:00.000Z",
      pendingJobs: 0,
      failedJobs: 0,
    },
    latestActivityAt: "2026-08-10T10:00:00.000Z",
    device: { name: "Home computer", status: "active", createdAt: "2026-08-01T10:00:00.000Z", lastSeenAt: "2026-08-10T11:00:00.000Z", lastErrorCode: null },
    secondBrain: { revision: 4, publishedAt: "2026-08-10T06:00:00.000Z" },
    ...overrides,
  };
}

test("online status keeps provider, ingestion, activities, local device, and Second Brain independent", () => {
  const status = projectOnlineStatus(facts(), NOW);
  assert.equal(onlineStatusSchema.safeParse(status).success, true);
  assert.deepEqual([
    status.providerConnection.state,
    status.ingestion.state,
    status.activityData.state,
    status.localDevice.state,
    status.secondBrain.state,
  ], ["current", "current", "current", "current", "current"]);
  assert.equal(status.secondBrain.latestRevision, 4);
  assert.equal(status.ingestion.pendingJobs, 0);
});

test("pending and failed jobs are retrying/action-required without making stored activities unavailable", () => {
  const pending = projectOnlineStatus(facts({
    ingestion: {
      lastEventAt: "2026-08-10T11:59:00.000Z",
      lastCanonicalUpdateAt: "2026-08-10T11:51:00.000Z",
      pendingJobs: 2,
      failedJobs: 0,
    },
  }), NOW);
  assert.equal(pending.ingestion.state, "retrying");
  assert.equal(pending.activityData.state, "stale");

  const failed = projectOnlineStatus(facts({
    ingestion: { ...pending.ingestion, pendingJobs: 0, failedJobs: 1 },
  }), NOW);
  assert.equal(failed.ingestion.state, "action_required");
  assert.equal(failed.activityData.latestActivityAt, "2026-08-10T10:00:00.000Z");
});

test("offline local device and stale Second Brain do not make cloud workouts stale", () => {
  const status = projectOnlineStatus(facts({
    device: { name: "Home computer", status: "active", createdAt: "2026-08-01T10:00:00.000Z", lastSeenAt: "2026-08-08T10:00:00.000Z", lastErrorCode: null },
    secondBrain: { revision: 3, publishedAt: "2026-08-07T10:00:00.000Z" },
  }), NOW);
  assert.equal(status.activityData.state, "current");
  assert.equal(status.localDevice.state, "stale");
  assert.equal(status.secondBrain.state, "stale");
});

test("never, disconnected, revoked, and provider-error states remain truthful", () => {
  const never = projectOnlineStatus(facts({
    provider: null,
    ingestion: { lastEventAt: null, lastCanonicalUpdateAt: null, pendingJobs: 0, failedJobs: 0 },
    latestActivityAt: null,
    device: null,
    secondBrain: null,
  }), NOW);
  assert.deepEqual([
    never.providerConnection.state,
    never.ingestion.state,
    never.activityData.state,
    never.localDevice.state,
    never.secondBrain.state,
  ], ["never", "never", "never", "never", "never"]);

  const revoked = projectOnlineStatus(facts({
    provider: { displayStatus: "action_required", connectedAt: "2026-08-01T00:00:00.000Z", lastProviderContactAt: null },
  }), NOW);
  assert.equal(revoked.providerConnection.state, "action_required");
  assert.equal(revoked.ingestion.state, "action_required");

  const error = projectOnlineStatus(facts({
    provider: { displayStatus: "error", connectedAt: "2026-08-01T00:00:00.000Z", lastProviderContactAt: null },
  }), NOW);
  assert.equal(error.providerConnection.state, "unavailable");
  assert.equal(error.ingestion.state, "unavailable");
});

test("revoked and failed devices are action-required or unavailable without affecting workouts", () => {
  const revoked = projectOnlineStatus(facts({
    device: { name: "Home computer", status: "revoked", createdAt: "2026-08-01T10:00:00.000Z", lastSeenAt: null, lastErrorCode: null },
  }), NOW);
  assert.equal(revoked.localDevice.state, "action_required");
  assert.equal(revoked.localDevice.deviceStatus, "revoked");
  assert.equal(revoked.activityData.state, "current");

  const failed = projectOnlineStatus(facts({
    device: { name: "Home computer", status: "active", createdAt: "2026-08-01T10:00:00.000Z", lastSeenAt: NOW.toISOString(), lastErrorCode: "LOCAL_WRITE_FAILED" },
  }), NOW);
  assert.equal(failed.localDevice.state, "unavailable");
  assert.equal(failed.localDevice.lastErrorCode, "LOCAL_WRITE_FAILED");
});
